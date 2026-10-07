import { describe, expect, it } from 'vitest';
import { findBoard } from './boardFinder';
import type { RGB } from './recognizer';
import { START, page, render, rows, type RenderOptions } from './testHelpers';

const mid = rows('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');

function expectFound(found: ReturnType<typeof findBoard>, x: number, y: number, size: number) {
  expect(found).not.toBeNull();
  const f = found!;
  expect(Math.abs(f.x - x)).toBeLessThan(size / 8 / 6);
  expect(Math.abs(f.y - y)).toBeLessThan(size / 8 / 6);
  expect(Math.abs(f.size - size)).toBeLessThan(size / 8 / 4);
}

describe('findBoard', () => {
  it('finds a board in a busy page', () => {
    const img = page(800, 450, render(mid), 40, 30, 384);
    expectFound(findBoard(img), 40, 30, 384);
  });

  it('finds boards of different sizes and positions', () => {
    for (const [x, y, size] of [
      [10, 10, 240],
      [120, 25, 400],
      [300, 60, 352],
      [20, 5, 440],
    ]) {
      const img = page(800, 450, render(START), x, y, size);
      expectFound(findBoard(img), x, y, size);
    }
  });

  it('finds a board with highlights, a cursor and pieces covering squares', () => {
    const board = render(mid, {
      highlight: [
        [6, 4],
        [4, 4],
      ],
      cursor: { x: 100, y: 90 },
      noise: 4,
    });
    expectFound(findBoard(page(800, 450, board, 60, 20, 400)), 60, 20, 400);
  });

  it('finds boards in other colour themes', () => {
    const themes: [RGB, RGB][] = [
      [
        [240, 217, 181],
        [181, 136, 99],
      ], // brown
      [
        [222, 227, 230],
        [140, 162, 173],
      ], // blue
      [
        [238, 238, 210],
        [118, 150, 86],
      ], // green
      [
        [232, 235, 239],
        [125, 135, 150],
      ], // gray
    ];
    for (const [light, dark] of themes) {
      const found = findBoard(page(800, 450, render(mid, { light, dark }), 70, 30, 392));
      expectFound(found, 70, 30, 392);
      expect(Math.abs(found!.light[0] - light[0])).toBeLessThan(8);
      expect(Math.abs(found!.dark[1] - dark[1])).toBeLessThan(8);
    }
  });

  it('works on a board against a page of a similar colour', () => {
    const img = page(800, 450, render(mid), 50, 20, 400, [118, 150, 86]);
    expectFound(findBoard(img), 50, 20, 400);
  });

  it('finds a blurry board (scaled-down or smoothly upscaled screenshot)', () => {
    const sharp = page(800, 450, render(mid), 60, 25, 400);
    // 7x7 box blur: edges between squares become several pixels wide
    const { data, width: w, height: h } = sharp;
    const blurred = new Uint8ClampedArray(data.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0,
          g = 0,
          b = 0,
          n = 0;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const yy = y + dy,
              xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
            const i = (yy * w + xx) * 4;
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            n++;
          }
        const o = (y * w + x) * 4;
        blurred[o] = r / n;
        blurred[o + 1] = g / n;
        blurred[o + 2] = b / n;
        blurred[o + 3] = 255;
      }
    }
    expectFound(findBoard({ data: blurred, width: w, height: h }), 60, 25, 400);
  });

  it('returns null when there is no board', () => {
    const w = 800;
    const h = 450;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let i = 0; i < w * h; i++) {
      const stripe = Math.floor((i % w) / 40) % 2 ? 40 : 200;
      data[i * 4] = stripe;
      data[i * 4 + 1] = stripe;
      data[i * 4 + 2] = stripe + 20;
    }
    expect(findBoard({ data, width: w, height: h })).toBeNull();
  });
});

// keep the helper options type referenced for readers of this file
export type _Opts = RenderOptions;
