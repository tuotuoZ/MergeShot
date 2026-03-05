import { useState } from 'react';
import {
  Folder,
  FolderOpen,
  Zap,
  Settings,
  Search,
  MousePointerClick,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { open as dialogOpen } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../store';
import { formatDuration, formatBytes, formatFps, formatResolution } from '../utils/formatters';

export default function SessionDetails() {
  const sessions = useAppStore((s) => s.sessions);
  const selectedId = useAppStore((s) => s.selectedSessionId);
  const {
    setMergeMode,
    setOutputDir,
    setOutputFilename,
    probeSession,
  } = useAppStore();

  const [showAdvanced, setShowAdvanced] = useState(false);

  const session = sessions.find((s) => s.id === selectedId);

  if (!session) {
    return (
      <div className="details-panel">
        <div className="panel-header">
          <h3>Details</h3>
        </div>
        <div className="details-empty">
          <MousePointerClick size={40} strokeWidth={1} />
          <span>Select a session to view details</span>
        </div>
      </div>
    );
  }

  const totalDuration = session.clips.reduce(
    (sum, c) => (c.duration != null ? sum + c.duration : sum),
    0
  );
  const totalSize = session.clips.reduce((sum, c) => sum + c.size, 0);
  const allProbed = session.clips.every((c) => c.probeStatus === 'done' || c.probeStatus === 'error');

  // Codec / resolution / fps from first probed clip
  const firstProbed = session.clips.find((c) => c.probeStatus === 'done');

  async function pickOutputDir() {
    const selected = await dialogOpen({
      directory: true,
      title: 'Choose Output Folder',
    });
    if (selected) setOutputDir(session!.id, selected as string);
  }

  const outputFull = session.outputDir
    ? [session.outputDir, session.outputFilename].join(
        session.outputDir.includes('/') ? '/' : '\\'
      )
    : session.outputFilename;

  const isMerging = session.status === 'merging';
  const isDone = session.status === 'done';
  const hasCompatWarning = session.warnings.some(
    (w) =>
      w.type === 'codec-mismatch' ||
      w.type === 'resolution-mismatch' ||
      w.type === 'fps-mismatch'
  );

  return (
    <div className="details-panel">
      <div className="panel-header">
        <h3>Session Details</h3>
        {!allProbed && (
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => probeSession(session.id)}
            title="Probe clips with ffprobe"
          >
            <Search size={13} />
          </button>
        )}
        {allProbed && (
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => probeSession(session.id)}
            title="Re-probe clips"
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>

      <div className="details-content">
        {/* ── Summary stats ── */}
        <div className="detail-section">
          <div className="detail-section-title">Summary</div>
          <div className="detail-grid">
            <div className="detail-card">
              <div className="detail-card-label">Clips</div>
              <div className="detail-card-value">{session.clips.length}</div>
            </div>
            <div className="detail-card">
              <div className="detail-card-label">Total Duration</div>
              <div className="detail-card-value">
                {totalDuration > 0 ? formatDuration(totalDuration) : '—'}
              </div>
            </div>
            <div className="detail-card">
              <div className="detail-card-label">Total Size</div>
              <div className="detail-card-value">{formatBytes(totalSize)}</div>
            </div>
            {firstProbed && (
              <>
                <div className="detail-card">
                  <div className="detail-card-label">Resolution</div>
                  <div className="detail-card-value">
                    {formatResolution(firstProbed.width, firstProbed.height)}
                  </div>
                </div>
                <div className="detail-card">
                  <div className="detail-card-label">Codec</div>
                  <div className="detail-card-value">
                    {firstProbed.codec?.toUpperCase() ?? '—'}
                  </div>
                </div>
                <div className="detail-card">
                  <div className="detail-card-label">Frame Rate</div>
                  <div className="detail-card-value">{formatFps(firstProbed.fps)}</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Clip table ── */}
        <div className="detail-section">
          <div className="detail-section-title">Clips</div>
          <div className="clip-table">
            {session.clips.map((clip, idx) => (
              <div key={clip.path} className="clip-table-row">
                <span className="clip-table-num">{idx + 1}</span>
                <span className="clip-table-name" title={clip.path}>
                  {clip.filename}
                </span>
                <span className="clip-table-codec">
                  {clip.codec?.toUpperCase() ?? '—'}
                </span>
                <span className="clip-table-res">
                  {clip.width && clip.height
                    ? `${clip.width}×${clip.height}`
                    : '—'}
                </span>
                <span className="clip-table-dur">
                  {clip.duration != null ? formatDuration(clip.duration) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Warnings ── */}
        {session.warnings.length > 0 && (
          <div className="detail-section">
            <div className="warnings-panel">
              {session.warnings.map((w, i) => (
                <div key={i} className="warning-item">
                  <AlertTriangle size={13} />
                  <span>{w.message}</span>
                </div>
              ))}
              {hasCompatWarning && session.mergeMode === 'fast' && (
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 4, alignSelf: 'flex-start' }}
                  onClick={() => {
                    setMergeMode(session.id, 'compatibility');
                    setShowAdvanced(true);
                  }}
                >
                  Switch to Compatibility Mode
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Error banner ── */}
        {session.status === 'error' && session.errorMessage && (
          <div
            style={{
              background: 'var(--error-dim)',
              border: '1px solid var(--error)',
              borderRadius: 'var(--radius)',
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              color: 'var(--error)',
            }}
          >
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> Merge failed
            </div>
            <pre style={{
              margin: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'var(--text-primary)',
            }}>
              {session.errorMessage}
            </pre>
            {!hasCompatWarning && (
              <button
                className="btn btn-secondary"
                style={{ alignSelf: 'flex-start', fontSize: 11 }}
                onClick={() => {
                  setMergeMode(session.id, 'compatibility');
                  setShowAdvanced(true);
                }}
              >
                Try Compatibility Mode
              </button>
            )}
          </div>
        )}

        {/* ── Success banner ── */}
        {isDone && session.outputPath && (
          <div className="success-banner">
            <CheckCircle size={18} />
            <div>
              <div style={{ fontWeight: 600 }}>Merge complete!</div>
              <div style={{ fontSize: 11, marginTop: 2, wordBreak: 'break-all' }}>
                {session.outputPath}
              </div>
            </div>
          </div>
        )}

        {/* ── Output settings ── */}
        <div className="detail-section">
          <div className="detail-section-title">Output</div>

          <div className="output-row">
            <input
              className="input-field"
              value={session.outputDir}
              readOnly
              placeholder="Output folder (click folder icon to select)"
              title={session.outputDir || 'No output folder selected'}
            />
            <button
              className="btn btn-secondary btn-icon"
              onClick={pickOutputDir}
              title="Choose output folder"
            >
              <FolderOpen size={14} />
            </button>
          </div>

          <div className="output-row">
            <Folder size={14} style={{ color: 'var(--text-disabled)', flexShrink: 0 }} />
            <input
              className="input-field"
              value={session.outputFilename}
              onChange={(e) => setOutputFilename(session.id, e.target.value)}
              placeholder="output_filename.mp4"
              spellCheck={false}
            />
          </div>

          {session.outputDir && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
              → {outputFull}
            </div>
          )}
        </div>

        {/* ── Merge mode ── */}
        <div className="detail-section">
          <div className="detail-section-title">Merge Mode</div>
          <div className="mode-selector">
            <button
              className={`mode-btn${session.mergeMode === 'fast' ? ' active' : ''}`}
              onClick={() => setMergeMode(session.id, 'fast')}
              disabled={isMerging}
            >
              <Zap size={14} />
              <span>Fast Merge (Lossless)</span>
              <span className="mode-badge">Default</span>
            </button>
          </div>

          <button
            className="btn btn-ghost"
            style={{ alignSelf: 'flex-start', fontSize: 11 }}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <Settings size={12} />
            {showAdvanced ? 'Hide' : 'Show'} Advanced
          </button>

          {showAdvanced && (
            <div className="mode-selector">
              <button
                className={`mode-btn${session.mergeMode === 'compatibility' ? ' active' : ''}`}
                onClick={() => setMergeMode(session.id, 'compatibility')}
                disabled={isMerging}
              >
                <Settings size={14} />
                <span>Compatibility (Re-encode)</span>
              </button>
            </div>
          )}
          {showAdvanced && session.mergeMode === 'compatibility' && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              -c:v libx264 -preset veryfast -crf 18 -c:a aac -b:a 192k
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
