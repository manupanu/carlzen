import { FaDesktop, FaStop } from 'react-icons/fa';
import type { LiveController, LiveState } from './controller';

export interface LiveVerdict {
  text: string;
  grade: string;
}

interface LivePanelProps {
  controller: LiveController;
  live: LiveState;
  verdict: LiveVerdict | null;
}

/** Screen capture needs a secure context (HTTPS or localhost) and a desktop browser. */
function unsupportedReason(): string | null {
  if (!window.isSecureContext) {
    return 'Watching the screen needs HTTPS or localhost. Open CarlZen over a secure connection.';
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return 'This browser cannot share the screen. Use a desktop browser such as Chrome, Edge or Firefox.';
  }
  return null;
}

export function LivePanel({ controller, live, verdict }: LivePanelProps) {
  const unsupported = unsupportedReason();

  return (
    <div className="panel-content live-panel">
      <h3>
        <FaDesktop /> Watch Screen
      </h3>

      {unsupported ? (
        <p className="live-note">{unsupported}</p>
      ) : (
        <>
          <p className={`live-status${live.warn ? ' warn' : ''}`}>
            {live.status}
            {live.warn && '. This window is hidden: browsers slow hidden pages down, keep it visible.'}
          </p>

          <div className="live-buttons">
            {live.sharing ? (
              <button className="btn-secondary" onClick={() => controller.stop()}>
                <FaStop /> Stop
              </button>
            ) : (
              <button className="btn-secondary live-start" onClick={() => void controller.start()}>
                <FaDesktop /> Share screen
              </button>
            )}
            {live.sharing && (
              <>
                <button className="btn-secondary" onClick={() => controller.findBoardNow()}>
                  Find board
                </button>
                <button className="btn-secondary" onClick={() => controller.selectBoard()}>
                  Select board
                </button>
                <button className="btn-secondary" onClick={() => controller.calibrateNow()}>
                  Calibrate now
                </button>
                <button className="btn-secondary" onClick={() => controller.setPaused(!live.paused)}>
                  {live.paused ? 'Resume' : 'Pause'}
                </button>
              </>
            )}
          </div>

          <div className={`live-preview${live.sharing ? '' : ' hidden'}`}>
            <canvas ref={(el) => controller.attachPreview(el)} />
          </div>

          {live.guessedTurn && (
            <button className="btn-secondary live-turn" onClick={() => controller.flipTurn()}>
              Side to move is a guess: switch it
            </button>
          )}

          {verdict && <p className={`live-verdict ${verdict.grade}`}>{verdict.text}</p>}

          {live.sharing && (
            <div className="live-extras">
              <label className="live-check">
                <input
                  type="checkbox"
                  checked={live.debug}
                  onChange={(e) => controller.setDebug(e.target.checked)}
                />
                Debug
              </label>
              <button className="btn-secondary" disabled={!live.canSnapshot} onClick={() => controller.snapshot()}>
                Save snapshot
              </button>
            </div>
          )}

          {!live.sharing && (
            <p className="live-note">
              Share the window with your game. The board is found automatically, and CarlZen follows every move.
            </p>
          )}
        </>
      )}
    </div>
  );
}
