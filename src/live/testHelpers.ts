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
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const gr = opts.flipped ? 7 - r : r;
      const gc = opts.flipped ? 7 - c : c;
      const hi = opts.highlight?.some(([hr, hc]) => hr === gr && hc === gc);
      const bg = hi ? HILITE : (r + c) % 2 === 0 ? (opts.light ?? LIGHT) : (opts.dark ?? DARK);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(c * S + x, r * S + y, bg);
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
