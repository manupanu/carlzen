import { FaUndo, FaRedo, FaSyncAlt, FaRobot } from 'react-icons/fa';

interface BoardControlsProps {
  bestMoveSAN: string;
  evaluation: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onFlip: () => void;
}

export function BoardControls({
  bestMoveSAN,
  evaluation,
  canUndo,
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
      <button
        className="btn-secondary icon-btn"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z or ←)"
        aria-label="Undo"
      >
        <FaUndo />
      </button>
      <button
        className="btn-secondary icon-btn"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y or →)"
        aria-label="Redo"
      >
        <FaRedo />
      </button>
      <button className="btn-secondary icon-btn" onClick={onFlip} title="Flip board (F)" aria-label="Flip board">
        <FaSyncAlt />
      </button>
    </div>
  );
}
