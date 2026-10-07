import { FaChessBoard, FaCog, FaRobot, FaTrash } from 'react-icons/fa';
import { CoachPanel } from './CoachPanel';
import { gradeSymbol, type MoveReview } from './live/review';

interface SidebarProps {
  fenInput: string;
  setFenInput: (v: string) => void;
  onReset: () => void;
  onOpenSettings: () => void;
  fenError: string;
  moveHistory: string[];
  /** Review of each move in `moveHistory` (same order), where known. */
  moveReviews?: (MoveReview | undefined)[];
  engineDepth: number;
  setEngineDepth: (d: number) => void;
  engineElo: number | null;
  setEngineElo: (elo: number | null) => void;
  eloRange: { min: number; max: number };
  aiCoachEnabled: boolean;
  setAiCoachEnabled: (v: boolean) => void;
  coachProps: React.ComponentProps<typeof CoachPanel>;
  /** The Live mode panel, rendered below the board setup. */
  liveSlot?: React.ReactNode;
}

export function Sidebar({
  fenInput,
  setFenInput,
  onReset,
  onOpenSettings,
  fenError,
  moveHistory,
  moveReviews = [],
  engineDepth,
  setEngineDepth,
  engineElo,
  setEngineElo,
  eloRange,
  aiCoachEnabled,
  setAiCoachEnabled,
  coachProps,
  liveSlot,
}: SidebarProps) {
  return (
    <div className="sidebar glass-panel">
      {/* Header */}
      <div className="header">
        <div className="logo-shell">
          <img src="/favicon.svg" alt="CarlZen Logo" className="logo" />
        </div>
        <div className="brand-block">
          <div className="brand-row">
            <h1>CarlZen</h1>
            <button className="brand-settings-btn" onClick={onOpenSettings} title="Open settings">
              <FaCog />
            </button>
          </div>
        </div>
      </div>

      {/* Board Setup */}
      <div className="panel-content">
        <h3>
          <FaChessBoard /> Board Setup
        </h3>
        <div className="input-group">
          <input
            type="text"
            placeholder="Paste FEN or PGN here..."
            value={fenInput}
            onChange={(e) => setFenInput(e.target.value)}
            className="premium-input"
          />
          {fenError && <p className="error-text">{fenError}</p>}
          <button className="btn-secondary reset-btn" onClick={onReset}>
            <FaTrash /> Reset Board
          </button>

          {/* Engine depth slider */}
          <div className="depth-control">
            <label className="depth-label" htmlFor="depth-slider">
              Engine Depth
              <span className="depth-value">{engineDepth}</span>
            </label>
            <input
              id="depth-slider"
              type="range"
              min={1}
              max={25}
              value={engineDepth}
              onChange={(e) => setEngineDepth(Number(e.target.value))}
              className="depth-slider"
            />
            <div className="depth-hints">
              <span>Fast</span><span>Strong</span>
            </div>
          </div>

          {/* Playing strength of the suggested move */}
          <div className="depth-control">
            <label className="depth-label" htmlFor="elo-slider">
              Strength (Elo)
              <span className="depth-value">{engineElo ?? 'Max'}</span>
            </label>
            <input
              id="elo-slider"
              type="range"
              min={eloRange.min}
              max={eloRange.max + 10}
              step={10}
              value={engineElo ?? eloRange.max + 10}
              onChange={(e) => {
                const value = Number(e.target.value);
                setEngineElo(value > eloRange.max ? null : value);
              }}
              className="depth-slider"
            />
            <div className="depth-hints">
              <span>Casual</span><span>Full strength</span>
            </div>
          </div>
        </div>
      </div>

      {liveSlot}

      {/* Move History */}
      {moveHistory.length > 0 && (
        <div className="panel-content">
          <h3>Move History</h3>
          <div className="move-history">
            {Array.from({ length: Math.ceil(moveHistory.length / 2) }, (_, i) => (
              <div key={i} className="move-pair">
                <span className="move-number">{i + 1}.</span>
                <span className={`move-san grade-${moveReviews[i * 2]?.grade ?? 'none'}`}>
                  {moveHistory[i * 2]}
                  {moveReviews[i * 2] && gradeSymbol(moveReviews[i * 2]!.grade)}
                </span>
                {moveHistory[i * 2 + 1] && (
                  <span className={`move-san grade-${moveReviews[i * 2 + 1]?.grade ?? 'none'}`}>
                    {moveHistory[i * 2 + 1]}
                    {moveReviews[i * 2 + 1] && gradeSymbol(moveReviews[i * 2 + 1]!.grade)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Coach */}
      <div className="panel-content coach-section">
        <div className="coach-header-row">
          <h3>
            <FaRobot /> AI Summary
          </h3>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={aiCoachEnabled}
              onChange={(e) => setAiCoachEnabled(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <CoachPanel {...coachProps} />
      </div>
    </div>
  );
}
