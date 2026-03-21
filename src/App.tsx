import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Engine } from './engine';
import { getCoachFeedback } from './ai';
import { FaCopy } from 'react-icons/fa';
import { Sidebar } from './Sidebar';
import { BoardControls } from './BoardControls';
import { SessionTabs, type Session } from './SessionTabs';
import './App.css';

const AI_COACH_KEY = 'carlzen_ai_coach';

// Convert a CP centipawn value to a 0–100 bar percentage (50 = equal)
function cpToPercent(cp: number): number {
  const capped = Math.max(-1000, Math.min(1000, cp));
  return 50 + (capped / 1000) * 45;
}

function App() {
  // Session State Manage
  const [sessions, setSessions] = useState<Session[]>(() => {
    const saved = localStorage.getItem('carlzen_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) return parsed;
      } catch {}
    }
    // Fall back to old local storage logic for migration if needed
    const oldSavedFen = localStorage.getItem('carlzen_board_state');
    return [{ 
      id: Date.now().toString(36), 
      name: 'Game 1', 
      fen: oldSavedFen || new Chess().fen(), 
      orientation: 'white',
      undoStack: [], 
      redoStack: [] 
    }];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const saved = localStorage.getItem('carlzen_active_session');
    return saved || '';
  });

  // Ensure valid active ID
  useEffect(() => {
    if (!sessions.find(s => s.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Persist sessions
  useEffect(() => {
    localStorage.setItem('carlzen_sessions', JSON.stringify(sessions));
    localStorage.setItem('carlzen_active_session', activeSessionId);
  }, [sessions, activeSessionId]);

  const activeSession = useMemo(() => {
    const found = sessions.find(s => s.id === activeSessionId) || sessions[0];
    // Migration: ensure orientation exists
    if (!found.orientation) found.orientation = 'white';
    return found;
  }, [sessions, activeSessionId]);

  // Derived state for current tab
  const game = useMemo(() => new Chess(activeSession.fen), [activeSession.fen]);
  const undoStack = activeSession.undoStack;
  const redoStack = activeSession.redoStack;
  const lastMove = activeSession.lastMove || null;
  const boardOrientation = activeSession.orientation || 'white';

  const updateActiveSession = useCallback((updater: (s: Session) => Session) => {
    setSessions(prev => prev.map(s => s.id === activeSessionId ? updater(s) : s));
  }, [activeSessionId]);

  // FEN import
  const [fenInput, setFenInput] = useState('');
  const [fenError, setFenError] = useState('');

  // Engine & analysis (Local to App, but could reset on tab switch)
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [bestMoveUCI, setBestMoveUCI] = useState('');
  const [bestMoveSAN, setBestMoveSAN] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const [evalPercent, setEvalPercent] = useState(50);
  const [engineDepth, setEngineDepth] = useState(18);

  // AI coaching
  const [coachAdvice, setCoachAdvice] = useState('');
  const [isCoaching, setIsCoaching] = useState(false);
  const [aiCoachEnabled, setAiCoachEnabled] = useState(() => {
    const saved = localStorage.getItem(AI_COACH_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  // UX
  const [copied, setCopied] = useState(false);

  const engineRef = useRef<Engine | null>(null);
  const gameFenRef = useRef(game.fen());
  const abortControllerRef = useRef<AbortController | null>(null);
  const engineDepthRef = useRef(engineDepth);
  const aiCoachEnabledRef = useRef(aiCoachEnabled);

  useEffect(() => { gameFenRef.current = game.fen(); }, [game]);
  useEffect(() => { engineDepthRef.current = engineDepth; }, [engineDepth]);
  useEffect(() => { aiCoachEnabledRef.current = aiCoachEnabled; }, [aiCoachEnabled]);

  useEffect(() => {
    localStorage.setItem(AI_COACH_KEY, String(aiCoachEnabled));
    if (!aiCoachEnabled) {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setCoachAdvice('');
      setIsCoaching(false);
    }
  }, [aiCoachEnabled]);

  const fetchCoachingAdvice = useCallback(async (fen: string, move: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setIsCoaching(true);
    setCoachAdvice('');
    await getCoachFeedback(fen, move, (chunk) => {
      setCoachAdvice((prev) => prev + chunk);
    }, abortControllerRef.current.signal);
    setIsCoaching(false);
  }, []);

  useEffect(() => {
    engineRef.current = new Engine((msg) => {
      if (msg.type === 'ready') {
        setIsEngineReady(true);
        engineRef.current?.evaluatePosition(gameFenRef.current, engineDepthRef.current);
      } else if (msg.type === 'bestmove') {
        const uciMove = msg.data;
        setBestMoveUCI(uciMove);
        const gameCopy = new Chess(gameFenRef.current);
        try {
          const moveObj = gameCopy.move(uciMove);
          setBestMoveSAN(moveObj.san);
          if (aiCoachEnabledRef.current) fetchCoachingAdvice(gameFenRef.current, moveObj.san);
        } catch {
          console.error('Invalid move from engine:', uciMove);
          setBestMoveSAN(uciMove);
          if (aiCoachEnabledRef.current) fetchCoachingAdvice(gameFenRef.current, uciMove);
        }
      } else if (msg.type === 'eval') {
        const { cp, mate } = msg.result;
        if (mate !== undefined) {
          const color = mate > 0 ? 'White' : 'Black';
          setEvaluation(`Mate in ${Math.abs(mate)} for ${color}`);
          setEvalPercent(mate > 0 ? 98 : 2);
        } else if (cp !== undefined) {
          const evalStr = (cp / 100).toFixed(2);
          setEvaluation(cp > 0 ? `+${evalStr}` : evalStr);
          setEvalPercent(cpToPercent(cp));
        }
      }
    });
    return () => engineRef.current?.quit();
  }, [fetchCoachingAdvice]);

  // Re-analyse whenever position changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.stop();
      setBestMoveUCI('');
      setBestMoveSAN('');
      setCoachAdvice('');
      setEvaluation('');
      setEvalPercent(50);
      if (abortControllerRef.current) abortControllerRef.current.abort();

      const timerId = setTimeout(() => {
        engineRef.current?.evaluatePosition(game.fen(), engineDepthRef.current);
      }, 300);

      return () => clearTimeout(timerId);
    }
  }, [game]);

  useEffect(() => {
    if (!isEngineReady || !engineRef.current) return;
    engineRef.current.stop();
    setBestMoveUCI('');
    setBestMoveSAN('');
    setEvaluation('');
    setEvalPercent(50);
    const timerId = setTimeout(() => {
      engineRef.current?.evaluatePosition(gameFenRef.current, engineDepth);
    }, 300);
    return () => clearTimeout(timerId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineDepth]);

  // ── Tab Handlers ──────────────────────────────────────────

  const handleAddTab = () => {
    const newId = Date.now().toString(36);
    setSessions(prev => [
      ...prev,
      { 
        id: newId, 
        name: `Game ${prev.length + 1}`, 
        fen: new Chess().fen(), 
        orientation: 'white',
        undoStack: [], 
        redoStack: [] 
      }
    ]);
    setActiveSessionId(newId);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) return;
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (activeSessionId === id && filtered.length > 0) {
        setActiveSessionId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  };

  const handleRenameTab = (id: string, newName: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
  };

  // ── Game Handlers ─────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    const currentFen = gameFenRef.current;
    updateActiveSession(s => ({
      ...s,
      fen: entry.fen,
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [{ fen: currentFen, san: entry.san }, ...s.redoStack],
      lastMove: null
    }));
  }, [undoStack, updateActiveSession]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const entry = redoStack[0];
    const currentFen = gameFenRef.current;
    updateActiveSession(s => ({
      ...s,
      fen: entry.fen,
      undoStack: [...s.undoStack, { fen: currentFen, san: entry.san }],
      redoStack: s.redoStack.slice(1),
      lastMove: null
    }));
  }, [redoStack, updateActiveSession]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (!modifier) return;
      if (e.key === 'z') { e.preventDefault(); handleUndo(); }
      if (e.key === 'y') { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const handleFlip = useCallback(() => {
    updateActiveSession(s => ({
      ...s,
      orientation: s.orientation === 'white' ? 'black' : 'white'
    }));
  }, [updateActiveSession]);

  const handleReset = () => {
    updateActiveSession(s => ({
      ...s,
      fen: new Chess().fen(),
      undoStack: [],
      redoStack: [],
      lastMove: null
    }));
    setFenError('');
  };

  useEffect(() => {
    const trimmed = fenInput.trim();
    if (!trimmed) return;
    try {
      const newGame = new Chess(trimmed);
      const timer = setTimeout(() => {
        updateActiveSession(s => ({
          ...s,
          fen: newGame.fen(),
          undoStack: [],
          redoStack: [],
          lastMove: null
        }));
        setFenError('');
        setFenInput('');
      }, 500);
      return () => clearTimeout(timer);
    } catch {
      // not a valid FEN yet
    }
  }, [fenInput, updateActiveSession]);

  const handleCopyFen = () => {
    navigator.clipboard.writeText(game.fen());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const makeBestMove = useCallback(() => {
    if (!bestMoveUCI) return;
    const currentFen = gameFenRef.current;
    const gameCopy = new Chess(currentFen);
    try {
      const moveObj = gameCopy.move(bestMoveUCI);
      updateActiveSession(s => ({
        ...s,
        fen: gameCopy.fen(),
        undoStack: [...s.undoStack, { fen: currentFen, san: moveObj.san }],
        redoStack: [],
        lastMove: { from: moveObj.from, to: moveObj.to }
      }));
    } catch (e) {
      console.error('Failed to make best move:', bestMoveUCI, e);
    }
  }, [bestMoveUCI, updateActiveSession]);

  const onDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare) return false;
      const currentFen = gameFenRef.current;
      const gameCopy = new Chess(currentFen);
      try {
        const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (!move) return false;
        updateActiveSession(s => ({
          ...s,
          fen: gameCopy.fen(),
          undoStack: [...s.undoStack, { fen: currentFen, san: move.san }],
          redoStack: [],
          lastMove: { from: move.from, to: move.to }
        }));
        return true;
      } catch {
        return false;
      }
    },
    [updateActiveSession]
  );

  const moveHistory = useMemo(() => undoStack.map((e) => e.san), [undoStack]);

  const gameStatus = useMemo(() => {
    if (game.isCheckmate()) return 'checkmate';
    if (game.isStalemate()) return 'stalemate';
    if (game.isDraw()) return 'draw';
    if (game.isCheck()) return 'check';
    return '';
  }, [game]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: 'rgba(255, 255, 100, 0.35)' };
      styles[lastMove.to]   = { backgroundColor: 'rgba(255, 255, 100, 0.55)' };
    }
    if (game.isCheck()) {
      const board = game.board();
      const turn = game.turn();
      for (const row of board) {
        for (const sq of row) {
          if (sq && sq.type === 'k' && sq.color === turn) {
            styles[sq.square] = { backgroundColor: 'rgba(255, 60, 60, 0.65)' };
          }
        }
      }
    }
    return styles;
  }, [lastMove, game]);

  const arrows = useMemo(() => {
    if (!bestMoveUCI || bestMoveUCI.length < 4) return [];
    return [{ 
      startSquare: bestMoveUCI.slice(0, 2), 
      endSquare: bestMoveUCI.slice(2, 4),
      color: 'rgba(255, 170, 0, 0.8)'
    }];
  }, [bestMoveUCI]);

  const memoizedChessboard = useMemo(
    () => (
      <Chessboard
        options={{
          id: `board-${activeSessionId}`,
          position: game.fen(),
          boardOrientation,
          onPieceDrop: onDrop,
          darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
          lightSquareStyle: { backgroundColor: 'var(--board-light)' },
          dropSquareStyle: { boxShadow: 'inset 0 0 1px 6px rgba(255,255,255,0.75)' },
          animationDurationInMs: 300,
          squareStyles,
          arrows,
          allowDrawingArrows: true,
        }}
      />
    ),
    [activeSessionId, game, boardOrientation, onDrop, squareStyles, arrows]
  );

  return (
    <div className="app-container">
      <Sidebar
        fenInput={fenInput}
        setFenInput={setFenInput}
        onReset={handleReset}
        fenError={fenError}
        moveHistory={moveHistory}
        engineDepth={engineDepth}
        setEngineDepth={setEngineDepth}
        aiCoachEnabled={aiCoachEnabled}
        setAiCoachEnabled={setAiCoachEnabled}
        coachProps={{
          evaluation,
          bestMoveSAN,
          coachAdvice,
          isCoaching,
          isEngineReady,
          gameStatus,
          makeBestMove,
          isAiSummaryEnabled: aiCoachEnabled,
        }}
      />

      <div className="main-board glass-panel">
        <SessionTabs 
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={setActiveSessionId}
          onAdd={handleAddTab}
          onClose={handleCloseTab}
          onRename={handleRenameTab}
        />
        
        <BoardControls
          bestMoveSAN={bestMoveSAN}
          evaluation={evaluation}
          canRedo={redoStack.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onFlip={handleFlip}
        />
        <div className="board-wrapper">
          <div className="board-with-eval">
            <div 
              className="vertical-eval-bar" 
              style={{ flexDirection: boardOrientation === 'black' ? 'column' : 'column-reverse' }}
            >
              <div
                className="vertical-eval-fill"
                style={{ height: `${evalPercent}%` }}
              />
            </div>
            {memoizedChessboard}
          </div>
        </div>
        <div className="fen-display-row">
          <input
            type="text"
            readOnly
            value={game.fen()}
            className="premium-input fen-readonly"
          />
          <button className="btn-primary copy-btn" onClick={handleCopyFen}>
            <FaCopy /> {copied ? 'Copied! ✓' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
