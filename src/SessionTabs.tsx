import { FaPlus, FaTimes } from 'react-icons/fa';

export interface HistEntry { fen: string; san: string; }

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
  return (
    <div className="tabs-container">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`tab ${session.id === activeId ? 'active' : ''}`}
          onClick={() => onSelect(session.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            const newName = prompt('Rename game:', session.name);
            if (newName && newName.trim()) {
              onRename(session.id, newName.trim());
            }
          }}
          title="Double-click to rename"
        >
          <span className="tab-name">{session.name}</span>
          {sessions.length > 1 && (
            <button className="tab-close" onClick={(e) => onClose(session.id, e)} title="Close game">
              <FaTimes />
            </button>
          )}
        </div>
      ))}
      <button className="tab-add" onClick={onAdd} title="New Game">
        <FaPlus />
      </button>
    </div>
  );
}
