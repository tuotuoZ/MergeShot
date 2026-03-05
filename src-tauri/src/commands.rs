use std::collections::HashMap;
use std::io::Write as IoWrite;
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

use crate::models::*;

/// Shared state: maps session_id -> kill-sender so we can cancel a running merge.
pub struct MergeState {
    pub cancellers: Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>,
}

impl Default for MergeState {
    fn default() -> Self {
        Self {
            cancellers: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

// ─── File discovery ───────────────────────────────────────────────────────────

/// Scan a directory recursively (1-level) for common video file extensions.
#[tauri::command]
pub async fn scan_directory(path: String) -> Result<Vec<FileMetadata>, String> {
    let video_exts = ["mp4", "mov", "avi", "mts", "m2ts", "mkv", "m4v", "mp"];
    let mut files = Vec::new();

    let dir = std::fs::read_dir(&path).map_err(|e| format!("Cannot read folder: {e}"))?;

    for entry in dir.flatten() {
        let pb = entry.path();
        if !pb.is_file() {
            continue;
        }
        let ext = pb
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !video_exts.contains(&ext.as_str()) {
            continue;
        }

        let meta = std::fs::metadata(&pb).map_err(|e| e.to_string())?;
        let mtime = meta
            .modified()
            .map(|t| {
                t.duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64
            })
            .unwrap_or(0);

        files.push(FileMetadata {
            path: pb.to_string_lossy().into_owned(),
            filename: pb
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            size: meta.len(),
            mtime,
        });
    }

    Ok(files)
}

/// Get metadata for a list of explicit file paths.
#[tauri::command]
pub async fn get_files_metadata(paths: Vec<String>) -> Result<Vec<FileMetadata>, String> {
    let video_exts = ["mp4", "mov", "avi", "mts", "m2ts", "mkv", "m4v"];
    let mut files = Vec::new();

    for path in paths {
        let pb = std::path::Path::new(&path);
        if !pb.is_file() {
            continue;
        }
        let ext = pb
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !video_exts.contains(&ext.as_str()) {
            continue;
        }

        let meta = std::fs::metadata(pb).map_err(|e| e.to_string())?;
        let mtime = meta
            .modified()
            .map(|t| {
                t.duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64
            })
            .unwrap_or(0);

        files.push(FileMetadata {
            path: path.clone(),
            filename: pb
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            size: meta.len(),
            mtime,
        });
    }

    Ok(files)
}

// ─── ffprobe ─────────────────────────────────────────────────────────────────

/// Run ffprobe on a single file and return stream/format metadata.
#[tauri::command]
pub async fn probe_file(app: AppHandle, path: String) -> Result<ProbeResult, String> {
    let output = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| format!("ffprobe not found: {e}"))?
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            &path,
        ])
        .output()
        .await
        .map_err(|e| format!("ffprobe failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe error: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("ffprobe JSON parse error: {e}"))?;

    let duration = json["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse::<f64>().ok());

    let bit_rate = json["format"]["bit_rate"]
        .as_str()
        .and_then(|b| b.parse::<u64>().ok());

    let streams = json["streams"].as_array().cloned().unwrap_or_default();

    let video = streams
        .iter()
        .find(|s| s["codec_type"].as_str() == Some("video"));

    let audio = streams
        .iter()
        .find(|s| s["codec_type"].as_str() == Some("audio"));

    let codec = video
        .and_then(|v| v["codec_name"].as_str())
        .map(String::from);

    let width = video
        .and_then(|v| v["width"].as_u64())
        .map(|w| w as u32);

    let height = video
        .and_then(|v| v["height"].as_u64())
        .map(|h| h as u32);

    let fps = video.and_then(|v| {
        v["r_frame_rate"].as_str().and_then(|r| {
            let parts: Vec<&str> = r.split('/').collect();
            if parts.len() == 2 {
                let num = parts[0].parse::<f64>().ok()?;
                let den = parts[1].parse::<f64>().ok()?;
                if den != 0.0 {
                    Some((num / den * 100.0).round() / 100.0)
                } else {
                    None
                }
            } else {
                r.parse::<f64>().ok()
            }
        })
    });

    let audio_codec = audio
        .and_then(|a| a["codec_name"].as_str())
        .map(String::from);

    Ok(ProbeResult {
        path,
        duration,
        codec,
        width,
        height,
        fps,
        bit_rate,
        audio_codec,
    })
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/// Start a merge operation. Emits events: merge-progress, merge-log, merge-complete, merge-error.
#[tauri::command]
pub async fn start_merge(
    app: AppHandle,
    state: State<'_, MergeState>,
    request: MergeRequest,
) -> Result<(), String> {
    // Write concat list to a temp file
    let temp_dir = std::env::temp_dir();
    let list_path = temp_dir.join(format!("mergeshot_{}.txt", &request.session_id));

    {
        let mut f =
            std::fs::File::create(&list_path).map_err(|e| format!("Cannot create temp file: {e}"))?;
        for clip in &request.clips {
            // ffmpeg concat demuxer requires single-quoted paths.
            // Escape any literal single-quotes in the path with \'.
            // (Double-quote format is not supported by the concat demuxer.)
            let escaped = clip.replace('\'', "\\'");
            writeln!(f, "file '{}'", escaped).map_err(|e| e.to_string())?;
        }
    }

    // Ensure output directory exists
    if let Some(parent) = std::path::Path::new(&request.output_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create output dir: {e}"))?;
    }

    let list_str = list_path.to_string_lossy().into_owned();

    // Build args
    let mut args: Vec<String> = vec![
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        list_str.clone(),
    ];

    if request.mode == "fast" {
        args.extend(["-c".into(), "copy".into()]);
    } else {
        args.extend([
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "veryfast".into(),
            "-crf".into(),
            "18".into(),
            "-c:a".into(),
            "aac".into(),
            "-b:a".into(),
            "192k".into(),
        ]);
    }

    // Progress pipe + output
    args.extend([
        "-progress".into(),
        "pipe:1".into(),
        "-stats_period".into(),
        "0.5".into(),
        "-y".into(),
        request.output_path.clone(),
    ]);

    // Build human-readable command string for logging
    let cmd_str = format!(
        "ffmpeg {}",
        args.iter()
            .map(|a| if a.contains(' ') {
                format!("\"{}\"", a)
            } else {
                a.clone()
            })
            .collect::<Vec<_>>()
            .join(" ")
    );

    // Emit the command to the log so the user can copy it
    let _ = app.emit(
        "merge-log",
        MergeLogEvent {
            session_id: request.session_id.clone(),
            line: format!("$ {cmd_str}"),
            is_stderr: false,
        },
    );

    // Spawn ffmpeg
    let (mut rx, child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("ffmpeg not found: {e}"))?
        .args(&args)
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {e}"))?;

    // Register canceller
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut map = state.cancellers.lock().await;
        map.insert(request.session_id.clone(), cancel_tx);
    }

    let cancellers = Arc::clone(&state.cancellers);
    let session_id = request.session_id.clone();
    let output_path = request.output_path.clone();
    let total_us = request.total_duration_us.unwrap_or(0);
    let app_clone = app.clone();

    // Monitor in background task
    tokio::spawn(async move {
        let mut out_time_us: i64 = 0;
        let mut speed: Option<f64> = None;
        let mut progress_map: HashMap<String, String> = HashMap::new();
        // Accumulate stderr for inclusion in error messages.
        let mut stderr_lines: Vec<String> = Vec::new();
        // Buffer for partial stdout lines across chunk boundaries.
        let mut stdout_buf = String::new();

        loop {
            tokio::select! {
                _ = &mut cancel_rx => {
                    let _ = child.kill();
                    let _ = app_clone.emit("merge-error", MergeErrorEvent {
                        session_id: session_id.clone(),
                        error: "Cancelled by user".into(),
                        command: cmd_str.clone(),
                    });
                    let _ = std::fs::remove_file(&list_path);
                    break;
                }
                event = rx.recv() => {
                    match event {
                        Some(CommandEvent::Stdout(data)) => {
                            // tauri-plugin-shell delivers raw bytes that may span
                            // multiple lines or be a partial line. Buffer and split.
                            stdout_buf.push_str(&String::from_utf8_lossy(&data));

                            while let Some(nl) = stdout_buf.find('\n') {
                                let line = stdout_buf[..nl].trim().to_string();
                                stdout_buf = stdout_buf[nl + 1..].to_string();

                                if line.is_empty() { continue; }

                                // Parse key=value from ffmpeg -progress output
                                if let Some((k, v)) = line.split_once('=') {
                                    progress_map.insert(k.trim().to_string(), v.trim().to_string());
                                }

                                if line.starts_with("progress=") {
                                    if let Some(t) = progress_map.get("out_time_us") {
                                        out_time_us = t.parse().unwrap_or(out_time_us);
                                    }
                                    if let Some(s) = progress_map.get("speed") {
                                        speed = s.trim_end_matches('x').parse().ok();
                                    }

                                    let progress = if total_us > 0 {
                                        (out_time_us as f64 / total_us as f64).clamp(0.0, 1.0)
                                    } else {
                                        0.0
                                    };

                                    let secs = out_time_us / 1_000_000;
                                    let step_text = format!(
                                        "{:02}:{:02}:{:02} merged{}",
                                        secs / 3600,
                                        (secs % 3600) / 60,
                                        secs % 60,
                                        speed
                                            .map(|s| format!(" at {s:.1}x"))
                                            .unwrap_or_default()
                                    );

                                    let _ = app_clone.emit(
                                        "merge-progress",
                                        MergeProgressEvent {
                                            session_id: session_id.clone(),
                                            progress,
                                            out_time_us,
                                            speed,
                                            step_text,
                                        },
                                    );

                                    if line == "progress=end" {
                                        cancellers.lock().await.remove(&session_id);
                                        let _ = app_clone.emit(
                                            "merge-complete",
                                            MergeCompleteEvent {
                                                session_id: session_id.clone(),
                                                output_path: output_path.clone(),
                                            },
                                        );
                                        let _ = std::fs::remove_file(&list_path);
                                        return;
                                    }

                                    progress_map.clear();
                                }
                            }
                        }
                        Some(CommandEvent::Stderr(data)) => {
                            let text = String::from_utf8_lossy(&data).into_owned();
                            // Split stderr by lines to log each individually
                            for line in text.lines() {
                                let l = line.to_string();
                                stderr_lines.push(l.clone());
                                // Keep last 200 lines to avoid unbounded growth
                                if stderr_lines.len() > 200 {
                                    stderr_lines.remove(0);
                                }
                                let _ = app_clone.emit(
                                    "merge-log",
                                    MergeLogEvent {
                                        session_id: session_id.clone(),
                                        line: l,
                                        is_stderr: true,
                                    },
                                );
                            }
                        }
                        Some(CommandEvent::Terminated(status)) => {
                            cancellers.lock().await.remove(&session_id);
                            let _ = std::fs::remove_file(&list_path);

                            let code = status.code.unwrap_or(-1);
                            let success = code == 0;

                            if success {
                                let _ = app_clone.emit(
                                    "merge-complete",
                                    MergeCompleteEvent {
                                        session_id: session_id.clone(),
                                        output_path: output_path.clone(),
                                    },
                                );
                            } else {
                                // Include the last few stderr lines in the error
                                // so the user sees the root cause immediately.
                                let last_stderr: String = stderr_lines
                                    .iter()
                                    .rev()
                                    .filter(|l| !l.trim().is_empty())
                                    .take(5)
                                    .collect::<Vec<_>>()
                                    .into_iter()
                                    .rev()
                                    .cloned()
                                    .collect::<Vec<_>>()
                                    .join("\n");

                                let error_msg = if last_stderr.is_empty() {
                                    format!("ffmpeg exited with code {code}.")
                                } else {
                                    format!("ffmpeg exited with code {code}:\n{last_stderr}")
                                };

                                let _ = app_clone.emit(
                                    "merge-error",
                                    MergeErrorEvent {
                                        session_id: session_id.clone(),
                                        error: error_msg,
                                        command: cmd_str.clone(),
                                    },
                                );
                            }
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }
    });

    Ok(())
}

/// Cancel an active merge by session_id.
#[tauri::command]
pub async fn cancel_merge(
    state: State<'_, MergeState>,
    session_id: String,
) -> Result<(), String> {
    let mut map = state.cancellers.lock().await;
    if let Some(tx) = map.remove(&session_id) {
        let _ = tx.send(());
    }
    Ok(())
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/// Check whether a file path already exists (for overwrite warnings).
#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

/// Open a folder in the system file manager.
#[tauri::command]
pub async fn open_output_folder(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    // Resolve to folder if path points to a file
    let p = std::path::Path::new(&path);
    let folder = if p.is_file() {
        p.parent()
            .map(|d| d.to_string_lossy().into_owned())
            .unwrap_or(path)
    } else {
        path
    };
    app.opener()
        .open_path(folder, None::<String>)
        .map_err(|e| e.to_string())
}

/// Reveal a specific file in the system file manager.
#[tauri::command]
pub async fn reveal_in_finder(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e: tauri_plugin_opener::Error| e.to_string())
}
