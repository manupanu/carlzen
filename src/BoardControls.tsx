import { FaUndo, FaRedo, FaSyncAlt, FaRobot } from 'react-icons/fa';

interface BoardControlsProps {
  bestMoveSAN: string;
  evaluation: string;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onFlip: () => void;
}

export function BoardControls({
  bestMoveSAN,
  evaluation,
  canRedo,
  onUndo,
  onRedo,
  onFlip,
}: BoardControlsProps) {
  return (
    <div className="board-controls">
      {bestMoveSAN && (
        <div className="mobile-best-move-hint">
          <FaRobot /> {bestMoveSAN} ({evaluation})
        </div>
      )}
      <button className="btn-secondary icon-btn" onClick={onUndo} title="Undo (Ctrl+Z)">
        <FaUndo />
      </button>
      <button
        className="btn-secondary icon-btn"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
      >
        <FaRedo />
      </button>
      <button className="btn-secondary icon-btn" onClick={onFlip} title="Flip Board">
        <FaSyncAlt />
      </button>
    </div>
  );
}
