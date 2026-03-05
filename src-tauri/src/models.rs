use serde::{Deserialize, Serialize};

/// Metadata for a video file returned to the frontend.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub path: String,
    pub filename: String,
    pub size: u64,
    /// Unix timestamp in milliseconds (modification time).
    pub mtime: u64,
}

/// Result from ffprobe analysis of a single video file.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub path: String,
    pub duration: Option<f64>,
    pub codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub bit_rate: Option<u64>,
    pub audio_codec: Option<String>,
}

/// Request payload for starting a merge operation.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergeRequest {
    pub session_id: String,
    /// Ordered list of absolute paths to merge.
    pub clips: Vec<String>,
    /// Absolute path for the output file (including filename + extension).
    pub output_path: String,
    /// "fast" (stream-copy) or "compatibility" (re-encode).
    pub mode: String,
    /// Sum of all clip durations in microseconds (for progress calculation).
    pub total_duration_us: Option<i64>,
}

/// Progress event emitted during merge, sent as a Tauri event.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergeProgressEvent {
    pub session_id: String,
    /// 0.0 – 1.0
    pub progress: f64,
    pub out_time_us: i64,
    pub speed: Option<f64>,
    pub step_text: String,
}

/// Emitted when a merge finishes successfully.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergeCompleteEvent {
    pub session_id: String,
    pub output_path: String,
}

/// Emitted when a merge fails.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergeErrorEvent {
    pub session_id: String,
    pub error: String,
    /// The exact ffmpeg command that failed.
    pub command: String,
}

/// A log line emitted during merge.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergeLogEvent {
    pub session_id: String,
    pub line: String,
    pub is_stderr: bool,
}
