import { FaChessBoard, FaRobot, FaTrash, FaCheck } from 'react-icons/fa';
import { CoachPanel } from './CoachPanel';

interface SidebarProps {
  fenInput: string;
  setFenInput: (v: string) => void;
  onImportFen: () => void;
  onReset: () => void;
  fenError: string;
  moveHistory: string[];
  engineDepth: number;
  setEngineDepth: (d: number) => void;
  aiCoachEnabled: boolean;
  setAiCoachEnabled: (v: boolean) => void;
  coachProps: React.ComponentProps<typeof CoachPanel>;
}

export function Sidebar({
  fenInput,
  setFenInput,
  onImportFen,
  onReset,
  fenError,
  moveHistory,
  engineDepth,
  setEngineDepth,
  aiCoachEnabled,
  setAiCoachEnabled,
  coachProps,
}: SidebarProps) {
  return (
    <div className="sidebar glass-panel">
      {/* Header */}
      <div className="panel-content header">
        <img src="/favicon.svg" alt="CarlZen Logo" className="logo" />
        <h1>CarlZen</h1>
      </div>

      {/* Board Setup */}
      <div className="panel-content">
        <h3>
          <FaChessBoard /> Board Setup
        </h3>
        <div className="input-group">
          <input
            type="text"
            placeholder="Paste FEN here..."
            value={fenInput}
            onChange={(e) => setFenInput(e.target.value)}
            className="premium-input"
            onKeyDown={(e) => e.key === 'Enter' && onImportFen()}
          />
          {fenError && <p className="error-text">{fenError}</p>}
          <button className="btn-primary load-btn" onClick={onImportFen}>
            <FaCheck /> Load Position
          </button>
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
        </div>
      </div>

      {/* Move History */}
      {moveHistory.length > 0 && (
        <div className="panel-content">
          <h3>Move History</h3>
          <div className="move-history">
            {Array.from({ length: Math.ceil(moveHistory.length / 2) }, (_, i) => (
              <div key={i} className="move-pair">
                <span className="move-number">{i + 1}.</span>
                <span className="move-san">{moveHistory[i * 2]}</span>
                {moveHistory[i * 2 + 1] && (
                  <span className="move-san">{moveHistory[i * 2 + 1]}</span>
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
            <FaRobot /> AI Coach
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
        {aiCoachEnabled && <CoachPanel {...coachProps} />}
      </div>
    </div>
  );
}
