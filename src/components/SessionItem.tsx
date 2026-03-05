import { useState, useRef, useEffect } from 'react';
import {
  ChevronRight,
  Scissors,
  Merge,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { Session } from '../types';
import { useAppStore } from '../store';
import { formatDuration, formatBytes } from '../utils/formatters';

interface Props {
  session: Session;
}

interface CtxMenu {
  x: number;
  y: number;
  target: 'session' | 'clip';
  clipIndex?: number;
}

export default function SessionItem({ session }: Props) {
  const {
    selectedSessionId,
    selectSession,
    toggleSessionCollapsed,
    renameSession,
    splitSession,
    joinSessions,
    removeSession,
    removeClip,
    moveClipUp,
    moveClipDown,
    sessions,
  } = useAppStore();

  const isSelected = selectedSessionId === session.id;
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(session.name);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  // Close ctx menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    window.addEventListener('click', handler, { once: true });
    return () => window.removeEventListener('click', handler);
  }, [ctxMenu]);

  const totalDuration = session.clips.reduce(
    (sum, c) => (c.duration != null ? sum + c.duration : sum),
    0
  );
  const totalSize = session.clips.reduce((sum, c) => sum + c.size, 0);

  const sessionIdx = sessions.findIndex((s) => s.id === session.id);
  const hasPrev = sessionIdx > 0;

  function handleHeaderCtx(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, target: 'session' });
  }

  function handleClipCtx(e: React.MouseEvent, clipIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, target: 'clip', clipIndex });
  }

  function commitRename() {
    if (renameVal.trim()) renameSession(session.id, renameVal.trim());
    setRenaming(false);
  }

  return (
    <div
      className={`session-item${isSelected ? ' selected' : ''}`}
      onClick={() => selectSession(session.id)}
      onContextMenu={handleHeaderCtx}
    >
      {/* ── Session header row ── */}
      <div className="session-header">
        <div
          className={`session-chevron${!session.collapsed ? ' open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleSessionCollapsed(session.id);
          }}
        >
          <ChevronRight size={13} />
        </div>

        <div className="session-info">
          {renaming ? (
            <input
              ref={renameRef}
              className="session-name-input"
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setRenameVal(session.name); setRenaming(false); }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="session-name" onDoubleClick={() => setRenaming(true)}>
              {session.name}
            </div>
          )}
          <div className="session-meta">
            <span>{session.clips.length} clip{session.clips.length !== 1 ? 's' : ''}</span>
            {totalDuration > 0 && <span>{formatDuration(totalDuration)}</span>}
            <span>{formatBytes(totalSize)}</span>
          </div>
        </div>

        <span className={`status-badge ${session.status}`}>
          {session.status === 'merging'
            ? `${Math.round((session.mergeProgress?.progress ?? 0) * 100)}%`
            : session.status}
        </span>
      </div>

      {/* ── Clips list (expanded) ── */}
      {!session.collapsed && (
        <div className="clip-list">
          {session.clips.map((clip, idx) => (
            <div
              key={clip.path}
              className="clip-item"
              onContextMenu={(e) => handleClipCtx(e, idx)}
            >
              <span className="clip-num">{idx + 1}</span>
              <span className="clip-name" title={clip.path}>{clip.filename}</span>
              {clip.duration != null && (
                <span className="clip-duration">{formatDuration(clip.duration)}</span>
              )}
              <div
                className={`probe-dot ${clip.probeStatus}`}
                title={`Probe: ${clip.probeStatus}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div
          className="ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxMenu.target === 'session' && (
            <>
              <div
                className="ctx-menu-item"
                onClick={() => { setRenaming(true); setCtxMenu(null); }}
              >
                <Pencil size={13} /> Rename
              </div>
              {hasPrev && (
                <div
                  className="ctx-menu-item"
                  onClick={() => {
                    joinSessions(sessions[sessionIdx - 1].id, session.id);
                    setCtxMenu(null);
                  }}
                >
                  <Merge size={13} /> Merge with above
                </div>
              )}
              <div className="ctx-menu-sep" />
              <div
                className="ctx-menu-item danger"
                onClick={() => { removeSession(session.id); setCtxMenu(null); }}
              >
                <Trash2 size={13} /> Remove session
              </div>
            </>
          )}

          {ctxMenu.target === 'clip' && ctxMenu.clipIndex != null && (
            <>
              {ctxMenu.clipIndex > 0 && (
                <div
                  className="ctx-menu-item"
                  onClick={() => {
                    splitSession(session.id, ctxMenu.clipIndex!);
                    setCtxMenu(null);
                  }}
                >
                  <Scissors size={13} /> Split before this clip
                </div>
              )}
              {ctxMenu.clipIndex > 0 && (
                <div
                  className="ctx-menu-item"
                  onClick={() => { moveClipUp(session.id, ctxMenu.clipIndex!); setCtxMenu(null); }}
                >
                  <ArrowUp size={13} /> Move up
                </div>
              )}
              {ctxMenu.clipIndex < session.clips.length - 1 && (
                <div
                  className="ctx-menu-item"
                  onClick={() => { moveClipDown(session.id, ctxMenu.clipIndex!); setCtxMenu(null); }}
                >
                  <ArrowDown size={13} /> Move down
                </div>
              )}
              <div className="ctx-menu-sep" />
              <div
                className="ctx-menu-item danger"
                onClick={() => { removeClip(session.id, ctxMenu.clipIndex!); setCtxMenu(null); }}
              >
                <Trash2 size={13} /> Remove clip
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
