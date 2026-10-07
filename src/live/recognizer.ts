import type { Grid } from './position';

/** Minimal ImageData shape so the recognizer can be tested without a DOM. */
export interface Img {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type RGB = [number, number, number];

/** Piece letters followed by '.' for an empty square; the index in this string is the class id. */
export const CLASSES = 'PNBRQKpnbrqk.';
export const EMPTY = 12;

export const CALIBRATION_VERSION = 3;

export interface Calibration {
  version: number;
  /** True when Black is at the bottom of the shared board. */
  flipped: boolean;
  light: RGB;
  dark: RGB;
  /** Shape templates per piece type (keys P N B R Q K; colour-agnostic) plus '.' for empty. */
  templates: Record<string, number[]>;
  /** A square whose distance to every class exceeds this is "unknown" (cursor, overlay, ...). */
  unknownThreshold: number;
  /** Cost of reading a piece as the wrong colour. */
  colourPenalty: number;
}

/** What was read from the screen, in screen order (row-major from the top-left), before choosing a side. */
export interface ScreenReading {
  dist: Float32Array;
  best: Uint8Array;
  unknown: boolean[];
  /** Highlighted squares as screen (row, col). */
  highlighted: [number, number][];
  threshold: number;
}

export interface Reading {
  /** True when the reading was taken with Black at the bottom of the screen. */
  flipped: boolean;
  /** Best guess per square from White's side (unknown squares keep their closest class). */
  grid: Grid;
  /** Distance of every square to every class: index = (row * 8 + col) * 13 + class. */
  dist: Float32Array;
  /** Closest class per square (same indexing without the class part). */
  best: Uint8Array;
  /** Squares that do not look like any class. */
  unknown: boolean[];
  hasUnknown: boolean;
  threshold: number;
  highlighted: [number, number][];
}

const CELLS = 16; // each square is reduced to a 16x16 mask
const CORNER = 2; // cells ignored in each corner (hover marks)
// share of a square that must be piece to count as occupied: above blur at the edges, below the smallest piece (a pawn is ~0.25)
const EMPTY_COVERAGE = 0.1;
const HIGHLIGHT_DIST = 45;
// colour distance from the background where a pixel starts / fully counts as "piece"
const MASK_LO = 25;
const MASK_HI = 70;
// texture: spread (median distance of background pixels from the background colour) up to FLAT_SPREAD is
// treated as flat; beyond it the piece threshold rises by TEXTURE_FACTOR per unit, up to MAX_TEXTURE_EXTRA
const FLAT_SPREAD = 8;
const TEXTURE_FACTOR = 1.5;
const MAX_TEXTURE_EXTRA = 45;
// a piece cell counts as "dark" below this luminance (0..1)
const DARK_MAX = 0.42;
// share of dark piece cells that separates black from white pieces, on a light and on a dark square
const DARK_CUT_LIGHT = 0.34;
const DARK_CUT_DARK = 0.67;
const DARK_CUT_SOFT = 0.12;
// a piece whose white and black readings are closer than this (times the colour penalty) is "unknown"
const AMBIGUOUS = 0.35;
const UNKNOWN_FACTOR = 2.5;
const UNKNOWN_FLOOR = 6;
const COLOUR_PENALTY_FACTOR = 1.5;

/**
 * Cells that are ignored: the four corners, plus where chess.com draws its rank number (top left) and
 * file letter (bottom right) inside the edge squares.
 */
const ignored = (cx: number, cy: number) => {
  const corner = (cx < CORNER || cx >= CELLS - CORNER) && (cy < CORNER || cy >= CELLS - CORNER);
  const rankLabel = cx >= 1 && cx <= 3 && cy >= 1 && cy <= 4;
  const fileLabel = cx >= 12 && cy >= 11;
  // the outer ring picks up blur from the neighbouring squares (scaled screenshots), which are a different colour
  const edge = cx === 0 || cy === 0 || cx === CELLS - 1 || cy === CELLS - 1;
  return corner || rankLabel || fileLabel || edge;
};
/** Cells in the side strips of a square, used to measure texture (pieces and the rim blur rarely reach them). */
const TEXTURE_CELLS: number[] = [];
for (const cx of [2, CELLS - 3]) {
  for (let cy = 5; cy <= 12; cy++) TEXTURE_CELLS.push(cy * CELLS + cx);
}

const IGNORED_CELLS = (() => {
  let n = 0;
  for (let cy = 0; cy < CELLS; cy++) for (let cx = 0; cx < CELLS; cx++) if (ignored(cx, cy)) n++;
  return n;
})();

const START_ROWS = ['rnbqkbnr', 'pppppppp', null, null, null, null, 'PPPPPPPP', 'RNBQKBNR'];
const TYPES = 'PNBRQK';

const smoothstep = (lo: number, hi: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

const dist3 = (a: RGB, b: RGB) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** Summed channel difference between a colour given as numbers and an RGB tuple (no allocation). */
const distTo = (r: number, g: number, b: number, c: RGB) =>
  Math.abs(r - c[0]) + Math.abs(g - c[1]) + Math.abs(b - c[2]);

const luma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** For each of the 8x8x8 colour bins: itself and the bins next to it. */
const NEIGHBOURS: Int16Array[] = (() => {
  const out: Int16Array[] = [];
  for (let bin = 0; bin < 512; bin++) {
    const r = bin >> 6;
    const g = (bin >> 3) & 7;
    const b = bin & 7;
    const list: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dg = -1; dg <= 1; dg++) {
        for (let db = -1; db <= 1; db++) {
          const rr = r + dr;
          const gg = g + dg;
          const bb = b + db;
          if (rr >= 0 && gg >= 0 && bb >= 0 && rr < 8 && gg < 8 && bb < 8)
            list.push((rr << 6) | (gg << 3) | bb);
        }
      }
    }
    out.push(Int16Array.from(list));
  }
  return out;
})();

