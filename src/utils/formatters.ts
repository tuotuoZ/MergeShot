/** Format seconds into HH:MM:SS or MM:SS string. */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Format bytes into human-readable size string. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Format a frame rate fraction to a clean string. */
export function formatFps(fps: number | undefined): string {
  if (fps == null) return '—';
  // Show as integer if whole, otherwise 1 decimal
  return Number.isInteger(fps) ? `${fps} fps` : `${fps.toFixed(2)} fps`;
}

/** Format resolution. */
export function formatResolution(width?: number, height?: number): string {
  if (!width || !height) return '—';
  return `${width}×${height}`;
}

/** Format a Unix timestamp (ms) to a readable date string. */
export function formatDate(mtime: number): string {
  if (!mtime) return '—';
  return new Date(mtime).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Truncate a long path for display, keeping the filename intact. */
export function truncatePath(path: string, maxLen = 50): string {
  if (path.length <= maxLen) return path;
  const sep = path.includes('/') ? '/' : '\\';
  const parts = path.split(sep);
  const filename = parts.pop() ?? '';
  let result = '…' + sep + filename;
  let i = parts.length - 1;
  while (i >= 0 && (result + sep + parts[i]).length < maxLen) {
    result = parts[i] + sep + result;
    i--;
  }
  if (i >= 0) result = '…' + sep + result;
  return result;
}

/** Get the directory portion of a path. */
export function dirname(path: string): string {
  const sep = path.includes('/') ? '/' : '\\';
  const parts = path.split(sep);
  parts.pop();
  return parts.join(sep) || sep;
}
