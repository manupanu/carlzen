import { describe, expect, it } from 'vitest';
import { formatCoachRequest } from './coachPrompt';

describe('formatCoachRequest', () => {
  it('includes the basics and skips missing fields', () => {
    const text = formatCoachRequest({ fen: 'F', move: 'e4' });
    expect(text).toBe('Position FEN: F\nBest move (SAN): e4');
  });

  it('ignores values of the wrong type and caps list sizes', () => {
    const text = formatCoachRequest({
      fen: 'F',
      move: 'e4',
      scoreCp: 'big',
      recentMoves: Array.from({ length: 20 }, (_, i) => `m${i}`),
      topLines: [1, null, { cp: 30, san: ['e4', 'e5'], uci: ['e2e4'] }, {}, {}, {}],
    });
    expect(text).not.toContain('centipawn');
    expect(text).toContain('m19');
    expect(text).not.toContain('m11 ');
    expect(text.match(/^#\d/gm)).toHaveLength(3);
    expect(text).toContain('cp 30; SAN: e4 e5; UCI: e2e4');
  });
});
