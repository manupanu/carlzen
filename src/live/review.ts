import { Chess } from 'chess.js';

export interface Played {
  san: string;
  uci: string;
}

/** An engine score from White's point of view, as in CarlZen's `EvalResult` (mate > 0: White mates). */
export interface WhiteScore {
  cp?: number;
  mate?: number;
}

/** The move that turned `prevFen` into `newFen`, if exactly one legal move does. */
export function movePlayed(prevFen: string, newFen: string): Played | null {
  let chess: Chess;
  try {
    chess = new Chess(prevFen);
  } catch {
    return null;
  }
  const target = newFen.split(' ')[0];
  const hits = chess.moves({ verbose: true }).filter((m) => m.after.split(' ')[0] === target);
  if (hits.length !== 1) return null;
  const m = hits[0];
  return { san: m.san, uci: m.from + m.to + (m.promotion ?? '') };
}

/** White's share of the game (0..1): a logistic curve over centipawns, a mate is all or nothing. */
export function whiteShare(score: WhiteScore): number {
  if (score.mate !== undefined) return score.mate > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-(score.cp ?? 0) / 250));
}

/**
 * Share of the game (0..1) the player who just moved gave away by playing this move instead of the best
 * one: the evaluation of the position before the move against the evaluation after it.
 */
export function winShareLost(prevFen: string, before: WhiteScore, after: WhiteScore): number {
  const moverIsWhite = prevFen.split(' ')[1] === 'w';
  const b = whiteShare(before);
  const a = whiteShare(after);
  return Math.max(0, moverIsWhite ? b - a : a - b);
}

export type Grade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export function grade(lost: number, playedBest: boolean): Grade {
  if (playedBest || lost < 0.02) return 'best';
  if (lost < 0.05) return 'good';
  if (lost < 0.1) return 'inaccuracy';
  if (lost < 0.2) return 'mistake';
  return 'blunder';
}

export const GRADE_TEXT: Record<Grade, string> = {
  best: 'Best',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/** What was found out about a move that was played: how good it was and what was better. */
export interface MoveReview {
  grade: Grade;
  /** Win chance given away, in percent. */
  lostPct: number;
  /** The move the engine preferred, in SAN (only worth showing when the played move was not best). */
  bestSan?: string;
}

const GRADES: Grade[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];

/** Accepts only well-formed reviews (they come back from storage and from the sync server). */
export function sanitizeReview(value: unknown): MoveReview | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.grade !== 'string' || !GRADES.includes(v.grade as Grade)) return undefined;
  const lostPct =
    typeof v.lostPct === 'number' && Number.isFinite(v.lostPct) ? Math.min(100, Math.max(0, Math.round(v.lostPct))) : 0;
  const review: MoveReview = { grade: v.grade as Grade, lostPct };
  if (typeof v.bestSan === 'string' && v.bestSan.length > 0 && v.bestSan.length <= 12) review.bestSan = v.bestSan;
  return review;
}

/** One line for the Live panel, e.g. `Mistake: Nf3 (−15% win chance), best was Nc3`. */
export function describeReview(san: string, review: MoveReview): string {
  let text = `${GRADE_TEXT[review.grade]}: ${san}`;
  if (review.grade === 'inaccuracy' || review.grade === 'mistake' || review.grade === 'blunder') {
    text += ` (−${review.lostPct}% win chance)`;
    if (review.bestSan) text += `, best was ${review.bestSan}`;
  }
  return text;
}

/** Chess annotation symbol for the move history; good moves get none. */
export function gradeSymbol(grade: Grade): string {
  if (grade === 'inaccuracy') return '?!';
  if (grade === 'mistake') return '?';
  if (grade === 'blunder') return '??';
  return '';
}
