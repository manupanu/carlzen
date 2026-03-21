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
      {sessions.map(s => (
        <div 
          key={s.id} 
          className={`tab ${s.id === activeId ? 'active' : ''}`}
          onClick={() => onSelect(s.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            const newName = prompt('Rename tab:', s.name);
            if (newName && newName.trim()) onRename(s.id, newName.trim());
          }}
          title="Double-click to rename"
        >
          <span className="tab-name">{s.name}</span>
          {sessions.length > 1 && (
            <button className="tab-close" onClick={(e) => onClose(s.id, e)} title="Close tab">
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