/**
 * Background colour of a square: its dominant colour. The plain square always covers more area than
 * the piece, while blur from neighbouring squares, coordinate labels, wide piece bases and the mouse
 * cursor are all minorities. Colours are counted in coarse bins (a bin plus its neighbours, so flat
 * colour with compression noise is not split), then refined to the median of the pixels near the winner.
 */
export function squareBackground(img: Img, row: number, col: number): RGB {
  const s = img.width / 8;
  const x0 = Math.floor(col * s);
  const y0 = Math.floor(row * s);
  const x1 = Math.floor((col + 1) * s);
  const y1 = Math.floor((row + 1) * s);

  const counts = new Uint16Array(8 * 8 * 8);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      counts[((img.data[i] >> 5) << 6) | ((img.data[i + 1] >> 5) << 3) | (img.data[i + 2] >> 5)]++;
    }
  }

  // Score every bin by its neighbourhood, then centre on the fullest bin inside the winning neighbourhood
  // (a plain tie would otherwise pick whichever neighbourhood comes first).
  let winner = 0;
  let winnerScore = -1;
  for (let bin = 0; bin < 512; bin++) {
    let score = 0;
    for (const n of NEIGHBOURS[bin]) score += counts[n];
    if (score > winnerScore) {
      winnerScore = score;
      winner = bin;
    }
  }
  let fullest = winner;
  for (const n of NEIGHBOURS[winner]) if (counts[n] > counts[fullest]) fullest = n;
  const centre: RGB = [
    ((fullest >> 6) << 5) + 16,
    (((fullest >> 3) & 7) << 5) + 16,
    ((fullest & 7) << 5) + 16,
  ];

  // Blur from neighbouring squares leaves many pixels that are close to, but not exactly, the plain colour.
  // Refine twice: a wide pass around the winning bin, then a tight pass around its median.
  const hist = [new Uint16Array(256), new Uint16Array(256), new Uint16Array(256)];
  const medianOf = (h: Uint16Array, n: number) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += h[v];
      if (seen > n >> 1) return v;
    }
    return 255;
  };
  const refine = (around: RGB, radius: number): RGB | null => {
    hist.forEach((h) => h.fill(0));
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4;
        const r = img.data[i];
        const g = img.data[i + 1];
        const b = img.data[i + 2];
        if (distTo(r, g, b, around) <= radius) {
          hist[0][r]++;
          hist[1][g]++;
          hist[2][b]++;
          n++;
        }
      }
    }
    return n >= 12 ? [medianOf(hist[0], n), medianOf(hist[1], n), medianOf(hist[2], n)] : null;
  };
  const wide = refine(centre, 72) ?? centre;
  return refine(wide, 18) ?? wide;
}

