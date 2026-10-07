import { describe, expect, it } from 'vitest';
import { calibrate, recognizeBoard, squareFeatures } from './recognizer';
import { START, render, rows, squareSpot } from './testHelpers';

describe('squareFeatures', () => {
  it('sees an empty square as empty and a piece as a piece', () => {
    const img = render(rows('4k3/8/8/8/8/8/8/4K3'));
    expect(squareFeatures(img, 3, 3).coverage).toBeLessThan(0.06);
    expect(squareFeatures(img, 0, 4).coverage).toBeGreaterThan(0.06);
  });

  it('ignores the background colour behind a piece', () => {
    const plain = squareFeatures(render(rows('8/8/8/8/8/8/8/R7')), 7, 0);
    const lit = squareFeatures(render(rows('8/8/8/8/8/8/8/R7'), { highlight: [[7, 0]] }), 7, 0);
    expect([...lit.vec]).toEqual([...plain.vec]);
  });
});

describe('calibrate + recognizeBoard', () => {
  it('reads the starting position back', () => {
    const cal = calibrate(render(START));
    expect(cal.flipped).toBe(false);
    expect(recognizeBoard(render(START), cal).grid).toEqual(START);
  });

  it('recognizes a different position', () => {
    const cal = calibrate(render(START));
    const mid = rows('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');
    expect(recognizeBoard(render(mid), cal).grid).toEqual(mid);
  });

  it('handles a board shown from Black’s side', () => {
    const cal = calibrate(render(START, { flipped: true }));
    expect(cal.flipped).toBe(true);
    const mid = rows('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR');
    expect(recognizeBoard(render(mid, { flipped: true }), cal).grid).toEqual(mid);
  });

  it('reports highlighted squares', () => {
    const cal = calibrate(render(START));
    const after = rows('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
    const hl: [number, number][] = [
      [6, 4],
      [4, 4],
    ];
    const got = recognizeBoard(render(after, { highlight: hl }), cal).highlighted;
    expect(got).toHaveLength(2);
    expect(got).toEqual(expect.arrayContaining(hl));
  });

  it('refuses to calibrate on a non-starting position', () => {
    expect(() => calibrate(render(rows('4k3/8/8/8/8/8/8/4K3')))).toThrow(/starting position/);
  });
});

describe('robustness', () => {
  it('still reads white pieces with little contrast against light squares', () => {
    const faint = 248; // light squares are ~238, so the fill is only slightly brighter
    const cal = calibrate(render(START, { whiteFill: faint }));
    const mid = rows('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');
    expect(recognizeBoard(render(mid, { whiteFill: faint }), cal).grid).toEqual(mid);
  });

  it('tolerates video-compression-like noise', () => {
    const cal = calibrate(render(START, { noise: 10 }));
    const mid = rows('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');
    const got = recognizeBoard(render(mid, { noise: 10 }), cal);
    expect(got.grid).toEqual(mid);
    expect(got.hasUnknown).toBe(false);
  });

  it('flags a square hidden by a large overlay as unknown', () => {
    const cal = calibrate(render(START));
    const mid = rows('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');
    const img = render(mid);
    // paint a solid red blob over most of c4 (row 4, col 2)
    for (let y = 4 * 32 + 4; y < 4 * 32 + 28; y++) {
      for (let x = 2 * 32 + 4; x < 2 * 32 + 28; x++) {
        const i = (y * 256 + x) * 4;
        img.data[i] = 220;
        img.data[i + 1] = 30;
        img.data[i + 2] = 30;
      }
    }
    const got = recognizeBoard(img, cal);
    expect(got.unknown[4 * 8 + 2]).toBe(true);
    expect(got.unknown.filter(Boolean)).toHaveLength(1);
  });

  it('never reads a hovering cursor as a confident different piece', () => {
    const cal = calibrate(render(START));
    const mid = rows('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');
    let wrong = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const got = recognizeBoard(render(mid, { cursor: squareSpot(r, c) }), cal);
        const sq = r * 8 + c;
        // the square under the cursor may be wrong only if it is flagged unknown
        if (got.grid[r][c] !== mid[r][c] && !got.unknown[sq]) wrong++;
      }
    }
    expect(wrong).toBe(0);
  });
});
