import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as dialogOpen } from '@tauri-apps/plugin-dialog';
import type {
  Session,
  FileMetadata,
  ProbeResult,
  LogEntry,
  MergeProgressEvent,
  MergeCompleteEvent,
  MergeErrorEvent,
  MergeLogEvent,
} from './types';
import {
  groupFilesIntoSessions,
  detectProbeWarnings,
  mergeSessions as mergeSessionsUtil,
  splitSessionAt,
} from './utils/grouper';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppStore {
  // State
  sessions: Session[];
  selectedSessionId: string | null;
  logs: LogEntry[];
  isLogOpen: boolean;
  lastOutputDir: string;

  // Import
  importPaths: (paths: string[]) => Promise<void>;
  importFolder: () => Promise<void>;
  importFiles: () => Promise<void>;

  // Session management
  selectSession: (id: string | null) => void;
  renameSession: (id: string, name: string) => void;
  setMergeMode: (id: string, mode: 'fast' | 'compatibility') => void;
  setOutputDir: (id: string, dir: string) => void;
  setOutputFilename: (id: string, name: string) => void;
  toggleSessionCollapsed: (id: string) => void;
  splitSession: (sessionId: string, afterClipIndex: number) => void;
  joinSessions: (aboveId: string, belowId: string) => void;
  removeSession: (id: string) => void;
  moveClipUp: (sessionId: string, clipIndex: number) => void;
  moveClipDown: (sessionId: string, clipIndex: number) => void;
  removeClip: (sessionId: string, clipIndex: number) => void;

  // Probe
  probeSession: (sessionId: string) => Promise<void>;

  // Merge
  mergeSession: (sessionId: string) => Promise<void>;
  cancelMerge: (sessionId: string) => Promise<void>;

  // Logs
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  toggleLog: () => void;

  // Init listeners
  initListeners: () => Promise<() => void>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

let logIdCounter = 0;
function makeLogId() {
  return `log-${Date.now()}-${++logIdCounter}`;
}

export const useAppStore = create<AppStore>((set, get) => ({
  sessions: [],
  selectedSessionId: null,
  logs: [],
  isLogOpen: false,
  lastOutputDir: '',

  // ── Import ────────────────────────────────────────────────────────────────

  importPaths: async (paths: string[]) => {
    const { addLog, lastOutputDir } = get();
    addLog({ level: 'info', message: `Importing ${paths.length} path(s)…` });

    const allFiles: FileMetadata[] = [];

    for (const p of paths) {
      // Check if it's a directory by trying to scan it
      try {
        const files = await invoke<FileMetadata[]>('scan_directory', { path: p });
        allFiles.push(...files);
      } catch {
        // Not a directory — treat as a file
        try {
          const files = await invoke<FileMetadata[]>('get_files_metadata', { paths: [p] });
          allFiles.push(...files);
        } catch (e) {
          addLog({ level: 'warn', message: `Could not import "${p}": ${e}` });
        }
      }
    }

    if (allFiles.length === 0) {
      addLog({ level: 'warn', message: 'No video files found in the dropped items.' });
      return;
    }

    addLog({ level: 'info', message: `Found ${allFiles.length} video file(s). Grouping…` });

    const newSessions = groupFilesIntoSessions(allFiles);

    // Apply remembered output dir
    if (lastOutputDir) {
      for (const s of newSessions) s.outputDir = lastOutputDir;
    } else if (allFiles[0]) {
      // Default: same directory as the first clip
      const firstPath = allFiles[0].path;
      const sep = firstPath.includes('/') ? '/' : '\\';
      const parts = firstPath.split(sep);
      parts.pop();
      const dir = parts.join(sep);
      for (const s of newSessions) s.outputDir = dir;
    }

    set((state) => {
      const merged = [...state.sessions, ...newSessions];
      // Deduplicate clips that are already present in existing sessions
      const existingPaths = new Set(
        state.sessions.flatMap((s) => s.clips.map((c) => c.path))
      );
      for (const sess of newSessions) {
        sess.clips = sess.clips.filter((c) => !existingPaths.has(c.path));
      }
      return {
        sessions: merged.filter((s) => s.clips.length > 0),
        selectedSessionId: state.selectedSessionId ?? newSessions[0]?.id ?? null,
      };
    });

    addLog({ level: 'info', message: `Created ${newSessions.length} session(s).` });
  },

  importFolder: async () => {
    const selected = await dialogOpen({
      directory: true,
      multiple: false,
      title: 'Select Video Folder',
    });
    if (selected) {
      await get().importPaths([selected as string]);
    }
  },

  importFiles: async () => {
    const selected = await dialogOpen({
      multiple: true,
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mts', 'm2ts', 'mkv', 'm4v'] },
      ],
      title: 'Select Video Files',
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      await get().importPaths(paths);
    }
  },

  // ── Session management ────────────────────────────────────────────────────

  selectSession: (id) => set({ selectedSessionId: id }),

  renameSession: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, name } : s)),
    })),

  setMergeMode: (id, mode) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, mergeMode: mode } : s)),
    })),

  setOutputDir: (id, dir) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, outputDir: dir } : s)),
      lastOutputDir: dir,
    })),

  setOutputFilename: (id, outputFilename) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, outputFilename } : s)),
    })),

  toggleSessionCollapsed: (id) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, collapsed: !s.collapsed } : s
      ),
    })),

  splitSession: (sessionId, afterClipIndex) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session || afterClipIndex <= 0 || afterClipIndex >= session.clips.length) return;
    const [a, b] = splitSessionAt(session, afterClipIndex);
    set((state) => ({
      sessions: state.sessions.flatMap((s) => (s.id === sessionId ? [a, b] : [s])),
      selectedSessionId: a.id,
    }));
  },

  joinSessions: (aboveId, belowId) => {
    const sessions = get().sessions;
    const above = sessions.find((s) => s.id === aboveId);
    const below = sessions.find((s) => s.id === belowId);
    if (!above || !below) return;
    const joined = mergeSessionsUtil(above, below);
    set((state) => ({
      sessions: state.sessions
        .filter((s) => s.id !== belowId)
        .map((s) => (s.id === aboveId ? joined : s)),
    }));
  },

  removeSession: (id) =>
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== id);
      return {
        sessions: remaining,
        selectedSessionId:
          state.selectedSessionId === id
            ? (remaining[0]?.id ?? null)
            : state.selectedSessionId,
      };
    }),

  moveClipUp: (sessionId, clipIndex) =>
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId || clipIndex <= 0) return s;
        const clips = [...s.clips];
        [clips[clipIndex - 1], clips[clipIndex]] = [clips[clipIndex], clips[clipIndex - 1]];
        return { ...s, clips };
      }),
    })),

  moveClipDown: (sessionId, clipIndex) =>
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId || clipIndex >= s.clips.length - 1) return s;
        const clips = [...s.clips];
        [clips[clipIndex], clips[clipIndex + 1]] = [clips[clipIndex + 1], clips[clipIndex]];
        return { ...s, clips };
      }),
    })),

  removeClip: (sessionId, clipIndex) =>
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const clips = s.clips.filter((_, i) => i !== clipIndex);
        return { ...s, clips };
      }),
    })),

  // ── Probe ─────────────────────────────────────────────────────────────────

  probeSession: async (sessionId) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const { addLog } = get();
    addLog({ level: 'info', sessionId, message: `Probing ${session.clips.length} clip(s)…` });

    // Mark all clips as loading
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          clips: s.clips.map((c) => ({ ...c, probeStatus: 'loading' as const })),
        };
      }),
    }));

    const results: ProbeResult[] = [];

    for (const clip of session.clips) {
      try {
        const result = await invoke<ProbeResult>('probe_file', { path: clip.path });
        results.push(result);

        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            return {
              ...s,
              clips: s.clips.map((c) => {
                if (c.path !== clip.path) return c;
                return {
                  ...c,
                  duration: result.duration,
                  codec: result.codec,
                  width: result.width,
                  height: result.height,
                  fps: result.fps,
                  audioCodec: result.audioCodec,
                  probeStatus: 'done' as const,
                };
              }),
            };
          }),
        }));
      } catch (e) {
        addLog({ level: 'warn', sessionId, message: `Could not probe "${clip.filename}": ${e}` });
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s;
            return {
              ...s,
              clips: s.clips.map((c) =>
                c.path === clip.path ? { ...c, probeStatus: 'error' as const } : c
              ),
            };
          }),
        }));
      }
    }

    // Recompute probe warnings
    const updatedSession = get().sessions.find((s) => s.id === sessionId);
    if (updatedSession) {
      const probeWarnings = detectProbeWarnings(updatedSession.clips);
      set((state) => ({
        sessions: state.sessions.map((s) => {
          if (s.id !== sessionId) return s;
          const allWarnings = [
            ...s.warnings.filter((w) => w.type === 'missing-segment' || w.type === 'gap-detected'),
            ...probeWarnings,
          ];
          return {
            ...s,
            warnings: allWarnings,
            status: allWarnings.length > 0 ? 'warning' : 'ready',
          };
        }),
      }));
    }

    addLog({ level: 'info', sessionId, message: `Probe complete for ${results.length} clip(s).` });
  },

  // ── Merge ─────────────────────────────────────────────────────────────────

  mergeSession: async (sessionId) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session || session.clips.length === 0) return;
    // Guard against double-invocation
    if (session.status === 'merging') return;

    const { addLog } = get();

    if (!session.outputDir || !session.outputFilename) {
      addLog({ level: 'error', sessionId, message: 'Please set an output folder and filename.' });
      return;
    }

    const outputPath = [session.outputDir, session.outputFilename]
      .join(session.outputDir.includes('/') ? '/' : '\\');

    // Check for overwrite
    const exists = await invoke<boolean>('file_exists', { path: outputPath }).catch(() => false);
    if (exists) {
      // We let the UI show a confirmation dialog; for now just log
      addLog({ level: 'warn', sessionId, message: `Output file already exists: ${outputPath}. It will be overwritten.` });
    }

    // Calculate total duration in microseconds (best effort)
    const totalDurationUs = session.clips
      .filter((c) => c.duration != null)
      .reduce((sum, c) => sum + (c.duration! * 1_000_000), 0);

    // Mark as merging
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, status: 'merging', mergeStartedAt: Date.now(), mergeProgress: { progress: 0, stepText: 'Starting…' } }
          : s
      ),
    }));

    addLog({
      level: 'info',
      sessionId,
      message: `Starting ${session.mergeMode} merge of ${session.clips.length} clips → ${outputPath}`,
    });

    try {
      await invoke('start_merge', {
        request: {
          sessionId,
          clips: session.clips.map((c) => c.path),
          outputPath,
          mode: session.mergeMode,
          totalDurationUs: totalDurationUs > 0 ? Math.round(totalDurationUs) : undefined,
        },
      });
    } catch (e) {
      addLog({ level: 'error', sessionId, message: `Failed to start merge: ${e}` });
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, status: 'error', mergeProgress: undefined } : s
        ),
      }));
    }
  },

  cancelMerge: async (sessionId) => {
    await invoke('cancel_merge', { sessionId }).catch(() => null);
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status: 'cancelled', mergeProgress: undefined } : s
      ),
    }));
  },

  // ── Logs ──────────────────────────────────────────────────────────────────

  addLog: (entry) =>
    set((state) => ({
      logs: [
        ...state.logs,
        { ...entry, id: makeLogId(), timestamp: Date.now() },
      ].slice(-500), // Cap at 500 entries
    })),

  clearLogs: () => set({ logs: [] }),

  toggleLog: () => set((state) => ({ isLogOpen: !state.isLogOpen })),

  // ── Event listeners ───────────────────────────────────────────────────────

  initListeners: async () => {
    const { addLog } = get();

    const unlistenProgress = await listen<MergeProgressEvent>(
      'merge-progress',
      (event) => {
        const { sessionId, progress, stepText, speed, outTimeUs } = event.payload;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? { ...s, mergeProgress: { progress, stepText, speed, outTimeUs } }
              : s
          ),
        }));
      }
    );

    const unlistenComplete = await listen<MergeCompleteEvent>(
      'merge-complete',
      (event) => {
        const { sessionId, outputPath } = event.payload;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? { ...s, status: 'done', mergeProgress: undefined, outputPath }
              : s
          ),
        }));
        addLog({ level: 'info', sessionId, message: `Merge complete: ${outputPath}` });
      }
    );

    const unlistenError = await listen<MergeErrorEvent>(
      'merge-error',
      (event) => {
        const { sessionId, error, command } = event.payload;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? { ...s, status: 'error', mergeProgress: undefined, errorMessage: error }
              : s
          ),
        }));
        addLog({ level: 'error', sessionId, message: `Merge failed: ${error}` });
        addLog({ level: 'info', sessionId, message: `Command: ${command}` });
      }
    );

    const unlistenLog = await listen<MergeLogEvent>(
      'merge-log',
      (event) => {
        const { sessionId, line, isStderr } = event.payload;
        addLog({
          level: isStderr ? 'debug' : 'info',
          sessionId,
          message: line.trim(),
        });
      }
    );

    return () => {
      unlistenProgress();
      unlistenComplete();
      unlistenError();
      unlistenLog();
    };
  },
}));
