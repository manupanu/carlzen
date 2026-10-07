import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { Stabilizer, buildFen, gridToPlacement, inferCastling, resolvePosition, type Grid } from './position';

/** Board grid (White's perspective) from a FEN. */
function gridOf(fen: string): Grid {
  return fen
    .split(' ')[0]
    .split('/')
    .map((row) => {
      const out: (string | null)[] = [];
      for (const ch of row) {
        if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
        else out.push(ch);
      }
      return out;
    });
}

const START = new Chess().fen();

describe('fen assembly', () => {
  it('round-trips the placement', () => {
    expect(gridToPlacement(gridOf(START))).toBe(START.split(' ')[0]);
  });
  it('infers castling rights from home squares', () => {
    expect(inferCastling(gridOf(START))).toBe('KQkq');
    const noWhiteKing = gridOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR w - - 0 1');
    noWhiteKing[6] = ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'];
    expect(inferCastling(noWhiteKing)).toBe('kq');
  });
  it('builds a full FEN', () => {
    expect(buildFen(gridOf(START), 'w')).toBe(`${START.split(' ')[0]} w KQkq - 0 1`);
  });
});

describe('resolvePosition', () => {
  const afterE4 = (() => {
    const c = new Chess();
    c.move('e4');
    return c.fen();
  })();

  it('uses the move from the previous position', () => {
    const r = resolvePosition({ grid: gridOf(afterE4), highlighted: [], prevFen: START, override: null });
    expect(r?.turn).toBe('b');
    expect(r?.source).toBe('move');
  });

  it('detects stepping backwards', () => {
    const r = resolvePosition({ grid: gridOf(START), highlighted: [], prevFen: afterE4, override: null });
    expect(r?.turn).toBe('w');
    expect(r?.source).toBe('move');
  });

  it('falls back to the last-move highlight', () => {
    // e2 and e4 highlighted; the pawn on e4 is white, so Black is to move
    const r = resolvePosition({
      grid: gridOf(afterE4),
      highlighted: [
        [6, 4],
        [4, 4],
      ],
      prevFen: null,
      override: null,
    });
    expect(r?.turn).toBe('b');
    expect(r?.source).toBe('highlight');
  });

  it('guesses White when nothing else is known', () => {
    const r = resolvePosition({ grid: gridOf(START), highlighted: [], prevFen: null, override: null });
    expect(r?.turn).toBe('w');
    expect(r?.source).toBe('guess');
  });

  it('honours a manual override when legal', () => {
    const r = resolvePosition({ grid: gridOf(afterE4), highlighted: [], prevFen: START, override: 'w' });
    expect(r?.source).toBe('manual');
    expect(r?.turn).toBe('w');
  });

  it('rejects a position where the side not to move is in check', () => {
    // black king on e8 attacked by the rook on e1; with White to move that is illegal
    const grid = gridOf('4k3/8/8/8/8/8/8/K3R3 w - - 0 1');
    const r = resolvePosition({ grid, highlighted: [], prevFen: null, override: 'w' });
    expect(r?.turn).toBe('b');
  });

  it('returns null for an impossible board', () => {
    const grid = gridOf('8/8/8/8/8/8/8/8 w - - 0 1');
    expect(resolvePosition({ grid, highlighted: [], prevFen: null, override: null })).toBeNull();
  });
});

describe('Stabilizer', () => {
  it('needs two identical frames in a row', () => {
    const s = new Stabilizer(2);
    expect(s.push('a')).toBeNull();
    expect(s.push('b')).toBeNull();
    expect(s.push('b')).toBe('b');
    expect(s.push('a')).toBeNull();
  });
});
