import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { describeReview, grade, gradeSymbol, movePlayed, sanitizeReview, summarizeReviews, whiteShare, winShareLost } from './review';

describe('movePlayed', () => {
  it('finds the move between two positions', () => {
    const c = new Chess();
    const before = c.fen();
    c.move('e4');
    expect(movePlayed(before, c.fen())).toEqual({ san: 'e4', uci: 'e2e4' });
  });

  it('knows promotions', () => {
    const c = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const before = c.fen();
    c.move('a8=Q+');
    expect(movePlayed(before, c.fen())?.uci).toBe('a7a8q');
  });

  it('returns null when more than one move apart', () => {
    const c = new Chess();
    const before = c.fen();
    c.move('e4');
    c.move('e5');
    expect(movePlayed(before, c.fen())).toBeNull();
  });
});

describe('whiteShare', () => {
  it('is even at zero and tilts with the evaluation', () => {
    expect(whiteShare({ cp: 0 })).toBeCloseTo(0.5, 5);
    expect(whiteShare({ cp: 300 })).toBeGreaterThan(0.75);
    expect(whiteShare({ cp: -300 })).toBeLessThan(0.25);
  });

  it('treats a mate as certain', () => {
    expect(whiteShare({ mate: 3 })).toBe(1);
    expect(whiteShare({ mate: -2 })).toBe(0);
  });
});

describe('winShareLost', () => {
  const whiteToMove = new Chess().fen();
  const blackToMove = (() => {
    const c = new Chess();
    c.move('e4');
    return c.fen();
  })();

  it('is zero when the evaluation holds', () => {
    expect(winShareLost(whiteToMove, { cp: 30 }, { cp: 30 })).toBeCloseTo(0, 5);
  });

  it('measures what White gave away', () => {
    expect(winShareLost(whiteToMove, { cp: 200 }, { cp: -100 })).toBeGreaterThan(0.2);
  });

  it('measures what Black gave away', () => {
    expect(winShareLost(blackToMove, { cp: -150 }, { cp: 150 })).toBeGreaterThan(0.2);
  });

  it('is never negative', () => {
    expect(winShareLost(whiteToMove, { cp: 0 }, { cp: 300 })).toBe(0);
  });

  it('counts walking into a mate as the worst loss', () => {
    expect(winShareLost(whiteToMove, { cp: 50 }, { mate: -2 })).toBeGreaterThan(0.5);
  });
});

describe('grade', () => {
  it('maps losses to labels', () => {
    expect(grade(0.001, false)).toBe('best');
    expect(grade(0.03, false)).toBe('good');
    expect(grade(0.07, false)).toBe('inaccuracy');
    expect(grade(0.15, false)).toBe('mistake');
    expect(grade(0.4, false)).toBe('blunder');
    expect(grade(0.4, true)).toBe('best');
  });
});

describe('sanitizeReview', () => {
  it('keeps a well-formed review', () => {
    expect(sanitizeReview({ grade: 'mistake', lostPct: 14.6, bestSan: 'Nc3' })).toEqual({
      grade: 'mistake',
      lostPct: 15,
      bestSan: 'Nc3',
    });
  });

  it('drops anything that is not a review', () => {
    expect(sanitizeReview(null)).toBeUndefined();
    expect(sanitizeReview('mistake')).toBeUndefined();
    expect(sanitizeReview({ grade: 'awful', lostPct: 3 })).toBeUndefined();
  });

  it('clamps numbers and ignores a silly best move', () => {
    expect(sanitizeReview({ grade: 'blunder', lostPct: 900, bestSan: 'x'.repeat(40) })).toEqual({
      grade: 'blunder',
      lostPct: 100,
    });
    expect(sanitizeReview({ grade: 'good', lostPct: Number.NaN })).toEqual({ grade: 'good', lostPct: 0 });
  });
});

describe('describeReview', () => {
  it('names the grade, and for bad moves the loss and the better move', () => {
    expect(describeReview('Nf3', { grade: 'best', lostPct: 0 })).toBe('Best: Nf3');
    expect(describeReview('h4', { grade: 'blunder', lostPct: 31, bestSan: 'e4' })).toBe(
      'Blunder: h4 (−31% win chance), best was e4',
    );
  });
});

describe('gradeSymbol', () => {
  it('uses the usual annotations', () => {
    expect(gradeSymbol('inaccuracy')).toBe('?!');
    expect(gradeSymbol('mistake')).toBe('?');
    expect(gradeSymbol('blunder')).toBe('??');
    expect(gradeSymbol('best')).toBe('');
  });
});

describe('summarizeReviews', () => {
  it('returns null without reviews', () => {
    expect(summarizeReviews([undefined, undefined])).toBeNull();
  });

  it('counts grades and averages the lost win chance', () => {
    const s = summarizeReviews([
      { grade: 'best', lostPct: 0 },
      undefined,
      { grade: 'blunder', lostPct: 30 },
      { grade: 'good', lostPct: 3 },
    ])!;
    expect(s.moves).toBe(3);
    expect(s.counts).toMatchObject({ best: 1, good: 1, blunder: 1, mistake: 0 });
    expect(s.accuracy).toBe(89);
  });
});
