import { Chess, type Color } from 'chess.js';

/** 8x8 board seen from White's side: grid[0] is rank 8, grid[r][0] is file a. FEN letters or null. */
export type Grid = (string | null)[][];

export type TurnSource = 'move' | 'highlight' | 'manual' | 'guess';

export interface Resolved {
  fen: string;
  turn: Color;
  source: TurnSource;
}

export function gridToPlacement(grid: Grid): string {
  return grid
    .map((row) => {
      let s = '';
      let empty = 0;
      for (const p of row) {
        if (p) {
          if (empty) s += empty;
          empty = 0;
          s += p;
        } else empty++;
      }
      return s + (empty || '');
    })
    .join('/');
}

export function inferCastling(grid: Grid): string {
  let s = '';
  if (grid[7][4] === 'K' && grid[7][7] === 'R') s += 'K';
  if (grid[7][4] === 'K' && grid[7][0] === 'R') s += 'Q';
  if (grid[0][4] === 'k' && grid[0][7] === 'r') s += 'k';
  if (grid[0][4] === 'k' && grid[0][0] === 'r') s += 'q';
  return s || '-';
}

export function buildFen(grid: Grid, turn: Color, ep = '-'): string {
  return `${gridToPlacement(grid)} ${turn} ${inferCastling(grid)} ${ep} 0 1`;
}

/** Returns a Chess instance if the FEN is a legal position, otherwise null. */
export function loadLegal(fen: string): Chess | null {
  try {
    const chess = new Chess(fen);
    // the side that is NOT to move must not be in check
    const turn = chess.turn();
    const other: Color = turn === 'w' ? 'b' : 'w';
    const board = chess.board();
    for (const row of board) {
      for (const sq of row) {
        if (sq && sq.type === 'k' && sq.color === other && chess.isAttacked(sq.square, turn)) {
          return null;
        }
      }
    }
    return chess;
  } catch {
    return null;
  }
}

const placementOf = (fen: string) => fen.split(' ')[0];

/** If exactly one legal move from `prevFen` leads to `grid`, returns the resulting FEN. */
export function findForwardMove(prevFen: string, grid: Grid): string | null {
  const target = gridToPlacement(grid);
  let chess: Chess;
  try {
    chess = new Chess(prevFen);
  } catch {
    return null;
  }
  const hits = new Set<string>();
  for (const m of chess.moves({ verbose: true })) {
    if (placementOf(m.after) === target) hits.add(m.after);
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/** True if one legal move from `fen` leads to the board in `prevGrid` (the user stepped backwards). */
function reaches(fen: string, prevPlacement: string): boolean {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return false;
  }
  return chess.moves({ verbose: true }).some((m) => placementOf(m.after) === prevPlacement);
}

/**
 * Works out whose turn it is, trying in order: a manual override, the move from the previous position
 * (forward or backward), the last-move highlight, and finally a guess.
 */
export function resolvePosition(opts: {
  grid: Grid;
  /** Squares (row, col in White's perspective) whose background differs from the plain board colours. */
  highlighted: [number, number][];
  prevFen: string | null;
  override: Color | null;
}): Resolved | null {
  const { grid, highlighted, prevFen, override } = opts;

  const tryTurn = (turn: Color, source: TurnSource, ep = '-'): Resolved | null => {
    const fen = buildFen(grid, turn, ep);
    return loadLegal(fen) ? { fen, turn, source } : null;
  };

  if (override) {
    const r = tryTurn(override, 'manual');
    if (r) return r;
  }

  if (prevFen) {
    const after = findForwardMove(prevFen, grid);
    if (after) {
      const parts = after.split(' ');
      const r = tryTurn(parts[1] as Color, 'move', parts[3]);
      if (r) return r;
    }
    // stepped backwards: the position we came from is one legal move away
    const prevPlacement = placementOf(prevFen);
    for (const turn of ['w', 'b'] as Color[]) {
      const fen = buildFen(grid, turn);
      if (loadLegal(fen) && reaches(fen, prevPlacement)) return { fen, turn, source: 'move' };
    }
  }

  // The piece standing on a highlighted square just moved, so the other side is to move.
  const movers = new Set<string>();
  for (const [r, c] of highlighted) {
    const p = grid[r][c];
    if (p) movers.add(p === p.toUpperCase() ? 'w' : 'b');
  }
  if (movers.size === 1) {
    const mover = [...movers][0] as Color;
    const r = tryTurn(mover === 'w' ? 'b' : 'w', 'highlight');
    if (r) return r;
  }

  return tryTurn('w', 'guess') ?? tryTurn('b', 'guess');
}

/** Accepts a value once it was seen in `needed` consecutive frames. */
export class Stabilizer {
  private last: string | null = null;
  private count = 0;
  private needed: number;

  constructor(needed = 2) {
    this.needed = needed;
  }

  push(key: string): string | null {
    if (key === this.last) this.count++;
    else {
      this.last = key;
      this.count = 1;
    }
    return this.count >= this.needed ? key : null;
  }

  reset() {
    this.last = null;
    this.count = 0;
  }
}
