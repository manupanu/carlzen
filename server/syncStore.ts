import { createHash } from 'crypto';
import { mkdirSync } from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface HistEntry {
  fen: string;
  san: string;
}

interface SessionRecord {
  id: string;
  name: string;
  fen: string;
  orientation: 'white' | 'black';
  undoStack: HistEntry[];
  redoStack: HistEntry[];
  lastMove?: { from: string; to: string } | null;
  updatedAt: number;
}

export interface SyncState {
  sessions: SessionRecord[];
  activeSessionId: string;
  updatedAt: number;
}

const dbPath = process.env.SYNC_DB_PATH || path.join(process.cwd(), 'data', 'carlzen-sync.db');
mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS sync_documents (
    token_hash TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

const selectDocument = db.prepare(
  'SELECT payload FROM sync_documents WHERE token_hash = ?'
);

const upsertDocument = db.prepare(`
  INSERT INTO sync_documents (token_hash, payload, updated_at, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(token_hash) DO UPDATE SET
    payload = excluded.payload,
    updated_at = excluded.updated_at
`);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeToken(token: unknown): string {
  if (typeof token !== 'string') {
    throw new Error('Sync token must be a string.');
  }

  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error('Sync token is required.');
  }

  if (trimmed.length > 128) {
    throw new Error('Sync token must be 128 characters or fewer.');
  }

  return trimmed;
}

function toTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : fallback;
}

function sanitizeHistoryEntry(value: unknown): HistEntry | null {
  if (!isObject(value) || typeof value.fen !== 'string' || typeof value.san !== 'string') {
    return null;
  }

  return {
    fen: value.fen,
    san: value.san,
  };
}

function sanitizeMove(value: unknown): { from: string; to: string } | null {
  if (!isObject(value) || typeof value.from !== 'string' || typeof value.to !== 'string') {
    return null;
  }

  return { from: value.from, to: value.to };
}

function sanitizeSession(value: unknown, index: number, documentUpdatedAt: number): SessionRecord | null {
  if (!isObject(value) || typeof value.id !== 'string') {
    return null;
  }

  const undoStack = Array.isArray(value.undoStack)
    ? value.undoStack.map(sanitizeHistoryEntry).filter((entry): entry is HistEntry => entry !== null)
    : [];
  const redoStack = Array.isArray(value.redoStack)
    ? value.redoStack.map(sanitizeHistoryEntry).filter((entry): entry is HistEntry => entry !== null)
    : [];

  return {
    id: value.id,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : `Game ${index + 1}`,
    fen: typeof value.fen === 'string' && value.fen.trim() ? value.fen : START_FEN,
    orientation: value.orientation === 'black' ? 'black' : 'white',
    undoStack,
    redoStack,
    lastMove: sanitizeMove(value.lastMove),
    updatedAt: toTimestamp(value.updatedAt, documentUpdatedAt),
  };
}

function createDefaultSession(updatedAt: number): SessionRecord {
  return {
    id: updatedAt.toString(36),
    name: 'Game 1',
    fen: START_FEN,
    orientation: 'white',
    undoStack: [],
    redoStack: [],
    lastMove: null,
    updatedAt,
  };
}

function sanitizeState(value: unknown): SyncState {
  if (!isObject(value)) {
    throw new Error('Sync state must be an object.');
  }

  const updatedAt = toTimestamp(value.updatedAt, Date.now());
  const sessions = Array.isArray(value.sessions)
    ? value.sessions
        .map((session, index) => sanitizeSession(session, index, updatedAt))
        .filter((session): session is SessionRecord => session !== null)
    : [];

  const dedupedSessions = Array.from(
    new Map(sessions.map((session) => [session.id, session] as const)).values()
  );

  const safeSessions = dedupedSessions.length > 0 ? dedupedSessions : [createDefaultSession(updatedAt)];
  const activeSessionId =
    typeof value.activeSessionId === 'string' &&
    safeSessions.some((session) => session.id === value.activeSessionId)
      ? value.activeSessionId
      : safeSessions[0].id;

  return {
    sessions: safeSessions,
    activeSessionId,
    updatedAt,
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function readSyncState(token: unknown): SyncState | null {
  const normalizedToken = sanitizeToken(token);
  const row = selectDocument.get(hashToken(normalizedToken)) as { payload: string } | undefined;

  if (!row) {
    return null;
  }

  try {
    return sanitizeState(JSON.parse(row.payload));
  } catch {
    return null;
  }
}

export function writeSyncState(token: unknown, incomingState: unknown): SyncState {
  const normalizedToken = sanitizeToken(token);
  const nextState = sanitizeState(incomingState);
  const existingState = readSyncState(normalizedToken);

  if (existingState && existingState.updatedAt > nextState.updatedAt) {
    return existingState;
  }

  const now = Date.now();
  upsertDocument.run(
    hashToken(normalizedToken),
    JSON.stringify(nextState),
    nextState.updatedAt,
    now
  );

  return nextState;
}
