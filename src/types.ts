// ─── Backend models (mirror of Rust structs) ──────────────────────────────────

export interface FileMetadata {
  path: string;
  filename: string;
  size: number;
  /** Unix timestamp in ms */
  mtime: number;
}

export interface ProbeResult {
  path: string;
  duration?: number;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitRate?: number;
  audioCodec?: string;
}

export interface MergeRequest {
  sessionId: string;
  clips: string[];
  outputPath: string;
  mode: 'fast' | 'compatibility';
  totalDurationUs?: number;
}

export interface MergeProgressEvent {
  sessionId: string;
  progress: number; // 0–1
  outTimeUs: number;
  speed?: number;
  stepText: string;
}

export interface MergeCompleteEvent {
  sessionId: string;
  outputPath: string;
}

export interface MergeErrorEvent {
  sessionId: string;
  error: string;
  command: string;
}

export interface MergeLogEvent {
  sessionId: string;
  line: string;
  isStderr: boolean;
}

// ─── Frontend-only models ─────────────────────────────────────────────────────

export type ProbeStatus = 'pending' | 'loading' | 'done' | 'error';

export interface ClipInfo extends FileMetadata {
  // Populated by ffprobe (asynchronously)
  duration?: number;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  audioCodec?: string;
  probeStatus: ProbeStatus;
}

export type WarningType =
  | 'codec-mismatch'
  | 'resolution-mismatch'
  | 'fps-mismatch'
  | 'gap-detected'
  | 'missing-segment';

export interface SessionWarning {
  type: WarningType;
  message: string;
}

export type SessionStatus =
  | 'ready'
  | 'warning'
  | 'error'
  | 'merging'
  | 'done'
  | 'cancelled';

export interface MergeProgress {
  /** 0–1 */
  progress: number;
  stepText: string;
  speed?: number;
}

export interface Session {
  id: string;
  name: string;
  clips: ClipInfo[];
  outputDir: string;
  outputFilename: string;
  mergeMode: 'fast' | 'compatibility';
  status: SessionStatus;
  warnings: SessionWarning[];
  mergeProgress?: MergeProgress;
  /** Set after successful merge */
  outputPath?: string;
  /** Set on merge error — includes last few lines of ffmpeg stderr */
  errorMessage?: string;
  collapsed: boolean;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  sessionId?: string;
  message: string;
}
