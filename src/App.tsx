import { startTransition, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { FaCopy } from 'react-icons/fa';
import { Engine } from './engine';
import { getCoachFeedback, type CoachLine } from './ai';
import { pushSyncState, pullSyncState, type SyncState } from './sync';
import { Sidebar } from './Sidebar';
import { BoardControls } from './BoardControls';
import { SettingsSheet } from './SettingsSheet';
import { SessionTabs, type HistEntry, type Session } from './SessionTabs';
import './App.css';

const AI_COACH_KEY = 'carlzen_ai_coach';
const SESSIONS_KEY = 'carlzen_sessions';
const ACTIVE_SESSION_KEY = 'carlzen_active_session';
const SYNC_TOKEN_KEY = 'carlzen_sync_token';
const SYNC_UPDATED_AT_KEY = 'carlzen_sync_updated_at';
const ENGINE_DEPTH_KEY = 'carlzen_engine_depth';
const WELCOME_DISMISSED_KEY = 'carlzen_welcome_dismissed';
const START_FEN = new Chess().fen();

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface SessionBackupFile {
  version: 1;
  exportedAt: string;
  state: {
    sessions: Session[];
    activeSessionId: string;
  };
}

interface MultiPvLine {
  multipv: number;
  pv: string[];
  cp?: number;
  mate?: number;
}

function cpToPercent(cp: number): number {
  const capped = Math.max(-1000, Math.min(1000, cp));
  return 50 + (capped / 1000) * 45;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeHistoryEntry(value: unknown): HistEntry | null {
  if (!isObject(value) || typeof value.fen !== 'string' || typeof value.san !== 'string') {
    return null;
  }

  return {
    fen: value.fen,
    san: value.san,
  };
}

function createSession(
  name: string,
  overrides: Partial<Session> = {},
  timestamp = Date.now()
): Session {
  return {
    id: overrides.id ?? timestamp.toString(36),
    name,
    fen: overrides.fen ?? START_FEN,
    orientation: overrides.orientation ?? 'white',
    undoStack: overrides.undoStack ?? [],
    redoStack: overrides.redoStack ?? [],
    lastMove: overrides.lastMove ?? null,
    updatedAt: overrides.updatedAt ?? timestamp,
  };
}

function normalizeSession(value: unknown, index: number, fallbackUpdatedAt = Date.now()): Session | null {
  if (!isObject(value) || typeof value.id !== 'string') {
    return null;
  }

  const undoStack = Array.isArray(value.undoStack)
    ? value.undoStack.map(normalizeHistoryEntry).filter((entry): entry is HistEntry => entry !== null)
    : [];
  const redoStack = Array.isArray(value.redoStack)
    ? value.redoStack.map(normalizeHistoryEntry).filter((entry): entry is HistEntry => entry !== null)
    : [];
  const lastMove =
    isObject(value.lastMove) && typeof value.lastMove.from === 'string' && typeof value.lastMove.to === 'string'
      ? { from: value.lastMove.from, to: value.lastMove.to }
      : null;

  return {
    id: value.id,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : `Game ${index + 1}`,
    fen: typeof value.fen === 'string' && value.fen.trim() ? value.fen : START_FEN,
    orientation: value.orientation === 'black' ? 'black' : 'white',
    undoStack,
    redoStack,
    lastMove,
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) && value.updatedAt >= 0
        ? Math.trunc(value.updatedAt)
        : fallbackUpdatedAt,
  };
}

function normalizeSessions(value: unknown, fallbackUpdatedAt = Date.now()): Session[] {
  const sessions = Array.isArray(value)
    ? value
        .map((session, index) => normalizeSession(session, index, fallbackUpdatedAt))
        .filter((session): session is Session => session !== null)
    : [];

  const deduped = Array.from(new Map(sessions.map((session) => [session.id, session] as const)).values());
  return deduped.length > 0 ? deduped : [createSession('Game 1', {}, fallbackUpdatedAt)];
}

function isTrivialState(sessions: Session[], activeSessionId: string): boolean {
  if (sessions.length !== 1) {
    return false;
  }

  const [session] = sessions;
  return (
    session.name === 'Game 1' &&
    session.fen === START_FEN &&
    session.orientation === 'white' &&
    session.undoStack.length === 0 &&
    session.redoStack.length === 0 &&
    !session.lastMove &&
    activeSessionId === session.id
  );
}

function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const game = new Chess(fen);
  const sanMoves: string[] = [];

  for (const move of uciMoves) {
    try {
      const played = game.move(move);
      sanMoves.push(played.san);
    } catch {
      break;
    }
  }

  return sanMoves;
}

