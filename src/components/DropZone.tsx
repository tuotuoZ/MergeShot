import { useState, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useEffect } from 'react';
import { Film, FolderOpen, Plus } from 'lucide-react';
import { useAppStore } from '../store';

export default function DropZone() {
  const [isDragging, setIsDragging] = useState(false);
  const { importFolder, importFiles } = useAppStore();
  const dropAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const win = getCurrentWebviewWindow();
    let unlistenEnter: (() => void) | undefined;
    let unlistenLeave: (() => void) | undefined;

    win.onDragDropEvent((event) => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') {
        setIsDragging(true);
      } else if (event.payload.type === 'leave' || event.payload.type === 'drop') {
        setIsDragging(false);
      }
    }).then((fn) => {
      // The single listener handles all events; keep reference for teardown
      unlistenEnter = fn;
    });

    return () => {
      unlistenEnter?.();
      unlistenLeave?.();
    };
  }, []);

  return (
    <div className="drop-zone">
      <div
        ref={dropAreaRef}
        className={`drop-area${isDragging ? ' drag-over' : ''}`}
        onClick={importFolder}
        role="button"
        tabIndex={0}
        aria-label="Drop video files or folder here, or click to browse"
        onKeyDown={(e) => e.key === 'Enter' && importFolder()}
      >
        <div className="drop-area-icon">
          {isDragging ? (
            <Plus size={22} />
          ) : (
            <Film size={22} />
          )}
        </div>
        <div className="drop-area-text">
          <strong>
            {isDragging ? 'Release to import…' : 'Drop a folder or video files here'}
          </strong>
          <span>Works with DJI / GoPro split clips. Auto-sorted & grouped.</span>
        </div>
      </div>

      <button
        className="btn btn-secondary"
        onClick={importFolder}
        title="Select a folder"
      >
        <FolderOpen size={14} />
        Folder…
      </button>

      <button
        className="btn btn-secondary"
        onClick={importFiles}
        title="Select individual video files"
      >
        <Film size={14} />
        Files…
      </button>
    </div>
  );
}
