import { FaPlus, FaTimes } from 'react-icons/fa';

import type { MoveReview } from './live/review';

export interface HistEntry { fen: string; san: string; review?: MoveReview; }

export interface Session {
  id: string;
  name: string;
  fen: string;
  orientation: 'white' | 'black';
  undoStack: HistEntry[];
  redoStack: HistEntry[];
  lastMove?: { from: string; to: string } | null;
  updatedAt: number;
}

interface SessionTabsProps {
  sessions: Session[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, newName: string) => void;
}

export function SessionTabs({ sessions, activeId, onSelect, onAdd, onClose, onRename }: SessionTabsProps) {
  const rename = (session: Session) => {
    const newName = prompt('Rename game:', session.name);
    if (newName && newName.trim()) {
      onRename(session.id, newName.trim());
    }
  };

  return (
    <div className="tabs-container" role="tablist" aria-label="Games">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`tab ${session.id === activeId ? 'active' : ''}`}
          role="tab"
          tabIndex={0}
          aria-selected={session.id === activeId}
          onClick={() => onSelect(session.id)}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(session.id);
            } else if (e.key === 'F2') {
              e.preventDefault();
              rename(session);
            }
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            rename(session);
          }}
          title="Double-click or press F2 to rename"
        >
          <span className="tab-name">{session.name}</span>
          {sessions.length > 1 && (
            <button className="tab-close" onClick={(e) => onClose(session.id, e)} title="Close game" aria-label={`Close ${session.name}`}>
              <FaTimes />
            </button>
          )}
        </div>
      ))}
      <button className="tab-add" onClick={onAdd} title="New Game" aria-label="New game">
        <FaPlus />
      </button>
    </div>
  );
}
