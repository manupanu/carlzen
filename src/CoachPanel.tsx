import { FaRobot } from 'react-icons/fa';

interface CoachPanelProps {
  evaluation: string;
  evalPercent: number;        // 0–100, 50 = equal
  bestMoveSAN: string;
  coachAdvice: string;
  isCoaching: boolean;
  isEngineReady: boolean;
  gameStatus: string;         // '', 'check', 'checkmate', 'stalemate', 'draw'
  makeBestMove: () => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  checkmate: { label: '♚ Checkmate', className: 'status-checkmate' },
  stalemate: { label: '⚖ Stalemate — Draw', className: 'status-draw' },
  draw:      { label: '⚖ Draw', className: 'status-draw' },
  check:     { label: '⚠ Check!', className: 'status-check' },
};

export function CoachPanel({
  evaluation,
  evalPercent,
  bestMoveSAN,
  coachAdvice,
  isCoaching,
  isEngineReady,
  gameStatus,
  makeBestMove,
}: CoachPanelProps) {
  const statusInfo = STATUS_LABELS[gameStatus];

  return (
    <div className="coach-feedback">
      {/* Game over / check banner */}
      {statusInfo && (
        <div className={`game-status-banner ${statusInfo.className}`}>
          {statusInfo.label}
        </div>
      )}

      {!isEngineReady ? (
        <div className="engine-loading">
          <div className="loading-spinner" />
          <p>Loading Stockfish 18…</p>
        </div>
      ) : gameStatus === 'checkmate' || gameStatus === 'stalemate' || gameStatus === 'draw' ? (
        <p className="pulse-text" style={{ marginTop: '12px' }}>Game over — reset or load a new position.</p>
      ) : bestMoveSAN ? (
        <>
          {/* Eval bar */}
          <div className="eval-bar-row">
            <div className="eval-bar">
              <div
                className="eval-bar-fill"
                style={{ width: `${evalPercent}%` }}
              />
            </div>
            <span className="eval-label">{evaluation}</span>
          </div>

          <p className="best-move-line">
            Best move:{' '}
            <strong className="best-move-san">{bestMoveSAN}</strong>
          </p>
          <button
            className="btn-secondary play-best-btn"
            onClick={makeBestMove}
          >
            <FaRobot /> Play Best Move
          </button>
          <div className="ai-advice-container">
            <p className="ai-advice-text">
              {coachAdvice}
              {isCoaching && <span className="cursor-blink">|</span>}
            </p>
          </div>
        </>
      ) : (
        <p className="pulse-text">Analyzing position with Stockfish 18…</p>
      )}
    </div>
  );
}
