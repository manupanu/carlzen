import { Chess } from 'chess.js';
import { resolvePosition, type TurnSource } from './position';
import { CLASSES, EMPTY, orient, type Reading, type ScreenReading } from './recognizer';

export type TrackResult =
  { fen: string; flipped: boolean; via: 'tracked' | 'free'; source?: TurnSource } | { hold: string };

const HISTORY = 30;
/** Average ranks the black pieces must be below the white ones before the board is judged upside down. */
const UPSIDE_DOWN_MARGIN = 1;
/** Frames (ticks) to keep waiting for a clean read before accepting a board with unknown squares. */
const MAX_HOLD = 12;

function classesOf(fen: string): number[] {
  const out: number[] = [];
  for (const ch of fen.split(' ')[0]) {
    if (ch === '/') continue;
    if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(EMPTY);
    else out.push(CLASSES.indexOf(ch));
  }
  return out;
}

/**
 * How much higher (on average, in ranks) the black pieces sit than the white ones: positive when the board
 * is the right way up. Pawns count fully, other pieces half. Turning the board 180 degrees negates it.
 */
export function orientationScore(grid: (string | null)[][]): number {
  let white = 0;
  let whiteWeight = 0;
  let black = 0;
  let blackWeight = 0;
  for (let row = 0; row < 8; row++) {
    for (const p of grid[row]) {
      if (!p) continue;
      const rank = 8 - row;
      const weight = p.toLowerCase() === 'p' ? 1 : 0.5;
      if (p === p.toUpperCase()) {
        white += rank * weight;
        whiteWeight += weight;
      } else {
        black += rank * weight;
        blackWeight += weight;
      }
    }
  }
  if (!whiteWeight || !blackWeight) return 0;
  return black / blackWeight - white / whiteWeight;
}

function onePly(fen: string): string[] {
  try {
    return new Chess(fen).moves({ verbose: true }).map((m) => m.after);
  } catch {
    return [];
  }
}

function twoPly(fen: string): string[] {
  return onePly(fen).flatMap(onePly);
}

/**
 * Chooses the position that best explains what the camera sees, among the current position, every
 * position one (or two) legal moves away, and recently seen positions. A square hidden by the cursor
 * costs every candidate the same, so it cannot decide the outcome.
 */
export class Tracker {
  private current: string | null = null;
  private history: string[] = [];
  private holdTicks = 0;
  /** Which side is at the bottom of the screen, once known. */
  private flipped: boolean | null = null;

  /** `prior`: the orientation to assume until the board itself says otherwise (from calibration). */
  private prior: boolean;

  constructor(prior = false) {
    this.prior = prior;
  }

  get orientation(): boolean {
    return this.flipped ?? this.prior;
  }

  setPrior(flipped: boolean) {
    this.prior = flipped;
  }

  reset() {
    this.current = null;
    this.history = [];
    this.holdTicks = 0;
    this.flipped = null;
  }

  /** Tell the tracker which position (and orientation) was accepted. */
  commit(fen: string, flipped = this.orientation) {
    if (this.flipped !== null && this.flipped !== flipped) {
      this.history = []; // positions of a different game orientation say nothing about this one
      this.current = null;
    }
    if (this.current && this.current !== fen) {
      this.history = [this.current, ...this.history.filter((f) => f !== this.current && f !== fen)].slice(
        0,
        HISTORY,
      );
    }
    this.flipped = flipped;
    this.current = fen;
    this.holdTicks = 0;
  }

  update(screen: ScreenReading): TrackResult {
    const here = this.orientation;
    if (this.current) {
      // the position we know about, seen from the current side, then from the other side
      for (const flipped of [here, !here]) {
        const reading = orient(screen, flipped);
        const near = [this.current, ...onePly(this.current), ...this.history];
        let fen = this.pick(near, reading);
        if (!fen && flipped === here) fen = this.pick(twoPly(this.current), reading);
        if (fen) {
          this.holdTicks = 0;
          return { fen, flipped, via: 'tracked' };
        }
      }
    }

    // Nothing nearby explains the board: a jump to another position, another game, or a bad frame.
    // Decide which way up the board is: keep the current side unless the pieces say it is upside down.
    const reading = orient(screen, here);
    const margin = this.current ? UPSIDE_DOWN_MARGIN : 0;
    const flipped = orientationScore(reading.grid) < -margin ? !here : here;
    const chosen = flipped === here ? reading : orient(screen, flipped);
    if (!chosen.hasUnknown || this.holdTicks >= MAX_HOLD) {
      const resolved = resolvePosition({
        grid: chosen.grid,
        highlighted: chosen.highlighted,
        prevFen: flipped === here ? this.current : null,
        override: null,
      });
      if (resolved) {
        this.holdTicks = 0;
        return { fen: resolved.fen, flipped, via: 'free', source: resolved.source };
      }
    }
    this.holdTicks++;
    return {
      hold: chosen.hasUnknown
        ? 'Board partly hidden (cursor or overlay?)'
        : 'Cannot read a legal position (is something covering the board?)',
    };
  }

  /** The best-scoring candidate, if it explains the reading well enough. */
  private pick(candidates: string[], reading: Reading): string | null {
    const n = CLASSES.length;
    let bestFen: string | null = null;
    let bestClasses: number[] = [];
    let bestScore = Infinity;
    for (const fen of candidates) {
      const classes = classesOf(fen);
      let score = 0;
      for (let sq = 0; sq < 64; sq++) score += reading.dist[sq * n + classes[sq]];
      if (score < bestScore) {
        bestScore = score;
        bestFen = fen;
        bestClasses = classes;
      }
    }
    if (!bestFen) return null;

    // Squares where the candidate disagrees with the plain reading must be unknown squares (hidden by
    // the cursor, an arrow...), or at most one confident square whose extra distance stays small.
    // Counting squares as well as distance means a stale position cannot be kept just because pieces
    // are thin and their distances are small.
    let extra = 0;
    let confident = 0;
    for (let sq = 0; sq < 64; sq++) {
      if (bestClasses[sq] === reading.best[sq] || reading.unknown[sq]) continue;
      confident++;
      extra += reading.dist[sq * n + bestClasses[sq]] - reading.dist[sq * n + reading.best[sq]];
    }
    return confident <= 1 && extra <= reading.threshold ? bestFen : null;
  }
}
