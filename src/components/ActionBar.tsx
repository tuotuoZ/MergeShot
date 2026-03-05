import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import {
  Play,
  Square,
  FolderOpen,
  ClipboardCopy,
  CheckCircle,
  Terminal,
} from 'lucide-react';
import { useAppStore } from '../store';

export default function ActionBar() {
  const sessions = useAppStore((s) => s.sessions);
  const selectedId = useAppStore((s) => s.selectedSessionId);
  const logs = useAppStore((s) => s.logs);
  const isLogOpen = useAppStore((s) => s.isLogOpen);
  const { mergeSession, cancelMerge, toggleLog } = useAppStore();

  const session = sessions.find((s) => s.id === selectedId);

  const isMerging = session?.status === 'merging';
  const isDone = session?.status === 'done';
  const canMerge =
    session &&
    !isMerging &&
    session.clips.length > 0 &&
    session.outputDir.length > 0 &&
    session.outputFilename.length > 0;

  const progress = session?.mergeProgress;

  async function handleMerge() {
    if (!session) return;

    // Check for overwrite
    const outputPath = [session.outputDir, session.outputFilename].join(
      session.outputDir.includes('/') ? '/' : '\\'
    );
    const exists = await invoke<boolean>('file_exists', { path: outputPath }).catch(() => false);
    if (exists) {
      const confirmed = await ask(
        `The file "${session.outputFilename}" already exists in the output folder.\n\nOverwrite it?`,
        { title: 'Overwrite?', kind: 'warning' }
      );
      if (!confirmed) return;
    }

    mergeSession(session.id);
  }

  async function handleOpenOutput() {
    if (!session?.outputPath) return;
    await invoke('open_output_folder', { path: session.outputPath }).catch(console.error);
  }

  function handleCopyLog() {
    const header = [
      `MergeShot v0.1.0`,
      `Platform: ${navigator.platform}`,
      `UA: ${navigator.userAgent}`,
      `Session: ${session?.name ?? 'N/A'}`,
      `Mode: ${session?.mergeMode ?? 'N/A'}`,
      `Clips: ${session?.clips.length ?? 0}`,
      '─'.repeat(60),
      '',
    ].join('\n');

    const body = logs
      .map((l) => {
        const ts = new Date(l.timestamp).toISOString();
        return `[${ts}] [${l.level.toUpperCase()}] ${l.message}`;
      })
      .join('\n');

    navigator.clipboard.writeText(header + body).catch(() => {
      // Fallback: try old execCommand
      const ta = document.createElement('textarea');
      ta.value = header + body;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }

  return (
    <div className="action-bar">
      {/* Primary action */}
      {isMerging ? (
        <button
          className="btn btn-danger"
          onClick={() => session && cancelMerge(session.id)}
        >
          <Square size={13} />
          Cancel
        </button>
      ) : (
        <button
          className="btn btn-primary"
          onClick={handleMerge}
          disabled={!canMerge}
          title={!canMerge ? 'Select a session with clips and an output folder' : 'Start merge'}
        >
          <Play size={13} />
          Merge
        </button>
      )}

      {/* Progress / done state */}
      <div className="progress-area">
        {isMerging && progress && (
          <>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.round(progress.progress * 100)}%` }}
              />
            </div>
            <div className="progress-text">{progress.stepText}</div>
          </>
        )}
        {isDone && (
          <>
            <div className="progress-track">
              <div className="progress-fill done" style={{ width: '100%' }} />
            </div>
            <div className="progress-text" style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle size={11} /> Done — {session?.outputFilename}
            </div>
          </>
        )}
        {!isMerging && !isDone && session && (
          <div className="progress-text">
            {session.clips.length} clip{session.clips.length !== 1 ? 's' : ''} ready
            {!session.outputDir && (
              <span style={{ color: 'var(--warning)', marginLeft: 8 }}>
                — Set output folder to merge
              </span>
            )}
          </div>
        )}
        {!session && (
          <div className="progress-text">Select a session to start</div>
        )}
      </div>

      {/* Secondary actions */}
      <button
        className="btn btn-secondary"
        onClick={handleOpenOutput}
        disabled={!isDone}
        title="Open output folder"
      >
        <FolderOpen size={13} />
        Open Folder
      </button>

      <button
        className="btn btn-ghost"
        onClick={handleCopyLog}
        title="Copy full log to clipboard"
      >
        <ClipboardCopy size={13} />
        Copy Log
      </button>

      <button
        className={`btn btn-ghost${isLogOpen ? ' active' : ''}`}
        onClick={toggleLog}
        title="Toggle log panel"
        style={isLogOpen ? { color: 'var(--accent)' } : {}}
      >
        <Terminal size={13} />
        Log
        {logs.length > 0 && (
          <span
            style={{
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              borderRadius: 8,
              padding: '0 5px',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {logs.length}
          </span>
        )}
      </button>
    </div>
  );
}
