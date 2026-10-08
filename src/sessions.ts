import { Chess } from 'chess.js';
import type { HistEntry, Session } from './SessionTabs';
import { sanitizeReview } from './live/review';

export const START_FEN = new Chess().fen();

export interface MultiPvLine {
  multipv: number;
  pv: string[];
  cp?: number;
  mate?: number;
}

export function cpToPercent(cp: number): number {
  const capped = Math.max(-1000, Math.min(1000, cp));
  return 50 + (capped / 1000) * 45;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeHistoryEntry(value: unknown): HistEntry | null {
  if (!isObject(value) || typeof value.fen !== 'string' || typeof value.san !== 'string') {
    return null;
  }

  const review = sanitizeReview(value.review);
  return review ? { fen: value.fen, san: value.san, review } : { fen: value.fen, san: value.san };
}

export function createSession(
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

export function normalizeSession(value: unknown, index: number, fallbackUpdatedAt = Date.now()): Session | null {
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

export function normalizeSessions(value: unknown, fallbackUpdatedAt = Date.now()): Session[] {
  const sessions = Array.isArray(value)
    ? value
        .map((session, index) => normalizeSession(session, index, fallbackUpdatedAt))
        .filter((session): session is Session => session !== null)
    : [];

  const deduped = Array.from(new Map(sessions.map((session) => [session.id, session] as const)).values());
  return deduped.length > 0 ? deduped : [createSession('Game 1', {}, fallbackUpdatedAt)];
}

export function isTrivialState(sessions: Session[], activeSessionId: string): boolean {
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

export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
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

export function isSamePvLine(left: MultiPvLine, right: MultiPvLine): boolean {
  return (
    left.multipv === right.multipv &&
    left.cp === right.cp &&
    left.mate === right.mate &&
    left.pv.length === right.pv.length &&
    left.pv.every((move, index) => move === right.pv[index])
  );
}

export function uciToSan(fen: string, uciMove: string): string {
  const game = new Chess(fen);
  const move = game.move(uciMove);
  return move.san;
}
