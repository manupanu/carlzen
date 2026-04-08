import { FaRobot } from 'react-icons/fa';

interface CoachPanelProps {
  evaluation: string;
  bestMoveSAN: string;
  coachAdvice: string;
  isCoaching: boolean;
  isAnalyzing: boolean;
  analysisStatus: string;
  analysisProgress: number;
  analysisProgressLabel: string;
  isEngineReady: boolean;
  gameStatus: string;         // '', 'check', 'checkmate', 'stalemate', 'draw'
  makeBestMove: () => void;
  isAiSummaryEnabled: boolean;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  checkmate: { label: '♚ Checkmate', className: 'status-checkmate' },
  stalemate: { label: '⚖ Stalemate — Draw', className: 'status-draw' },
  draw:      { label: '⚖ Draw', className: 'status-draw' },
  check:     { label: '⚠ Check!', className: 'status-check' },
};

export function CoachPanel({
  evaluation,
  bestMoveSAN,
  coachAdvice,
  isCoaching,
  isAnalyzing,
  analysisStatus,
  analysisProgress,
  analysisProgressLabel,
  isEngineReady,
  gameStatus,
  makeBestMove,
  isAiSummaryEnabled,
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
          <div className={`analysis-status-slot ${analysisStatus ? 'visible' : 'empty'}`}>
            <p className="analysis-status-text">{analysisStatus || ' '}</p>
          </div>
          <div className="analysis-progress-block">
            <div className="analysis-progress-track" aria-hidden="true">
              <div className="analysis-progress-fill" style={{ width: `${analysisProgress}%` }} />
            </div>
            <div className="analysis-progress-label">{analysisProgressLabel || ' '}</div>
          </div>
          {/* Eval badge */}
          <div className="eval-text-row">
            <span className="eval-label">Evaluation: {evaluation}</span>
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
          {isAiSummaryEnabled && (
            <div className="ai-advice-container">
              {isCoaching && !coachAdvice ? (
                <p className="ai-advice-text pulse-text" style={{ opacity: 0.8, fontStyle: 'italic' }}>
                  CarlZen is formulating advice...
                </p>
              ) : (
                <p className="ai-advice-text">
                  {coachAdvice}
                  {isCoaching && <span className="cursor-blink">|</span>}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className={`analysis-status-slot ${analysisStatus ? 'visible' : 'empty'}`}>
            <p className="analysis-status-text">{analysisStatus || ' '}</p>
          </div>
          <div className="analysis-progress-block">
            <div className="analysis-progress-track" aria-hidden="true">
              <div className="analysis-progress-fill" style={{ width: `${analysisProgress}%` }} />
            </div>
            <div className="analysis-progress-label">{analysisProgressLabel || (isAnalyzing ? 'Analyzing…' : 'Waiting for analysis…')}</div>
          </div>
        </>
      )}
    </div>
  );
}
