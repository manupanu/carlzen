import type { Grid } from './position';
import type { Img, RGB } from './recognizer';

export const S = 32;
export const LIGHT: RGB = [238, 238, 210];
export const DARK: RGB = [118, 150, 86];
export const HILITE: RGB = [246, 246, 105];

// Each piece type gets its own silhouette: [x0, y0, x1, y1] boxes in 0..1 square coordinates.
const SHAPES: Record<string, number[][]> = {
  p: [[0.35, 0.3, 0.65, 0.8]],
  n: [
    [0.25, 0.5, 0.75, 0.8],
    [0.25, 0.2, 0.5, 0.5],
  ],
  b: [
    [0.4, 0.15, 0.6, 0.85],
    [0.25, 0.7, 0.75, 0.85],
  ],
  r: [[0.25, 0.2, 0.75, 0.85]],
  q: [
    [0.2, 0.15, 0.8, 0.85],
    [0.4, 0.1, 0.6, 0.2],
  ],
  k: [
    [0.3, 0.3, 0.7, 0.85],
    [0.45, 0.1, 0.55, 0.35],
    [0.35, 0.18, 0.65, 0.26],
  ],
};

export interface RenderOptions {
  flipped?: boolean;
  highlight?: [number, number][];
  /** Mouse cursor tip in board pixels (0..255). */
  cursor?: { x: number; y: number };
  /** Peak noise added to every channel, like video compression artefacts. */
  noise?: number;
  /** Brightness of white pieces (default 250). */
  whiteFill?: number;
  /** Wood/marble-like texture amplitude added to every square (0 = flat colours). */
  texture?: number;
  /** Board colours (default LIGHT / DARK). */
  light?: RGB;
  dark?: RGB;
}

let seed = 12345;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

/** Paints a board; `grid` is from White's side, `flipped` draws it from Black's side. */
export function render(grid: Grid, opts: RenderOptions = {}): Img {
  const w = S * 8;
  const data = new Uint8ClampedArray(w * w * 4);
  const px = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= w || y >= w) return;
    const i = (y * w + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  };
  const wf = opts.whiteFill ?? 250;
  const tex = opts.texture ?? 0;
  // horizontal grain: every pixel row of the board is a little brighter or darker
  const streak = Array.from({ length: w }, () => (rand() * 2 - 1) * tex);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const gr = opts.flipped ? 7 - r : r;
      const gc = opts.flipped ? 7 - c : c;
      const hi = opts.highlight?.some(([hr, hc]) => hr === gr && hc === gc);
      const bg = hi ? HILITE : (r + c) % 2 === 0 ? (opts.light ?? LIGHT) : (opts.dark ?? DARK);
      const shift = tex ? (rand() * 2 - 1) * tex * 0.6 : 0;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const n = tex ? streak[r * S + y] + shift + (rand() * 2 - 1) * tex * 0.5 : 0;
          px(c * S + x, r * S + y, [bg[0] + n, bg[1] + n * 0.8, bg[2] + n * 0.6]);
        }
      }
      const piece = grid[gr][gc];
      if (!piece) continue;
      const white = piece === piece.toUpperCase();
      const fill: RGB = white ? [wf, wf, wf] : [30, 30, 30];
      for (const [x0, y0, x1, y1] of SHAPES[piece.toLowerCase()]) {
        for (let y = Math.floor(y0 * S); y < y1 * S; y++) {
          for (let x = Math.floor(x0 * S); x < x1 * S; x++) px(c * S + x, r * S + y, fill);
        }
      }
    }
  }
  if (opts.cursor) {
    // arrow: black outline, white inside, about 12px tall and 7px wide at this scale
    const { x, y } = opts.cursor;
    for (let dy = 0; dy < 12; dy++) {
      const half = Math.ceil(dy * 0.6);
      for (let dx = 0; dx <= half; dx++) {
        const inner = dx > 0 && dx < half && dy > 0 && dy < 11;
        px(x + dx, y + dy, inner ? [255, 255, 255] : [0, 0, 0]);
      }
    }
  }
  if (opts.noise) {
    for (let i = 0; i < data.length; i += 4) {
      for (let k = 0; k < 3; k++) data[i + k] += (rand() * 2 - 1) * opts.noise;
    }
  }
  return { data, width: w, height: w };
}

export const rows = (s: string): Grid =>
  s.split('/').map((row) => {
    const out: (string | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
      else out.push(ch);
    }
    return out;
  });

export const START = rows('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');

/** Centre of a board square (screen row/col) in pixels, nudged so the cursor tip sits inside it. */
export const squareSpot = (row: number, col: number) => ({
  x: col * S + S / 2 - 3,
  y: row * S + S / 2 - 6,
});

let pageSeed = 99;
const rnd = () => (pageSeed = (pageSeed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

/** A fake screenshot: busy page background, a sidebar, text-like stripes and a board of `size` px at (x, y). */

export function page(
  w: number,
  h: number,
  board: Img,
  x: number,
  y: number,
  size: number,
  bg: RGB = [38, 36, 33],
): Img {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  const fill = (x0: number, y0: number, x1: number, y1: number, c: RGB) => {
    for (let yy = y0; yy < y1; yy++)
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * w + xx) * 4;
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
      }
  };
  // sidebar, buttons and text lines
  fill(Math.floor(w * 0.72), 0, w, h, [49, 46, 43]);
  for (let k = 0; k < 14; k++)
    fill(
      Math.floor(w * 0.74),
      20 + k * 22,
      Math.floor(w * (0.8 + rnd() * 0.15)),
      28 + k * 22,
      [120, 118, 114],
    );
  fill(Math.floor(w * 0.74), h - 60, Math.floor(w * 0.9), h - 30, [129, 182, 76]); // a green button
  // the board, scaled with nearest neighbour
  for (let yy = 0; yy < size; yy++) {
    for (let xx = 0; xx < size; xx++) {
      const sx = Math.floor((xx / size) * board.width);
      const sy = Math.floor((yy / size) * board.height);
      const si = (sy * board.width + sx) * 4;
      const di = ((y + yy) * w + x + xx) * 4;
      data[di] = board.data[si];
      data[di + 1] = board.data[si + 1];
      data[di + 2] = board.data[si + 2];
    }
  }
  return { data, width: w, height: h };
}
