import { describe, expect, it } from 'vitest';
import { findBoard } from './boardFinder';
import type { Img, RGB } from './recognizer';
import { findAnyBoard, findTexturedBoard } from './texturedBoardFinder';
import { START, page, render, rows } from './testHelpers';

const mid = rows('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');
const WOOD: [RGB, RGB] = [
  [222, 184, 135],
  [140, 98, 60],
];

function expectFound(found: ReturnType<typeof findBoard>, x: number, y: number, size: number) {
  expect(found).not.toBeNull();
  const f = found!;
  expect(Math.abs(f.x - x)).toBeLessThan(size / 8 / 4);
  expect(Math.abs(f.y - y)).toBeLessThan(size / 8 / 4);
  expect(Math.abs(f.size - size)).toBeLessThan(size / 8 / 3);
}

describe('findTexturedBoard', () => {
  it('finds a wood board where the flat-colour finder sees nothing', () => {
    const img = page(800, 450, render(mid, { light: WOOD[0], dark: WOOD[1], texture: 12 }), 60, 25, 400);
    expect(findBoard(img)).toBeNull();
    const found = findTexturedBoard(img);
    expectFound(found, 60, 25, 400);
    expect(found?.textured).toBe(true);
  });

  it('finds textured boards of different sizes and positions', () => {
    for (const [x, y, size] of [[20, 10, 288], [150, 30, 384], [300, 40, 400]]) {
      const img = page(800, 450, render(START, { light: WOOD[0], dark: WOOD[1], texture: 10 }), x, y, size);
      expectFound(findAnyBoard(img), x, y, size);
    }
  });

  it('copes with a heavier texture and other colours (marble)', () => {
    const marble: [RGB, RGB] = [
      [235, 232, 225],
      [120, 125, 135],
    ];
    const img = page(800, 450, render(mid, { light: marble[0], dark: marble[1], texture: 18 }), 70, 20, 400);
    expectFound(findAnyBoard(img), 70, 20, 400);
  });

  it('finds the board with highlights, a cursor and pieces on it', () => {
    const board = render(mid, {
      light: WOOD[0],
      dark: WOOD[1],
      texture: 10,
      highlight: [[6, 4], [4, 4]],
      cursor: { x: 100, y: 90 },
      noise: 4,
    });
    expectFound(findAnyBoard(page(800, 450, board, 50, 20, 400)), 50, 20, 400);
  });

  it('returns the flat finder result for ordinary boards', () => {
    const img = page(800, 450, render(mid), 60, 25, 400);
    expect(findAnyBoard(img)?.textured).toBeUndefined();
  });

  it('returns null for pages without a board', () => {
    const w = 800;
    const h = 450;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      const v = (Math.floor(x / 40) + Math.floor(y / 90)) % 3 === 0 ? 60 : 190; // stripes and blocks, not a checkerboard
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v + 15;
    }
    const empty: Img = { data, width: w, height: h };
    expect(findTexturedBoard(empty)).toBeNull();
  });
});
