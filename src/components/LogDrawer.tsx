import { useRef, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useAppStore } from '../store';

export default function LogDrawer() {
  const logs = useAppStore((s) => s.logs);
  const isLogOpen = useAppStore((s) => s.isLogOpen);
  const { toggleLog, clearLogs } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isLogOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isLogOpen]);

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  return (
    <div className={`log-drawer ${isLogOpen ? 'open' : 'closed'}`}>
      <div className="log-header">
        <span>Log ({logs.length})</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-ghost btn-icon"
            onClick={clearLogs}
            title="Clear log"
            style={{ padding: '2px 4px' }}
          >
            <Trash2 size={12} />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={toggleLog}
            title="Close log"
            style={{ padding: '2px 4px' }}
          >
            <X size={12} />
          </button>
        </div>
      </div>
      <div className="log-entries">
        {logs.map((entry) => (
          <div key={entry.id} className="log-entry">
            <span className="log-time">{formatTime(entry.timestamp)}</span>
            <span className={`log-msg ${entry.level}`}>{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
