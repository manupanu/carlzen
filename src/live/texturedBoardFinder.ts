import { findBoard, type BoardFound } from './boardFinder';
import type { Img, RGB } from './recognizer';

/** Half-width of the windows compared across an edge between two squares (pixels). */
const K = 3;
/** Rows (columns) averaged along an edge, which smooths grain and noise. */
const ALONG = 2;
/** Normalised edge strength that at least 6 of the 7 inner lines of the board must reach. */
const MIN_LINE = 0.3;
/** Light squares must be at least this much brighter than dark ones (0..255). */
const MIN_CONTRAST = 20;
const MIN_PASS = 0.9;
/** Votes are clamped so the strong outer border of the board cannot outweigh the inner lines. */
const MAX_VOTE = 1.5;
const CANDIDATES = 6;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};

/**
 * Where brightness changes between neighbouring pixels, summed along each column (and row), normalised so a
 * clear edge is about 1. Wood grain and marble veins change brightness too, but not along straight lines at
 * regular spacing, so the lines between the squares stand out.
 */
function edgeProfiles(lum: Float32Array, w: number, h: number) {
  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += lum[y * w + x];
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + row;
    }
  }
  // mean of the box [x0, x1) x [y0, y1)
  const box = (x0: number, y0: number, x1: number, y1: number) =>
    (integral[y1 * iw + x1] - integral[y0 * iw + x1] - integral[y1 * iw + x0] + integral[y0 * iw + x0]) /
    ((x1 - x0) * (y1 - y0));

  const vx = new Float32Array(w);
  const vy = new Float32Array(h);
  for (let y = ALONG; y < h - ALONG; y++) {
    for (let x = K; x < w - K; x++) {
      vx[x] += Math.abs(box(x, y - ALONG, x + K, y + ALONG + 1) - box(x - K, y - ALONG, x, y + ALONG + 1));
    }
  }
  for (let x = ALONG; x < w - ALONG; x++) {
    for (let y = K; y < h - K; y++) {
      vy[y] += Math.abs(box(x - ALONG, y, x + ALONG + 1, y + K) - box(x - ALONG, y - K, x + ALONG + 1, y));
    }
  }

  const normalise = (v: Float32Array) => {
    const sorted = [...v].sort((a, b) => a - b);
    const base = sorted[sorted.length >> 1];
    const top = sorted[Math.floor(0.97 * (sorted.length - 1))];
    const scale = Math.max(top - base, 1e-3);
    return v.map((e) => Math.min(MAX_VOTE, Math.max(0, (e - base) / scale)));
  };
  return { vx: normalise(vx), vy: normalise(vy) };
}

interface Lattice {
  /** Position of the board's first edge (the 9 lines run from here at spacing `s`). */
  start: number;
  score: number;
}

interface Candidate {
  s: number;
  x: Lattice;
  y: Lattice;
  score: number;
}

/**
 * Best 9 equally spaced lines (the 7 inner lines and the 2 outer edges) in an edge profile. At least 7 of the
 * 9 must be strong: the outer edges can be weak when the page next to the board is a similar brightness.
 */
function bestLattice(votes: Float32Array, s: number): Lattice | null {
  const line = (p: number) => {
    const i = Math.round(p);
    return ((votes[i - 1] ?? 0) + 2 * (votes[i] ?? 0) + (votes[i + 1] ?? 0)) / 4;
  };
  let best: Lattice | null = null;
  for (let p = 0; p + 8 * s < votes.length; p++) {
    let sum = 0;
    let strong = 0;
    for (let k = 0; k <= 8; k++) {
      const v = line(p + k * s);
      sum += v;
      if (v >= MIN_LINE) strong++;
    }
    if (strong >= 7 && (!best || sum > best.score)) best = { start: p, score: sum };
  }
  return best;
}

