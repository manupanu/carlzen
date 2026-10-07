import type { Img, RGB } from './recognizer';

export interface BoardFound {
  /** Top-left corner and side length, in pixels of the image that was searched. */
  x: number;
  y: number;
  size: number;
  light: RGB;
  dark: RGB;
  /** Share of the 64 squares that showed the expected alternating colour (0..1). */
  score: number;
}

const MAX_CLUSTERS = 6;
const FLAT = 6; // neighbouring pixels closer than this (summed |dr|+|dg|+|db|) count as flat colour
const SAME = 20; // a pixel this close to a cluster colour is "that colour"
const MIN_PAIR_DIST = 24;
const MIN_SCORE = 0.78;

interface Cluster {
  rgb: RGB;
  count: number;
}

const l1 = (a: RGB, b: RGB) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** The most common flat colours of the image: a chess board's two square colours are always among them. */
function dominantColours(img: Img): Cluster[] {
  const { data, width: w, height: h } = img;
  const counts = new Uint32Array(4096);
  const sums = new Float64Array(4096 * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 2; x++) {
      const i = (y * w + x) * 4;
      const j = i + 8;
      if (
        Math.abs(data[i] - data[i + 4]) +
          Math.abs(data[i + 1] - data[i + 5]) +
          Math.abs(data[i + 2] - data[i + 6]) >
          FLAT ||
        Math.abs(data[i] - data[j]) +
          Math.abs(data[i + 1] - data[j + 1]) +
          Math.abs(data[i + 2] - data[j + 2]) >
          FLAT
      ) {
        continue;
      }
      const bin = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      counts[bin]++;
      sums[bin * 3] += data[i];
      sums[bin * 3 + 1] += data[i + 1];
      sums[bin * 3 + 2] += data[i + 2];
    }
  }
  const order = [...counts.keys()].filter((b) => counts[b] > 0).sort((a, b) => counts[b] - counts[a]);
  const clusters: Cluster[] = [];
  for (const bin of order) {
    if (clusters.length >= MAX_CLUSTERS || counts[bin] < w * h * 0.004) break;
    const rgb: RGB = [
      sums[bin * 3] / counts[bin],
      sums[bin * 3 + 1] / counts[bin],
      sums[bin * 3 + 2] / counts[bin],
    ];
    // merge into an existing cluster when the colour is the same one split across a bin edge
    const near = clusters.find((c) => l1(c.rgb, rgb) < 16);
    if (near) {
      const total = near.count + counts[bin];
      near.rgb = near.rgb.map((v, k) => (v * near.count + rgb[k] * counts[bin]) / total) as RGB;
      near.count = total;
    } else clusters.push({ rgb, count: counts[bin] });
  }
  return clusters;
}

/** Longest blurred gap (in pixels) between two squares that still counts as one edge. */
const MAX_GAP = 8;
/** A colour must hold for this many pixels on each side of an edge. */
const MIN_RUN = 3;

/**
 * Votes for the x (or y) positions where one colour of the pair turns into the other. Edges may be blurred
 * (a scaled-down screenshot, a smooth upscale): the vote goes to the middle of the gap between a run of one
 * colour and a run of the other.
 */
function edgeVotes(labels: Int8Array, w: number, h: number, a: number, b: number, vertical: boolean) {
  const len = vertical ? h : w;
  const votes = new Float32Array(len);
  const lines = vertical ? w : h;
  for (let line = 0; line < lines; line++) {
    let runLabel = -1; // colour of the current run
    let runLen = 0;
    let lastEnd = -1; // last pixel of the previous run
    let prevLabel = -1;
    let prevLen = 0;
    let pending = -1; // midpoint of an edge waiting for the new run to be long enough
    for (let pos = 0; pos < len; pos++) {
      const l = vertical ? labels[pos * w + line] : labels[line * w + pos];
      if (l !== a && l !== b) {
        // blur or something else: the current run ends here
        if (runLabel !== -1 && runLen >= MIN_RUN) {
          prevLabel = runLabel;
          prevLen = runLen;
          lastEnd = pos - 1;
        }
        runLabel = -1;
        runLen = 0;
        pending = -1;
        if (pos - lastEnd > MAX_GAP) prevLabel = -1;
        continue;
      }
      if (l === runLabel) {
        runLen++;
        if (pending >= 0 && runLen >= MIN_RUN) {
          votes[pending]++;
          pending = -1;
        }
      } else {
        // a new run of the other colour starts; if the previous run was solid and close, it is an edge
        if (runLabel !== -1 && runLen >= MIN_RUN) {
          prevLabel = runLabel;
          prevLen = runLen;
          lastEnd = pos - 1;
        }
        runLabel = l;
        runLen = 1;
        pending =
          prevLabel !== -1 && prevLabel !== l && prevLen >= MIN_RUN && pos - lastEnd - 1 <= MAX_GAP
            ? Math.floor((lastEnd + pos + 1) / 2)
            : -1;
      }
    }
  }
  return votes;
}

interface Lattice {
  start: number; // position of the first interior line
  score: number;
}