export interface SquareFeatures {
  /** CELLS*CELLS soft piece-presence values (0 background .. 1 piece). */
  vec: Float32Array;
  coverage: number;
  /**
   * Share of piece cells that are dark: most of a black piece, only the outline of a white one. Cells are
   * used (not pixels) so thin light detail lines on black pieces average away.
   */
  darkFrac: number;
  bgLuma: number;
  bg: RGB;
}

export function squareFeatures(img: Img, row: number, col: number): SquareFeatures {
  const s = img.width / 8;
  const bg = squareBackground(img, row, col);
  const bgLuma = luma(bg[0], bg[1], bg[2]);
  const cell = s / CELLS;

  // average colour of every cell
  const cells = new Float32Array(CELLS * CELLS * 3);
  for (let cy = 0; cy < CELLS; cy++) {
    for (let cx = 0; cx < CELLS; cx++) {
      if (ignored(cx, cy)) continue;
      const xa = Math.floor(col * s + cx * cell);
      const ya = Math.floor(row * s + cy * cell);
      const xb = Math.max(xa + 1, Math.floor(col * s + (cx + 1) * cell));
      const yb = Math.max(ya + 1, Math.floor(row * s + (cy + 1) * cell));
      let r = 0;
      let g = 0;
      let b = 0;
      let k = 0;
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const i = (y * img.width + x) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          k++;
        }
      }
      const o = (cy * CELLS + cx) * 3;
      cells[o] = r / k;
      cells[o + 1] = g / k;
      cells[o + 2] = b / k;
    }
  }

  // Texture (wood grain, marble veins): how far the cells at the sides of the square scatter around the
  // background colour. Pieces rarely reach those strips, and averaging pixels into cells removes random
  // compression noise but not grain, so the two are told apart. A textured square needs a higher bar before a
  // cell counts as piece.
  const deviations = new Uint16Array(73);
  let near = 0;
  for (const cellIndex of TEXTURE_CELLS) {
    const o = cellIndex * 3;
    const d = distTo(cells[o], cells[o + 1], cells[o + 2], bg);
    if (d <= 72) {
      deviations[Math.round(d)]++;
      near++;
    }
  }
  let spread = 0;
  for (let d = 0, seen = 0; d <= 72; d++) {
    seen += deviations[d];
    if (seen > near >> 1) {
      spread = d;
      break;
    }
  }
  const extra = Math.min(MAX_TEXTURE_EXTRA, TEXTURE_FACTOR * Math.max(0, spread - FLAT_SPREAD));

  const vec = new Float32Array(CELLS * CELLS);
  let present = 0;
  let pieceCells = 0;
  let darkCells = 0;
  for (let cy = 0; cy < CELLS; cy++) {
    for (let cx = 0; cx < CELLS; cx++) {
      if (ignored(cx, cy)) continue;
      const o = (cy * CELLS + cx) * 3;
      const w = smoothstep(MASK_LO + extra, MASK_HI + extra, distTo(cells[o], cells[o + 1], cells[o + 2], bg));
      vec[cy * CELLS + cx] = w;
      present += w;
      if (w > 0.5) {
        pieceCells++;
        if (luma(cells[o], cells[o + 1], cells[o + 2]) < DARK_MAX) darkCells++;
      }
    }
  }
  return {
    vec,
    coverage: present / (CELLS * CELLS - IGNORED_CELLS),
    darkFrac: pieceCells ? darkCells / pieceCells : 0,
    bgLuma,
    bg,
  };
}

