import { useEffect, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useAppStore } from './store';
import DropZone from './components/DropZone';
import SessionList from './components/SessionList';
import SessionDetails from './components/SessionDetails';
import ActionBar from './components/ActionBar';
import LogDrawer from './components/LogDrawer';

export default function App() {
  const initListeners = useAppStore((s) => s.initListeners);
  const importPaths = useAppStore((s) => s.importPaths);
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Initialize Tauri event listeners
    initListeners().then((teardown) => {
      teardownRef.current = teardown;
    });

    // Register Tauri drag-drop handler
    const win = getCurrentWebviewWindow();
    let unlistenDrop: (() => void) | undefined;

    win.onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        const paths = (event.payload as { type: 'drop'; paths: string[] }).paths;
        if (paths.length > 0) {
          importPaths(paths);
        }
      }
    }).then((fn) => {
      unlistenDrop = fn;
    });

    return () => {
      teardownRef.current?.();
      unlistenDrop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <div className="app-body">
        <DropZone />
        <div className="app-main">
          <SessionList />
          <SessionDetails />
        </div>
      </div>
      <LogDrawer />
      <ActionBar />
    </div>
  );
}