function isSamePvLine(left: MultiPvLine, right: MultiPvLine): boolean {
  return (
    left.multipv === right.multipv &&
    left.cp === right.cp &&
    left.mate === right.mate &&
    left.pv.length === right.pv.length &&
    left.pv.every((move, index) => move === right.pv[index])
  );
}

function App() {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const saved = localStorage.getItem(SESSIONS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return normalizeSessions(parsed);
      } catch {
        localStorage.removeItem(SESSIONS_KEY);
      }
    }

    const oldSavedFen = localStorage.getItem('carlzen_board_state');
    return [createSession('Game 1', { fen: oldSavedFen || START_FEN })];
  });
  const [activeSessionId, setActiveSessionId] = useState<string>(() => localStorage.getItem(ACTIVE_SESSION_KEY) || '');
  const [syncToken, setSyncToken] = useState(() => localStorage.getItem(SYNC_TOKEN_KEY) || '');
  const [documentUpdatedAt, setDocumentUpdatedAt] = useState<number>(() => {
    const saved = Number(localStorage.getItem(SYNC_UPDATED_AT_KEY));
    return Number.isFinite(saved) && saved >= 0 ? saved : 0;
  });

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  const game = useMemo(() => new Chess(activeSession.fen), [activeSession.fen]);
  const undoStack = activeSession.undoStack;
  const redoStack = activeSession.redoStack;
  const lastMove = activeSession.lastMove || null;
  const boardOrientation = activeSession.orientation || 'white';

  const updateActiveSession = useCallback(
    (updater: (session: Session) => Session) => {
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== activeSessionId) {
            return session;
          }

          const nextSession = updater(session);
          return { ...nextSession, updatedAt: Date.now() };
        })
      );
    },
    [activeSessionId]
  );

  const [fenInput, setFenInput] = useState('');
  const [fenError, setFenError] = useState('');
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [bestMoveUCI, setBestMoveUCI] = useState('');
  const [bestMoveSAN, setBestMoveSAN] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const [evalPercent, setEvalPercent] = useState(50);
  const [engineScore, setEngineScore] = useState<{ cp?: number; mate?: number } | null>(null);
  const [engineDepth, setEngineDepth] = useState(() => {
    const saved = Number(localStorage.getItem(ENGINE_DEPTH_KEY));
    return Number.isFinite(saved) && saved >= 1 && saved <= 25 ? saved : 18;
  });
  const [multiPvs, setMultiPvs] = useState<MultiPvLine[]>([]);
  const [coachAdvice, setCoachAdvice] = useState('');
  const [isCoaching, setIsCoaching] = useState(false);
  const [aiCoachEnabled, setAiCoachEnabled] = useState(() => {
    const saved = localStorage.getItem(AI_COACH_KEY);
    return saved !== null ? saved === 'true' : false;
  });
  const [copied, setCopied] = useState(false);
  const [copiedPgn, setCopiedPgn] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Sync disabled. Add a token to enable sync.');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isSettingsOpen, setIsSettingsOpen] = useState(() => localStorage.getItem(WELCOME_DISMISSED_KEY) !== 'true');
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const gameFenRef = useRef(game.fen());
  const abortControllerRef = useRef<AbortController | null>(null);
  const engineDepthRef = useRef(engineDepth);
  const aiCoachEnabledRef = useRef(aiCoachEnabled);
  const engineScoreRef = useRef(engineScore);
  const multiPvsRef = useRef(multiPvs);
  const moveHistoryRef = useRef<string[]>([]);
  const applyingRemoteStateRef = useRef(false);
  const repairingActiveSessionRef = useRef(false);
  const hasTrackedInitialStateRef = useRef(false);
  const previousSyncTokenRef = useRef(syncToken.trim());
  const syncSnapshotRef = useRef<SyncState>({
    sessions,
    activeSessionId,
    updatedAt: documentUpdatedAt,
  });

  useEffect(() => {
    if (!sessions.find((session) => session.id === activeSessionId)) {
      repairingActiveSessionRef.current = true;
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
    localStorage.setItem(SYNC_UPDATED_AT_KEY, String(documentUpdatedAt));
  }, [sessions, activeSessionId, documentUpdatedAt]);

  useEffect(() => {
    const trimmed = syncToken.trim();
    if (trimmed) {
      localStorage.setItem(SYNC_TOKEN_KEY, trimmed);
    } else {
      localStorage.removeItem(SYNC_TOKEN_KEY);
    }
  }, [syncToken]);

  useEffect(() => {
    syncSnapshotRef.current = {
      sessions,
      activeSessionId,
      updatedAt: documentUpdatedAt,
    };
  }, [sessions, activeSessionId, documentUpdatedAt]);

  useEffect(() => {
    if (!hasTrackedInitialStateRef.current) {
      hasTrackedInitialStateRef.current = true;
      return;
    }

    if (repairingActiveSessionRef.current) {
      repairingActiveSessionRef.current = false;
      return;
    }

    if (applyingRemoteStateRef.current) {
      applyingRemoteStateRef.current = false;
      return;
    }

    setDocumentUpdatedAt(Date.now());
  }, [sessions, activeSessionId]);

  useEffect(() => {
    const trimmed = syncToken.trim();
    const previousTrimmed = previousSyncTokenRef.current;

    if (trimmed && !previousTrimmed && documentUpdatedAt === 0 && !isTrivialState(sessions, activeSessionId)) {
      setDocumentUpdatedAt(Date.now());
    }

    previousSyncTokenRef.current = trimmed;
  }, [syncToken, sessions, activeSessionId, documentUpdatedAt]);

  useEffect(() => {
    gameFenRef.current = game.fen();
  }, [game]);

  useEffect(() => {
    engineDepthRef.current = engineDepth;
  }, [engineDepth]);

  useEffect(() => {
    aiCoachEnabledRef.current = aiCoachEnabled;
  }, [aiCoachEnabled]);

  useEffect(() => {
    engineScoreRef.current = engineScore;
  }, [engineScore]);

  useEffect(() => {
    multiPvsRef.current = multiPvs;
  }, [multiPvs]);

  useEffect(() => {
    localStorage.setItem(AI_COACH_KEY, String(aiCoachEnabled));
    if (!aiCoachEnabled) {
      abortControllerRef.current?.abort();
      setCoachAdvice('');
      setIsCoaching(false);
    }
  }, [aiCoachEnabled]);

  useEffect(() => {
    localStorage.setItem(ENGINE_DEPTH_KEY, String(engineDepth));
  }, [engineDepth]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      setSyncStatus('CarlZen installed successfully.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const fetchCoachingAdvice = useCallback(async (fen: string, move: string, moveUci?: string) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    setIsCoaching(true);
    setCoachAdvice('');

    if (!isOnline) {
      setCoachAdvice('AI Coach is unavailable offline. Please rely on local Stockfish evaluation.');
      setIsCoaching(false);
      return;
    }

    const topLines: CoachLine[] = multiPvsRef.current
      .slice()
      .sort((a, b) => a.multipv - b.multipv)
      .map((line) => ({
        rank: line.multipv,
        cp: line.cp,
        mate: line.mate,
        uci: line.pv.slice(0, 6),
        san: uciLineToSan(fen, line.pv.slice(0, 6)),
      }));

    await getCoachFeedback(
      {
        fen,
        move,
        moveUci,
        evaluation,
        scoreCp: engineScoreRef.current?.cp,
        scoreMate: engineScoreRef.current?.mate,
        engineDepth: engineDepthRef.current,
        topLines,
        recentMoves: moveHistoryRef.current.slice(-8),
      },
      (chunk) => {
        setCoachAdvice((prev) => prev + chunk);
      },
      abortControllerRef.current.signal
    );
    setIsCoaching(false);
  }, [evaluation, isOnline]);

  const applyRemoteState = useCallback((state: SyncState) => {
    const normalizedSessions = normalizeSessions(state.sessions, state.updatedAt);
    const nextActiveSessionId = normalizedSessions.some((session) => session.id === state.activeSessionId)
      ? state.activeSessionId
      : normalizedSessions[0].id;

    applyingRemoteStateRef.current = true;
    startTransition(() => {
      setSessions(normalizedSessions);
      setActiveSessionId(nextActiveSessionId);
      setDocumentUpdatedAt(state.updatedAt);
    });
  }, []);

  const syncNow = useCallback(async () => {
    const token = syncToken.trim();
    if (!token) {
      setSyncStatus('Sync disabled. Add a token to enable sync.');
      return;
    }

    if (!isOnline) {
      setSyncStatus('Offline. Changes stay local until you reconnect.');
      return;
    }

    setIsSyncing(true);
    setSyncStatus('Syncing...');

    try {
      const localState = syncSnapshotRef.current;
      const remoteState = await pullSyncState(token);
      let resolvedState = remoteState;

      if (!remoteState || localState.updatedAt > remoteState.updatedAt) {
        resolvedState = await pushSyncState(token, localState);
      }

      if (resolvedState && resolvedState.updatedAt > localState.updatedAt) {
        applyRemoteState(resolvedState);
      }

      setSyncStatus(
        `Synced at ${new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}.`
      );
    } catch (error: unknown) {
      console.error('Failed to sync sessions:', error);
      setSyncStatus(error instanceof Error ? error.message : 'Sync failed. Check the server logs and try again.');
    } finally {
      setIsSyncing(false);
    }
  }, [applyRemoteState, isOnline, syncToken]);

  useEffect(() => {
    const token = syncToken.trim();
    if (!token) {
      setSyncStatus('Sync disabled. Add a token to enable sync.');
      return;
    }

    void syncNow();
    const intervalId = window.setInterval(() => {
      void syncNow();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [syncToken, syncNow]);

  useEffect(() => {
    if (isOnline && syncToken.trim()) {
      void syncNow();
    }
  }, [isOnline, syncNow, syncToken]);

  useEffect(() => {
    const token = syncToken.trim();
    if (!token || documentUpdatedAt === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void syncNow();
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [syncToken, documentUpdatedAt, syncNow]);

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
          if (aiCoachEnabledRef.current) {
            void fetchCoachingAdvice(gameFenRef.current, moveObj.san, uciMove);
          }
        } catch {
          console.error('Invalid move from engine:', uciMove);
          setBestMoveSAN(uciMove);
          if (aiCoachEnabledRef.current) {
            void fetchCoachingAdvice(gameFenRef.current, uciMove, uciMove);
          }
        }
      } else if (msg.type === 'eval') {
        const { cp, mate, multipv, pv } = msg.result;

        if (pv && multipv) {
          setMultiPvs((prev) => {
            const nextLine: MultiPvLine = { multipv, pv, cp, mate };
            const next = [...prev];
            const idx = next.findIndex((line) => line.multipv === multipv);
            if (idx >= 0) {
              if (isSamePvLine(next[idx], nextLine)) {
                return prev;
              }
              next[idx] = nextLine;
            } else {
              next.push(nextLine);
            }
            return next.sort((left, right) => left.multipv - right.multipv);
          });
        }

        if (multipv === 1 || !multipv) {
          if (mate !== undefined) {
            const color = mate > 0 ? 'White' : 'Black';
            setEvaluation(`Mate in ${Math.abs(mate)} for ${color}`);
            setEvalPercent(mate > 0 ? 98 : 2);
            setEngineScore({ mate });
          } else if (cp !== undefined) {
            const evalStr = (cp / 100).toFixed(2);
            setEvaluation(cp > 0 ? `+${evalStr}` : evalStr);
            setEvalPercent(cpToPercent(cp));
            setEngineScore({ cp });
          }
        }
      }
    });

    return () => engineRef.current?.quit();
  }, [fetchCoachingAdvice]);

  useEffect(() => {
    if (!engineRef.current) {
      return;
    }

    engineRef.current.stop();
    setBestMoveUCI('');
    setBestMoveSAN('');
    setCoachAdvice('');
    setEvaluation('');
    setEvalPercent(50);
    setEngineScore(null);
    setMultiPvs([]);
    abortControllerRef.current?.abort();

    const timerId = window.setTimeout(() => {
      engineRef.current?.evaluatePosition(game.fen(), engineDepthRef.current);
    }, 300);

    return () => window.clearTimeout(timerId);
  }, [game]);

  useEffect(() => {
    if (!isEngineReady || !engineRef.current) {
      return;
    }

    engineRef.current.stop();
    setBestMoveUCI('');
    setBestMoveSAN('');
    setEvaluation('');
    setEvalPercent(50);
    setEngineScore(null);
    setMultiPvs([]);

    const timerId = window.setTimeout(() => {
      engineRef.current?.evaluatePosition(gameFenRef.current, engineDepth);
    }, 300);

    return () => window.clearTimeout(timerId);
  }, [engineDepth, isEngineReady]);

  const handleAddTab = () => {
    const timestamp = Date.now();
    const newSession = createSession(`Game ${sessions.length + 1}`, {}, timestamp);
    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newSession.id);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      return;
    }

    setSessions((prev) => {
      const filtered = prev.filter((session) => session.id !== id);
      if (activeSessionId === id && filtered.length > 0) {
        setActiveSessionId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  };

  const handleRenameTab = (id: string, newName: string) => {
    const timestamp = Date.now();
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id ? { ...session, name: newName, updatedAt: timestamp } : session
      )
    );
  };

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) {
      return;
    }

    const entry = undoStack[undoStack.length - 1];
    const currentFen = gameFenRef.current;
    updateActiveSession((session) => ({
      ...session,
      fen: entry.fen,
      undoStack: session.undoStack.slice(0, -1),
      redoStack: [{ fen: currentFen, san: entry.san }, ...session.redoStack],
      lastMove: null,
    }));
  }, [undoStack, updateActiveSession]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) {
      return;
    }

    const entry = redoStack[0];
    const currentFen = gameFenRef.current;
    updateActiveSession((session) => ({
      ...session,
      fen: entry.fen,
      undoStack: [...session.undoStack, { fen: currentFen, san: entry.san }],
      redoStack: session.redoStack.slice(1),
      lastMove: null,
    }));
  }, [redoStack, updateActiveSession]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (!modifier) {
        return;
      }

      if (event.key === 'z') {
        event.preventDefault();
        handleUndo();
      }

      if (event.key === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const handleFlip = useCallback(() => {
    updateActiveSession((session) => ({
      ...session,
      orientation: session.orientation === 'white' ? 'black' : 'white',
    }));
  }, [updateActiveSession]);

  const handleReset = () => {
    updateActiveSession((session) => ({
      ...session,
      fen: START_FEN,
      undoStack: [],
      redoStack: [],
      lastMove: null,
    }));
    setFenError('');
  };

  useEffect(() => {
    const trimmed = fenInput.trim();
    if (!trimmed) {
      return;
    }

    try {
      const isPgn = trimmed.startsWith('1.') || trimmed.includes('[Event');
      const newGame = new Chess();
      let initFen = newGame.fen();
      const newUndoStack: HistEntry[] = [];
      let lastMoveObj: { from: string; to: string } | null = null;

      if (isPgn) {
        newGame.loadPgn(trimmed);
        const history = newGame.history({ verbose: true });
        const headers = newGame.header();
        const headerFen = headers.FEN || undefined;
        const temp = new Chess(headerFen);
        initFen = temp.fen();

        for (const move of history) {
          const beforeFen = temp.fen();
          try {
            const played = temp.move(move);
            newUndoStack.push({ fen: beforeFen, san: played.san });
          } catch {
            break;
          }
        }

        if (history.length > 0) {
          const last = history[history.length - 1];
          lastMoveObj = { from: last.from, to: last.to };
        }
      } else {
        newGame.load(trimmed);
        initFen = newGame.fen();
      }

      const timer = window.setTimeout(() => {
        updateActiveSession((session) => ({
          ...session,
          fen: isPgn ? newGame.fen() : initFen,
          undoStack: newUndoStack,
          redoStack: [],
          lastMove: lastMoveObj,
        }));
        setFenError('');
        setFenInput('');
      }, 500);

      return () => window.clearTimeout(timer);
    } catch {
      // Ignore partial or invalid FEN/PGN input until it becomes valid.
    }
  }, [fenInput, updateActiveSession]);

  const handleCopyFen = () => {
    void navigator.clipboard.writeText(game.fen());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPgn = () => {
    let tempGame = new Chess();
    if (undoStack.length > 0) {
      tempGame = new Chess(undoStack[0].fen);
      for (const move of undoStack) {
        try {
          tempGame.move(move.san);
        } catch {
          continue;
        }
      }
    } else {
      tempGame = new Chess(game.fen());
    }

    void navigator.clipboard.writeText(tempGame.pgn());
    setCopiedPgn(true);
    window.setTimeout(() => setCopiedPgn(false), 2000);
  };

  const handleExportSessions = useCallback(() => {
    const backup: SessionBackupFile = {
      version: 1,
      exportedAt: new Date().toISOString(),
      state: {
        sessions,
        activeSessionId,
      },
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    anchor.href = url;
    anchor.download = `carlzen-backup-${stamp}.json`;
    anchor.click();

    URL.revokeObjectURL(url);
    setSyncStatus('Backup exported.');
  }, [activeSessionId, sessions]);

  const handleImportSessions = useCallback(async (file: File) => {
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as SessionBackupFile | Session[];
      const importedState =
        Array.isArray(parsed)
          ? { sessions: parsed, activeSessionId: parsed[0]?.id ?? '' }
          : parsed.state;

      const normalizedSessions = normalizeSessions(importedState?.sessions);
      const nextActiveSessionId = normalizedSessions.some((session) => session.id === importedState?.activeSessionId)
        ? importedState.activeSessionId
        : normalizedSessions[0].id;

      startTransition(() => {
        setSessions(normalizedSessions);
        setActiveSessionId(nextActiveSessionId);
        setDocumentUpdatedAt(Date.now());
      });

      setSyncStatus(`Imported ${normalizedSessions.length} game${normalizedSessions.length === 1 ? '' : 's'}.`);
      setFenError('');
    } catch (error) {
      console.error('Failed to import sessions:', error);
      setSyncStatus('Import failed. Use a CarlZen backup JSON file.');
    }
  }, []);

  const handleInstallApp = useCallback(async () => {
    if (!installPromptEvent) {
      setSyncStatus('Install is not currently available in this browser.');
      return;
    }

    await installPromptEvent.prompt();
    const result = await installPromptEvent.userChoice;
    if (result.outcome === 'accepted') {
      setSyncStatus('Install prompt accepted.');
      setInstallPromptEvent(null);
    } else {
      setSyncStatus('Install prompt dismissed.');
    }
  }, [installPromptEvent]);

  const closeSettingsSheet = useCallback(() => {
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
    setIsSettingsOpen(false);
  }, []);

  const makeBestMove = useCallback(() => {
    if (!bestMoveUCI) {
      return;
    }

    const currentFen = gameFenRef.current;
    const gameCopy = new Chess(currentFen);

    try {
      const moveObj = gameCopy.move(bestMoveUCI);
      updateActiveSession((session) => ({
        ...session,
        fen: gameCopy.fen(),
        undoStack: [...session.undoStack, { fen: currentFen, san: moveObj.san }],
        redoStack: [],
        lastMove: { from: moveObj.from, to: moveObj.to },
      }));
    } catch (error) {
      console.error('Failed to make best move:', bestMoveUCI, error);
    }
  }, [bestMoveUCI, updateActiveSession]);

  const onDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare) {
        return false;
      }

      const currentFen = gameFenRef.current;
      const gameCopy = new Chess(currentFen);

      try {
        const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (!move) {
          return false;
        }

        updateActiveSession((session) => ({
          ...session,
          fen: gameCopy.fen(),
          undoStack: [...session.undoStack, { fen: currentFen, san: move.san }],
          redoStack: [],
          lastMove: { from: move.from, to: move.to },
        }));
        return true;
      } catch {
        return false;
      }
    },
    [updateActiveSession]
  );

  const moveHistory = useMemo(() => undoStack.map((entry) => entry.san), [undoStack]);

  useEffect(() => {
    moveHistoryRef.current = moveHistory;
  }, [moveHistory]);

  const gameStatus = useMemo(() => {
    if (game.isCheckmate()) {
      return 'checkmate';
    }
    if (game.isStalemate()) {
      return 'stalemate';
    }
    if (game.isDraw()) {
      return 'draw';
    }
    if (game.isCheck()) {
      return 'check';
    }
    return '';
  }, [game]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: 'rgba(255, 255, 100, 0.35)' };
      styles[lastMove.to] = { backgroundColor: 'rgba(255, 255, 100, 0.55)' };
    }

    if (game.isCheck()) {
      const board = game.board();
      const turn = game.turn();
      for (const row of board) {
        for (const square of row) {
          if (square && square.type === 'k' && square.color === turn) {
            styles[square.square] = { backgroundColor: 'rgba(255, 60, 60, 0.65)' };
          }
        }
      }
    }

    return styles;
  }, [lastMove, game]);

  const arrows = useMemo(() => {
    const list: Array<{ startSquare: string; endSquare: string; color: string }> = [];

    if (multiPvs.length === 0 && bestMoveUCI && bestMoveUCI.length >= 4) {
      list.push({
        startSquare: bestMoveUCI.slice(0, 2),
        endSquare: bestMoveUCI.slice(2, 4),
        color: '#33cc33',
      });
      return list;
    }

    for (const line of multiPvs) {
      if (!line.pv || line.pv.length === 0) {
        continue;
      }

      const firstMove = line.pv[0];
      if (line.multipv === 1) {
        list.push({
          startSquare: firstMove.slice(0, 2),
          endSquare: firstMove.slice(2, 4),
          color: '#33cc33',
        });

        if (line.pv.length > 1) {
          const secondMove = line.pv[1];
          list.push({
            startSquare: secondMove.slice(0, 2),
            endSquare: secondMove.slice(2, 4),
            color: '#ff3333',
          });
        }
      } else {
        list.push({
          startSquare: firstMove.slice(0, 2),
          endSquare: firstMove.slice(2, 4),
          color: '#3399ff',
        });
      }
    }

    return list;
  }, [bestMoveUCI, multiPvs]);

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
    [activeSessionId, arrows, boardOrientation, game, onDrop, squareStyles]
  );

  return (
    <div className="app-container">
      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={closeSettingsSheet}
        syncToken={syncToken}
        setSyncToken={setSyncToken}
        onSyncNow={() => {
          void syncNow();
        }}
        syncStatus={syncStatus}
        isSyncing={isSyncing}
        isOnline={isOnline}
        onExportSessions={handleExportSessions}
        onImportSessions={(file) => {
          void handleImportSessions(file);
        }}
        canInstall={Boolean(installPromptEvent)}
        onInstallApp={() => {
          void handleInstallApp();
        }}
      />
      <Sidebar
        activeGameName={activeSession.name}
        sessionCount={sessions.length}
        fenInput={fenInput}
        setFenInput={setFenInput}
        onReset={handleReset}
        onOpenSettings={() => setIsSettingsOpen(true)}
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
          canUndo={undoStack.length > 0}
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
              <div className="vertical-eval-fill" style={{ height: `${evalPercent}%` }} />
            </div>
            {memoizedChessboard}
          </div>
        </div>
        <div className="fen-display-row">
          <input type="text" readOnly value={game.fen()} className="premium-input fen-readonly" />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary copy-btn" onClick={handleCopyFen}>
              <FaCopy /> {copied ? 'Copied!' : 'Copy FEN'}
            </button>
            <button className="btn-primary copy-btn" onClick={handleCopyPgn}>
              <FaCopy /> {copiedPgn ? 'Copied!' : 'Copy PGN'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
