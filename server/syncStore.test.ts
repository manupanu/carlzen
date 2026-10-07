import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(path.join(tmpdir(), 'carlzen-sync-'));
process.env.SYNC_DB_PATH = path.join(dir, 'sync.db');
const store = await import('./syncStore');

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const stateWith = (undoStack: unknown[]) => ({
  activeSessionId: 's1',
  updatedAt: 1000,
  sessions: [
    {
      id: 's1',
      name: 'Game 1',
      fen: FEN,
      orientation: 'white',
      undoStack,
      redoStack: [],
      lastMove: null,
      updatedAt: 1000,
    },
  ],
});

describe('sync keeps move reviews', () => {
  it('stores and returns a review with the move', () => {
    const review = { grade: 'blunder', lostPct: 45, bestSan: 'e4' };
    store.writeSyncState('token-a', stateWith([{ fen: FEN, san: 'g4', review }]));
    const back = store.readSyncState('token-a');
    expect(back?.sessions[0].undoStack).toEqual([{ fen: FEN, san: 'g4', review }]);
  });

  it('drops a malformed review but keeps the move', () => {
    store.writeSyncState(
      'token-b',
      stateWith([
        { fen: FEN, san: 'e4', review: { grade: 'awful', lostPct: 3 } },
        { fen: FEN, san: 'e5', review: 'blunder' },
        { fen: FEN, san: 'Nf3' },
      ]),
    );
    const moves = store.readSyncState('token-b')?.sessions[0].undoStack;
    expect(moves).toEqual([
      { fen: FEN, san: 'e4' },
      { fen: FEN, san: 'e5' },
      { fen: FEN, san: 'Nf3' },
    ]);
  });

  it('clamps out-of-range values', () => {
    expect(store.sanitizeReview({ grade: 'mistake', lostPct: 250 })).toEqual({ grade: 'mistake', lostPct: 100 });
  });
});
