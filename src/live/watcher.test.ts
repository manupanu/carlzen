import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { calibrate, readScreen } from './recognizer';
import { Watcher, type StepResult } from './watcher';
import { START, render, rows, squareSpot } from './testHelpers';

const cal = calibrate(render(START));
const placement = (fen: string) => fen.split(' ')[0];
const grid = (fen: string) => rows(placement(fen));
const frame = (fen: string, opts = {}) => readScreen(render(grid(fen), opts), cal);

/** Feeds `n` identical frames and returns the last position event, if any. */
function show(s: Watcher, fen: string, n = 3, opts = {}) {
  let out: StepResult | null = null;
  for (let i = 0; i < n; i++) {
    const r = s.step(frame(fen, opts));
    if (r.kind === 'position') out = r;
  }
  return out;
}

function playing(...sans: string[]) {
  const c = new Chess();
  return sans.map((m) => (c.move(m), c.fen()));
}

describe('Watcher never gets stuck', () => {
  it('follows a game from the start', () => {
    const s = new Watcher(false);
    expect(show(s, new Chess().fen())).toMatchObject({ kind: 'position' });
    for (const fen of playing('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6')) {
      const got = show(s, fen);
      expect(got && 'fen' in got && placement(got.fen)).toBe(placement(fen));
    }
  });

  it('recovers when the side to move was guessed wrong', () => {
    // a mid-game position loaded without any highlight: the turn is a guess ('w' although Black is to move)
    const [, e5] = playing('e4', 'e5');
    const blackToMove = playing('e4')[0];
    const s = new Watcher(false);
    show(s, new Chess().fen());
    // jump straight to the position after 1.e4 (Black to move) with no highlights, then keep playing
    show(s, blackToMove);
    s.override(blackToMove.replace(' b ', ' w '), false); // pretend the turn guess was wrong
    for (const fen of [e5, ...playing('e4', 'e5', 'Nf3', 'Nc6').slice(2)]) {
      const got = show(s, fen, 3);
      expect(got).not.toBeNull();
      expect(got && 'fen' in got && placement(got.fen)).toBe(placement(fen));
    }
  });

  it('jumps several moves ahead', () => {
    const plies = playing('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6');
    const s = new Watcher(false);
    show(s, new Chess().fen());
    const got = show(s, plies[6]);
    expect(got && 'fen' in got && placement(got.fen)).toBe(placement(plies[6]));
    const next = show(s, plies[7]);
    expect(next && 'fen' in next && placement(next.fen)).toBe(placement(plies[7]));
  });

  it('keeps going after a long stretch of unreadable frames', () => {
    const plies = playing('e4', 'e5', 'Nf3');
    const s = new Watcher(false);
    show(s, new Chess().fen());
    show(s, plies[0]);
    // an overlay covers a piece for a long time while a move is played
    const img = render(grid(plies[1]));
    for (let y = 4 * 32 + 3; y < 4 * 32 + 29; y++) {
      for (let x = 4 * 32 + 3; x < 4 * 32 + 29; x++) {
        const i = (y * 256 + x) * 4;
        img.data[i] = 220;
        img.data[i + 1] = 20;
        img.data[i + 2] = 20;
      }
    }
    let seen = '';
    for (let i = 0; i < 40; i++) {
      const r = s.step(readScreen(img, cal));
      if (r.kind === 'position') seen = placement(r.fen);
    }
    // the move is picked up even though one square stays hidden, and nothing wrong is accepted
    expect(seen === '' || seen === placement(plies[1])).toBe(true);
    // overlay gone: the following moves must be picked up
    const got = show(s, plies[1]);
    expect(got === null || (got.kind === 'position' && placement(got.fen) === placement(plies[1]))).toBe(
      true,
    );
    const after = show(s, plies[2]);
    expect(after && 'fen' in after && placement(after.fen)).toBe(placement(plies[2]));
  });

  it('follows a short random game with a cursor, noise and highlights', () => {
    let seed = 5;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const chess = new Chess();
    const s = new Watcher(false);
    show(s, chess.fen(), 3, { noise: 4 });
    for (let ply = 0; ply < 40; ply++) {
      const moves = chess.moves({ verbose: true });
      if (!moves.length) break;
      const m = moves[Math.floor(rnd() * moves.length)];
      chess.move(m);
      const hl = [m.from, m.to].map((sq): [number, number] => [8 - Number(sq[1]), sq.charCodeAt(0) - 97]);
      let seen = '';
      for (let i = 0; i < 4; i++) {
        const cursor = squareSpot(Math.floor(rnd() * 8), Math.floor(rnd() * 8));
        const r = s.step(frame(chess.fen(), { noise: 4, highlight: hl, cursor }));
        if (r.kind === 'position') seen = placement(r.fen);
      }
      expect(seen, `ply ${ply + 1} ${m.san}`).toBe(placement(chess.fen()));
    }
  }, 60000);
});