/** Best 7 equally spaced interior lines (spacing `s`) in a vote histogram. */
function bestLattice(votes: Float32Array, s: number, minVotes: number): Lattice | null {
  const len = votes.length;
  // an edge votes on three neighbouring positions; weighting the centre picks its middle
  const line = (p: number) => {
    const i = Math.round(p);
    return ((votes[i - 1] ?? 0) + 2 * (votes[i] ?? 0) + (votes[i + 1] ?? 0)) / 4;
  };
  let best: Lattice | null = null;
  for (let p = Math.ceil(s); p + 6 * s < len - 1; p++) {
    let sum = 0;
    let strong = 0;
    for (let k = 0; k < 7; k++) {
      const v = line(p + k * s);
      sum += v;
      if (v >= minVotes) strong++;
    }
    if (strong >= 6 && (!best || sum > best.score)) best = { start: p, score: sum };
  }
  return best;
}

/** How many of the 64 squares show the colour the checker pattern expects (inner part of each square). */
function checkerScore(
  labels: Int8Array,
  w: number,
  h: number,
  a: number,
  b: number,
  x0: number,
  y0: number,
  s: number,
) {
  let bestPass = 0;
  for (const swap of [false, true]) {
    let pass = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const want = ((r + c) % 2 === 0) !== swap ? a : b;
        const other = want === a ? b : a;
        let wantN = 0;
        let otherN = 0;
        let total = 0;
        const xa = Math.round(x0 + c * s + s * 0.12);
        const xb = Math.round(x0 + (c + 1) * s - s * 0.12);
        const ya = Math.round(y0 + r * s + s * 0.12);
        const yb = Math.round(y0 + (r + 1) * s - s * 0.12);
        for (let y = Math.max(0, ya); y < Math.min(h, yb); y++) {
          for (let x = Math.max(0, xa); x < Math.min(w, xb); x++) {
            const l = labels[y * w + x];
            if (l === want) wantN++;
            else if (l === other) otherN++;
            total++;
          }
        }
        if (total && wantN / total >= 0.25 && wantN > otherN * 2) pass++;
      }
    }
    bestPass = Math.max(bestPass, pass);
  }
  return bestPass / 64;
}

/**
 * Finds a chess board in a screenshot: an 8x8 checkerboard of two alternating colours. Works for any
 * board colours and any size, without knowing the site. Pieces, highlights and arrows may cover some
 * squares.
 */
export function findBoard(img: Img): BoardFound | null {
  const { data, width: w, height: h } = img;
  const clusters = dominantColours(img);
  if (clusters.length < 2) return null;

  const labels = new Int8Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const px: RGB = [data[i], data[i + 1], data[i + 2]];
      for (let k = 0; k < clusters.length; k++) {
        if (l1(px, clusters[k].rgb) <= SAME) {
          labels[y * w + x] = k;
          break;
        }
      }
    }
  }

  const sMin = 10;
  const sMax = Math.min(w, h) / 8;
  let found: BoardFound | null = null;
  for (let a = 0; a < clusters.length; a++) {
    for (let b = a + 1; b < clusters.length; b++) {
      if (l1(clusters[a].rgb, clusters[b].rgb) < MIN_PAIR_DIST) continue;
      const vx = edgeVotes(labels, w, h, a, b, false);
      const vy = edgeVotes(labels, w, h, a, b, true);
      // coarse search over the square size, then refine around the winner
      let best: { s: number; x: Lattice; y: Lattice; score: number } | null = null;
      const tryS = (s: number) => {
        const minVotes = 2.2 * s;
        const lx = bestLattice(vx, s, minVotes);
        const ly = lx && bestLattice(vy, s, minVotes);
        if (lx && ly && (!best || lx.score + ly.score > best.score))
          best = { s, x: lx, y: ly, score: lx.score + ly.score };
      };
      for (let s = sMin; s <= sMax; s += 0.5) tryS(s);
      if (!best) continue;
      const coarse: number = (best as { s: number }).s;
      for (let s = coarse - 0.5; s <= coarse + 0.5; s += 0.1) tryS(s);
      const win = best as { s: number; x: Lattice; y: Lattice };
      const x0 = win.x.start - win.s;
      const y0 = win.y.start - win.s;
      if (x0 < -1 || y0 < -1 || x0 + 8 * win.s > w + 1 || y0 + 8 * win.s > h + 1) continue;
      const score = checkerScore(labels, w, h, a, b, x0, y0, win.s);
      if (
        score >= MIN_SCORE &&
        (!found || score > found.score + 0.02 || (score > found.score - 0.02 && win.s * 8 > found.size))
      ) {
        const lum = (c: RGB) => c[0] + c[1] + c[2];
        const [light, dark] = lum(clusters[a].rgb) >= lum(clusters[b].rgb) ? [a, b] : [b, a];
        found = {
          x: x0,
          y: y0,
          size: 8 * win.s,
          light: clusters[light].rgb,
          dark: clusters[dark].rgb,
          score,
        };
      }
    }
  }
  return found;
}
