import { Film } from 'lucide-react';
import { useAppStore } from '../store';
import SessionItem from './SessionItem';

export default function SessionList() {
  const sessions = useAppStore((s) => s.sessions);

  return (
    <div className="session-list-panel">
      <div className="panel-header">
        <h3>Sessions ({sessions.length})</h3>
      </div>

      <div className="panel-scroll">
        {sessions.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '40px 16px',
              color: 'var(--text-disabled)',
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            <Film size={32} strokeWidth={1} />
            <span>No sessions yet.<br />Drop clips or browse to start.</span>
          </div>
        ) : (
          sessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))
        )}
      </div>
    </div>
  );
}