/** Brightness of each square from a ring just inside its edge, where pieces rarely reach. */
function ringSamples(img: Img, lum: Float32Array, x0: number, y0: number, s: number) {
  const { width: w, height: h, data } = img;
  const cells: { lum: number; rgb: RGB[] }[][] = [];
  const inset = s * 0.16;
  for (let r = 0; r < 8; r++) {
    cells.push([]);
    for (let c = 0; c < 8; c++) {
      const xa = x0 + c * s + inset;
      const xb = x0 + (c + 1) * s - inset;
      const ya = y0 + r * s + inset;
      const yb = y0 + (r + 1) * s - inset;
      const lums: number[] = [];
      const rgb: RGB[] = [];
      const take = (px: number, py: number) => {
        const x = Math.round(px);
        const y = Math.round(py);
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        lums.push(lum[y * w + x]);
        const i = (y * w + x) * 4;
        rgb.push([data[i], data[i + 1], data[i + 2]]);
      };
      const n = 8;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        take(xa + (xb - xa) * t, ya);
        take(xa + (xb - xa) * t, yb);
        take(xa, ya + (yb - ya) * t);
        take(xb, ya + (yb - ya) * t);
      }
      cells[r].push({ lum: median(lums), rgb });
    }
  }
  return cells;
}

/** Checks the light/dark checker pattern by brightness and returns the share of squares that fit. */
function checkerByBrightness(cells: { lum: number }[][]) {
  const even: number[] = [];
  const odd: number[] = [];
  cells.forEach((row, r) => row.forEach((cell, c) => ((r + c) % 2 === 0 ? even : odd).push(cell.lum)));
  const a = median(even);
  const b = median(odd);
  if (Math.abs(a - b) < MIN_CONTRAST) return { pass: 0, evenIsLight: a > b };
  const mid = (a + b) / 2;
  const evenIsLight = a > b;
  let pass = 0;
  cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      const wantLight = (r + c) % 2 === 0 === evenIsLight;
      if (wantLight ? cell.lum > mid : cell.lum < mid) pass++;
    }),
  );
  return { pass: pass / 64, evenIsLight };
}

/**
 * Finds a chess board whose squares are textured (wood, marble) and so have no flat colours: the lines
 * between the squares show up as regularly spaced brightness edges, and the light/dark pattern confirms it.
 */
export function findTexturedBoard(img: Img): BoardFound | null {
  const { data, width: w, height: h } = img;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  const { vx, vy } = edgeProfiles(lum, w, h);

  const sMin = 10;
  const sMax = Math.min(w, h) / 8;
  const found: Candidate[] = [];
  for (let s = sMin; s <= sMax; s += 0.5) {
    const lx = bestLattice(vx, s);
    const ly = lx && bestLattice(vy, s);
    if (lx && ly) found.push({ s, x: lx, y: ly, score: lx.score + ly.score });
  }
  found.sort((a, b) => b.score - a.score);

  for (const candidate of found.slice(0, CANDIDATES)) {
    // refine the square size around the coarse winner
    let best = candidate;
    for (let s = candidate.s - 0.5; s <= candidate.s + 0.5; s += 0.1) {
      const lx = bestLattice(vx, s);
      const ly = lx && bestLattice(vy, s);
      if (lx && ly && lx.score + ly.score > best.score) best = { s, x: lx, y: ly, score: lx.score + ly.score };
    }
    const x0 = best.x.start;
    const y0 = best.y.start;
    if (x0 < -1 || y0 < -1 || x0 + 8 * best.s > w + 1 || y0 + 8 * best.s > h + 1) continue;

    const cells = ringSamples(img, lum, x0, y0, best.s);
    const { pass, evenIsLight } = checkerByBrightness(cells);
    if (pass < MIN_PASS) continue;

    const colour = (light: boolean): RGB => {
      const samples: RGB[] = [];
      cells.forEach((row, r) =>
        row.forEach((cell, c) => {
          if (((r + c) % 2 === 0) === evenIsLight === light) samples.push(...cell.rgb);
        }),
      );
      return [0, 1, 2].map((k) => median(samples.map((p) => p[k]))) as RGB;
    };
    return {
      x: x0,
      y: y0,
      size: 8 * best.s,
      light: colour(true),
      dark: colour(false),
      score: pass,
      textured: true,
    };
  }
  return null;
}

/** A board of flat-coloured squares if there is one, otherwise a textured board. */
export function findAnyBoard(img: Img): BoardFound | null {
  return findBoard(img) ?? findTexturedBoard(img);
}