const sqDist = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - b[i];
    d += x * x;
  }
  return d;
};

/** How likely (0..1) the piece on this square is White: a white piece is mostly bright, with a dark outline. */
const whiteness = (f: SquareFeatures) => {
  // black pieces look darker on a dark square than on a light one, so the cut follows the background
  const t = Math.min(1, Math.max(0, (f.bgLuma - 0.5) / 0.4));
  const cut = DARK_CUT_DARK + (DARK_CUT_LIGHT - DARK_CUT_DARK) * t;
  return 1 - smoothstep(cut - DARK_CUT_SOFT, cut + DARK_CUT_SOFT, f.darkFrac);
};

/** Learn piece shapes and board colours from a screenshot of the starting position. */
export function calibrate(img: Img): Calibration {
  const feats: SquareFeatures[][] = [];
  for (let r = 0; r < 8; r++) {
    feats.push([]);
    for (let c = 0; c < 8; c++) feats[r].push(squareFeatures(img, r, c));
  }

  for (let r = 0; r < 8; r++) {
    const shouldBeFull = r < 2 || r > 5;
    for (let c = 0; c < 8; c++) {
      if (feats[r][c].coverage >= EMPTY_COVERAGE !== shouldBeFull) {
        throw new Error(
          'The selected region does not look like a board in the starting position. ' +
            'Select just the 8x8 squares and set up the starting position.',
        );
      }
    }
  }

  // In the starting position every piece of one side is white and every piece of the other is black.
  const sideColours = (rows: number[]) => rows.flatMap((r) => feats[r].map(whiteness));
  const top = sideColours([0, 1]);
  const bottom = sideColours([6, 7]);
  const allWhite = (ws: number[]) => ws.every((w) => w > 0.75);
  const allBlack = (ws: number[]) => ws.every((w) => w < 0.25);
  if (!((allWhite(top) && allBlack(bottom)) || (allBlack(top) && allWhite(bottom)))) {
    throw new Error(
      'The pieces do not look like a starting position (one side white, the other black). ' +
        'Set up the starting position and try again.',
    );
  }

  // White pieces have a bright fill, so the side whose pieces are brighter is White.
  const avgWhiteness = (rows: number[]) => {
    let sum = 0;
    for (const r of rows) for (let c = 0; c < 8; c++) sum += whiteness(feats[r][c]);
    return sum / (rows.length * 8);
  };
  const flipped = avgWhiteness([6, 7]) < avgWhiteness([0, 1]);

  const meanBg = (parity: number): RGB => {
    const acc = [0, 0, 0];
    let k = 0;
    for (let r = 2; r <= 5; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 !== parity) continue;
        feats[r][c].bg.forEach((v, i) => (acc[i] += v));
        k++;
      }
    }
    return [acc[0] / k, acc[1] / k, acc[2] / k];
  };

  // one shape template per piece type, averaged over both colours
  const sums: Record<string, Float32Array> = {};
  const counts: Record<string, number> = {};
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const wr = flipped ? 7 - r : r;
      const wc = flipped ? 7 - c : c;
      const letter = START_ROWS[wr]?.[wc];
      if (!letter) continue;
      const type = letter.toUpperCase();
      sums[type] ??= new Float32Array(feats[r][c].vec.length);
      counts[type] = (counts[type] ?? 0) + 1;
      feats[r][c].vec.forEach((v, i) => (sums[type][i] += v));
    }
  }
  const templates: Record<string, number[]> = {};
  for (const type of TYPES) {
    templates[type] = [...sums[type]].map((v) => Math.round((v / counts[type]) * 1000) / 1000);
  }
  templates['.'] = new Array(sums.P.length).fill(0);

  // How far the known start-position squares are from their own shape sets the "unknown" threshold.
  let worst = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const wr = flipped ? 7 - r : r;
      const wc = flipped ? 7 - c : c;
      const letter = START_ROWS[wr]?.[wc];
      worst = Math.max(worst, sqDist(feats[r][c].vec, templates[letter ? letter.toUpperCase() : '.']));
    }
  }
  const unknownThreshold = Math.max(UNKNOWN_FACTOR * worst, UNKNOWN_FLOOR);

  return {
    version: CALIBRATION_VERSION,
    flipped,
    light: meanBg(0),
    dark: meanBg(1),
    templates,
    unknownThreshold,
    colourPenalty: COLOUR_PENALTY_FACTOR * unknownThreshold,
  };
}

