import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { calibrate, readScreen } from './recognizer';
import { Tracker, orientationScore, type TrackResult } from './tracker';
import { START, render, rows, squareSpot } from './testHelpers';

const placement = (fen: string) => fen.split(' ')[0];
const fenResult = (r: TrackResult) => ('fen' in r ? r : null);

/** Plays SAN moves and returns the position after each one. */
function game(...moves: string[]) {
  const chess = new Chess();
  return moves.map((m) => {
    chess.move(m);
    return chess.fen();
  });
}

const grid = (fen: string) => rows(placement(fen));

describe('Tracker', () => {
  const cal = calibrate(render(START));
  const read = (fen: string, opts = {}) => readScreen(render(grid(fen), opts), cal);

  function started() {
    const t = new Tracker(cal.flipped);
    const first = fenResult(t.update(read(new Chess().fen())))!;
    expect(first.via).toBe('free');
    t.commit(first.fen);
    return t;
  }

  it('follows a game with the cursor resting on every square', () => {
    const plies = game('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5');
    const t = started();
    const bad: string[] = [];
    for (const [i, fen] of plies.entries()) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const got = fenResult(t.update(read(fen, { cursor: squareSpot(r, c) })));
          if (!got || placement(got.fen) !== placement(fen)) bad.push(`ply ${i + 1} cursor ${r},${c}`);
          else if (got.fen.split(' ')[1] !== fen.split(' ')[1]) bad.push(`ply ${i + 1} turn`);
        }
      }
      t.commit(fen);
    }
    expect(bad).toEqual([]);
  }, 30_000); // renders 384 boards; the default 5s is too tight on CI

  it('finds the side to move after a move without any highlight', () => {
    const [e4] = game('e4');
    const t = started();
    const got = fenResult(t.update(read(e4)))!;
    expect(got.via).toBe('tracked');
    expect(got.fen.split(' ')[1]).toBe('b');
  });

  it('goes back to an earlier position from history', () => {
    const plies = game('e4', 'e5', 'Nf3');
    const t = started();
    for (const fen of plies) t.commit(fen);
    const got = fenResult(t.update(read(plies[0])))!;
    expect(got.via).toBe('tracked');
    expect(placement(got.fen)).toBe(placement(plies[0]));
    expect(got.fen.split(' ')[1]).toBe('b');
  });

  it('follows two moves at once', () => {
    const plies = game('e4', 'e5', 'Nf3');
    const t = started();
    t.commit(plies[0]);
    const got = fenResult(t.update(read(plies[2])))!;
    expect(got.via).toBe('tracked');
    expect(placement(got.fen)).toBe(placement(plies[2]));
  });

  it('falls back to a free reading after a jump to an unrelated position', () => {
    const far = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1';
    const t = started();
    const got = fenResult(t.update(read(far)))!;
    expect(got.via).toBe('free');
    expect(placement(got.fen)).toBe(placement(far));
  });

  it('holds instead of guessing when a hidden square blocks a jump', () => {
    const far = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1';
    const img = render(grid(far));
    for (let y = 4 * 32 + 4; y < 4 * 32 + 28; y++) {
      for (let x = 2 * 32 + 4; x < 2 * 32 + 28; x++) {
        const i = (y * 256 + x) * 4;
        img.data[i] = 220;
        img.data[i + 1] = 30;
        img.data[i + 2] = 30;
      }
    }
    const reading = readScreen(img, cal);
    const t = started();
    // it keeps holding rather than committing to a guess for the hidden square
    for (let i = 0; i < 5; i++) expect('hold' in t.update(reading)).toBe(true);
  });

  describe('orientation', () => {
    const mid = game('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4').at(-1)!;

    it('scores the board the right way up as positive and upside down as negative', () => {
      expect(orientationScore(grid(new Chess().fen()))).toBeGreaterThan(4);
      const rotated = [...grid(new Chess().fen())].reverse().map((r) => [...r].reverse());
      expect(orientationScore(rotated)).toBeLessThan(-4);
      expect(orientationScore(grid(mid))).toBeGreaterThan(0);
    });

    it('ignores a wrong stored orientation on the first reading', () => {
      const t = new Tracker(true); // calibration said "black at the bottom", the screen shows White at the bottom
      const got = fenResult(t.update(read(new Chess().fen())))!;
      expect(got.flipped).toBe(false);
      expect(placement(got.fen)).toBe(placement(new Chess().fen()));
    });

    it('reads a game shown from Black’s side', () => {
      const t = new Tracker(false); // stored orientation says White at the bottom
      const screen = readScreen(render(grid(mid), { flipped: true }), cal);
      const got = fenResult(t.update(screen))!;
      expect(got.flipped).toBe(true);
      expect(placement(got.fen)).toBe(placement(mid));
    });

    it('follows a whole game shown from Black’s side, with the cursor on the board', () => {
      const plies = game('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5');
      const t = new Tracker(false);
      const flippedRead = (fen: string, opts = {}) =>
        readScreen(render(grid(fen), { flipped: true, ...opts }), cal);
      const first = fenResult(t.update(flippedRead(new Chess().fen())))!;
      expect(first.flipped).toBe(true);
      t.commit(first.fen, first.flipped);
      const bad: string[] = [];
      for (const [i, fen] of plies.entries()) {
        const got = fenResult(t.update(flippedRead(fen, { cursor: squareSpot(3, 3) })));
        if (!got || placement(got.fen) !== placement(fen) || !got.flipped) bad.push(`ply ${i + 1}`);
        t.commit(fen, true);
      }
      expect(bad).toEqual([]);
    });

    it('switches when a new game is shown from the other side', () => {
      const plies = game('e4', 'e5', 'Nf3');
      const t = started();
      for (const fen of plies) t.commit(fen, false);
      // a fresh game, but now Black is at the bottom of the screen
      const got = fenResult(t.update(readScreen(render(START, { flipped: true }), cal)))!;
      expect(got.flipped).toBe(true);
      expect(placement(got.fen)).toBe(placement(new Chess().fen()));
      t.commit(got.fen, got.flipped);
      expect(t.orientation).toBe(true);
    });

    it('does not flip on an ordinary jump within the same game', () => {
      const t = started();
      const got = fenResult(t.update(read(mid)))!;
      expect(got.flipped).toBe(false);
    });
  });
});