/** Distance of one square to each of the 13 classes. */
export function classDistances(f: SquareFeatures, cal: Calibration): number[] {
  const shape: Record<string, number> = {};
  for (const key of [...TYPES, '.']) shape[key] = sqDist(f.vec, cal.templates[key]);
  const white = whiteness(f);
  const out: number[] = [];
  for (let k = 0; k < CLASSES.length; k++) {
    if (k === EMPTY) {
      out.push(shape['.']);
      continue;
    }
    const isWhite = k < 6;
    const penalty = cal.colourPenalty * (isWhite ? 1 - white : white);
    out.push(shape[TYPES[k % 6]] + penalty);
  }
  return out;
}

/** Reads every square in screen order: distance to each class, closest class, unknown squares, highlights. */
export function readScreen(img: Img, cal: Calibration): ScreenReading {
  const dist = new Float32Array(64 * CLASSES.length);
  const best = new Uint8Array(64);
  const unknown: boolean[] = Array(64).fill(false);
  const highlighted: [number, number][] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const f = squareFeatures(img, r, c);
      const i = r * 8 + c;
      const d = classDistances(f, cal);
      let bestClass = 0;
      for (let k = 0; k < CLASSES.length; k++) {
        dist[i * CLASSES.length + k] = d[k];
        if (d[k] < d[bestClass]) bestClass = k;
      }
      best[i] = bestClass;
      const sameTypeOtherColour = bestClass === EMPTY ? Infinity : d[(bestClass + 6) % 12];
      const ambiguous = sameTypeOtherColour - d[bestClass] < AMBIGUOUS * cal.colourPenalty;
      unknown[i] = d[bestClass] > cal.unknownThreshold || ambiguous;
      const plain = (r + c) % 2 === 0 ? cal.light : cal.dark;
      if (dist3(f.bg, plain) > HIGHLIGHT_DIST) highlighted.push([r, c]);
    }
  }
  return { dist, best, unknown, highlighted, threshold: cal.unknownThreshold };
}

/** View a screen reading from White's side, given which side is at the bottom of the screen. */
export function orient(screen: ScreenReading, flipped: boolean): Reading {
  const n = CLASSES.length;
  const grid: Grid = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
  const dist = new Float32Array(64 * n);
  const best = new Uint8Array(64);
  const unknown: boolean[] = Array(64).fill(false);
  let hasUnknown = false;
  for (let i = 0; i < 64; i++) {
    const sq = flipped ? 63 - i : i;
    dist.set(screen.dist.subarray(i * n, (i + 1) * n), sq * n);
    best[sq] = screen.best[i];
    unknown[sq] = screen.unknown[i];
    if (screen.unknown[i]) hasUnknown = true;
    grid[sq >> 3][sq & 7] = screen.best[i] === EMPTY ? null : CLASSES[screen.best[i]];
  }
  const highlighted = screen.highlighted.map(([r, c]): [number, number] =>
    flipped ? [7 - r, 7 - c] : [r, c],
  );
  return { flipped, grid, dist, best, unknown, hasUnknown, threshold: screen.threshold, highlighted };
}

/** Reads the whole board from White's perspective (`flipped` defaults to the calibrated orientation). */
export function recognizeBoard(img: Img, cal: Calibration, flipped = cal.flipped): Reading {
  return orient(readScreen(img, cal), flipped);
}
