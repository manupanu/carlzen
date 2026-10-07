import { closestCalibration, loadCalibrations, remember } from './calibrations';
import { Capture, type Region } from './capture';
import { resolvePosition } from './position';
import {
  calibrate,
  orient,
  readScreen,
  type Calibration,
  type Img,
  type Reading,
  type ScreenReading,
} from './recognizer';
import { findAnyBoard } from './texturedBoardFinder';
import { Watcher } from './watcher';

/** A position read from the shared screen. */
export interface LivePosition {
  fen: string;
  /** True when Black is at the bottom of the shared board. */
  flipped: boolean;
  /** The side to move could not be worked out and is a guess (White). */
  guessedTurn: boolean;
}

export interface LiveState {
  sharing: boolean;
  paused: boolean;
  status: string;
  /** The window is hidden, so the browser slows the page down. */
  warn: boolean;
  boardFound: boolean;
  calibrated: boolean;
  debug: boolean;
  selecting: boolean;
  canSnapshot: boolean;
  guessedTurn: boolean;
}

const TICK_MS = 250;
/** How often to look for the board while it is missing (ms). */
const DETECT_RETRY_MS = 1200;
/** How often to double-check that the board is still where we think it is (ms). */
const VERIFY_MS = 8000;
/** Ticks of garbage readings before the board is considered lost (and searched for again). */
const LOST_TICKS = 6;
const START_GRID = 'rnbqkbnr/pppppppp/......../......../......../......../PPPPPPPP/RNBQKBNR';

const moved = (a: Region, b: Region) =>
  Math.abs(a.x - b.x) > 0.004 || Math.abs(a.y - b.y) > 0.004 || Math.abs(a.w - b.w) > 0.004;

const gridPlacement = (r: Reading) => r.grid.map((row) => row.map((p) => p ?? '.').join('')).join('/');

/** True when the outer ranks are full and the middle is empty. */
const looksLikeStart = (screen: ScreenReading) => {
  let outerFull = 0;
  let innerEmpty = 0;
  for (let i = 0; i < 64; i++) {
    const row = i >> 3;
    const empty = screen.best[i] === 12;
    if (row < 2 || row > 5) outerFull += empty ? 0 : 1;
    else innerEmpty += empty ? 1 : 0;
  }
  return outerFull >= 30 && innerEmpty >= 30;
};

/**
 * Watches a shared screen for a chess board and reports the positions it shows. All state lives here (not in
 * React): the screen is polled from a timer, the board is found and followed automatically, and the pieces
 * are learned from the first starting position seen.
 */
export class LiveController {
  private capture = new Capture();
  private watcher: Watcher;
  private calibrations: Calibration[];
  private calibration: Calibration | null;
  private region: Region | null = null;
  private manualRegion = false;
  private paused = false;
  private debug = false;
  private selecting = false;

  private lastDetect = 0;
  private lastAutoCalibrate = 0;
  private lostTicks = 0;
  private boardFound = false;
  private busy = false;
  private message = '';
  private captureError = '';
  private guessedTurn = false;

  private lastImg: Img | null = null;
  private lastReading: Reading | null = null;
  private lastFlipped = false;
  private debugData: { labels: string[]; unknown: boolean[] } | null = null;

  private ticker: Worker | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | undefined;
  private raf = 0;
  private canvas: HTMLCanvasElement | null = null;
  private detachCanvas: (() => void) | null = null;
  private dragStart: { x: number; y: number } | null = null;
  private dragNow: { x: number; y: number } | null = null;

  private listeners = new Set<() => void>();
  private state: LiveState;
  private onPosition: (p: LivePosition) => void = () => {};

  constructor() {
    this.calibrations = loadCalibrations();
    this.calibration = this.calibrations[0] ?? null;
    this.watcher = new Watcher(this.calibration?.flipped ?? false);
    this.state = this.snapshotState();
  }

  /** Where detected positions are sent. */
  setOnPosition(handler: (p: LivePosition) => void) {
    this.onPosition = handler;
  }

  // --- external store for React ---------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  private snapshotState(): LiveState {
    const sharing = this.capture.active;
    let status = this.message;
    if (!sharing) status = this.captureError ? `Screen capture failed: ${this.captureError}` : 'Not sharing';
    else if (this.paused) status = 'Paused';
    else if (!status) status = 'Watching the board';
    return {
      sharing,
      paused: this.paused,
      status,
      warn: typeof document !== 'undefined' && document.hidden,
      boardFound: this.boardFound,
      calibrated: this.calibration !== null,
      debug: this.debug,
      selecting: this.selecting,
      canSnapshot: this.lastImg !== null,
      guessedTurn: this.guessedTurn,
    };
  }

  private publish() {
    const next = this.snapshotState();
    const same = (Object.keys(next) as (keyof LiveState)[]).every((k) => next[k] === this.state[k]);
    if (same) return;
    this.state = next;
    this.listeners.forEach((l) => l());
  }

  private setMessage(text: string) {
    if (text !== this.message) {
      this.message = text;
      this.publish();
    }
  }

  // --- lifecycle ----------------------------------------------------------------------------

  /** Starts the timers; call from an effect and pair with `unmount`. */
  mount() {
    this.startTicker();
    const paint = () => {
      this.draw();
      this.raf = requestAnimationFrame(paint);
    };
    this.raf = requestAnimationFrame(paint);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  unmount() {
    this.ticker?.terminate();
    this.ticker = null;
    clearInterval(this.fallbackTimer);
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.capture.stop();
  }

  private onVisibility = () => this.publish();

  /**
   * Ticks come from a worker: browsers slow main-thread timers right down (to once a minute) for pages that
   * are hidden or in the background, which would make detection silently stop.
   */
  private startTicker() {
    const fallback = () => {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = setInterval(() => this.tick(), TICK_MS);
    };
    try {
      const url = URL.createObjectURL(
        new Blob([`setInterval(() => postMessage(0), ${TICK_MS});`], { type: 'text/javascript' }),
      );
      this.ticker = new Worker(url);
      this.ticker.onmessage = () => this.tick();
      this.ticker.onerror = fallback;
    } catch {
      fallback();
    }
  }

  // --- user actions ---------------------------------------------------------------------------

  async start() {
    if (this.capture.active) return;
    try {
      this.captureError = '';
      await this.capture.start(() => this.publish());
      this.manualRegion = false;
      this.lastDetect = 0;
      this.lostTicks = 0;
    } catch (e) {
      this.captureError = (e as Error).message || String(e);
    }
    this.publish();
  }

  stop() {
    this.capture.stop();
    this.publish();
  }

  /** Looks for the board again and goes back to following it automatically. */
  findBoardNow() {
    this.manualRegion = false;
    if (!this.detectBoard()) this.setMessage('No board found in the shared window. Is the whole board visible?');
    else this.setMessage('');
  }

  /** The next drag on the preview draws the board region by hand. */
  selectBoard() {
    this.selecting = true;
    this.canvas?.classList.add('selecting');
    this.publish();
  }

  calibrateNow() {
    if (!this.region) return;
    const img = this.capture.grabBoard(this.region);
    if (!img) return;
    try {
      this.calibrations = remember(this.calibrations, calibrate(img));
      this.useCalibration(this.calibrations[0]);
      this.setMessage('');
    } catch (e) {
      this.setMessage((e as Error).message);
    }
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.watcher.settle();
    this.publish();
  }

  setDebug(debug: boolean) {
    this.debug = debug;
    if (!debug) this.debugData = null;
    this.publish();
  }

  /** Switches the side to move of the current position (when the guess was wrong). */
  flipTurn() {
    if (!this.lastReading) return;
    const read = this.lastReading;
    const fenNow = this.currentFen;
    if (!fenNow) return;
    const turn = fenNow.split(' ')[1] === 'w' ? ('b' as const) : ('w' as const);
    const resolved = resolvePosition({
      grid: read.grid,
      highlighted: read.highlighted,
      prevFen: null,
      override: turn,
    });
    if (resolved && resolved.source === 'manual') {
      this.watcher.override(resolved.fen, this.lastFlipped);
      this.emit(resolved.fen, this.lastFlipped, false);
    } else {
      this.setMessage('That side to move would make the position illegal');
    }
  }

  /** Downloads the board image and what was read from it, for bug reports. */
  snapshot() {
    if (!this.lastImg || !this.calibration) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const canvas = document.createElement('canvas');
    canvas.width = this.lastImg.width;
    canvas.height = this.lastImg.height;
    canvas
      .getContext('2d')!
      .putImageData(new ImageData(new Uint8ClampedArray(this.lastImg.data), this.lastImg.width, this.lastImg.height), 0, 0);
    canvas.toBlob((png) => png && this.download(`carlzen-live-${stamp}.png`, png));
    const read = this.lastReading;
    const info = {
      fen: this.currentFen,
      calibration: this.calibration,
      region: this.region,
      read: read && {
        grid: read.grid,
        unknown: read.unknown.map((u, i) => (u ? i : -1)).filter((i) => i >= 0),
        threshold: read.threshold,
        bestDistance: Array.from(read.best, (k, sq) => Number(read.dist[sq * 13 + k].toFixed(2))),
      },
    };
    this.download(
      `carlzen-live-${stamp}.json`,
      new Blob([JSON.stringify(info, null, 1)], { type: 'application/json' }),
    );
  }

  private download(name: string, blob: Blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // --- the loop ---------------------------------------------------------------------------------

  private currentFen: string | null = null;

  private emit(fen: string, flipped: boolean, guessedTurn: boolean) {
    this.currentFen = fen;
    this.lastFlipped = flipped;
    this.guessedTurn = guessedTurn;
    this.onPosition({ fen, flipped, guessedTurn });
    this.publish();
  }

  private useCalibration(cal: Calibration | null) {
    this.calibration = cal;
    this.watcher.reset(cal?.flipped);
    this.lostTicks = 0;
  }

  /** Looks for the board in the whole shared frame. Returns whether one was found. */
  private detectBoard(): boolean {
    this.lastDetect = performance.now();
    const frame = this.capture.grabFrame();
    if (!frame) return false;
    const found = findAnyBoard(frame);
    this.boardFound = found !== null;
    if (!found) return false;

    const r: Region = {
      x: found.x / frame.width,
      y: found.y / frame.height,
      w: found.size / frame.width,
      h: found.size / frame.height,
    };
    if (!this.region || moved(this.region, r)) this.region = r;

    // a board in a style seen before: use the calibration made for it
    const match = closestCalibration(this.calibrations, found.light, found.dark);
    if (match && match !== this.calibration) this.useCalibration(match);
    else if (!match && this.calibration && !found.textured) {
      // (a textured board's colours are only approximate, so a mismatch there proves nothing)
      this.useCalibration(null);
      this.message = 'New board style: it is learned automatically when the starting position is shown';
    }
    return true;
  }

  /** Calibrates from the board image if it shows the starting position. */
  private autoCalibrate(img: Img, now: number): boolean {
    if (now - this.lastAutoCalibrate < 600) return false;
    this.lastAutoCalibrate = now;
    try {
      const cal = calibrate(img);
      this.calibrations = remember(this.calibrations, cal);
      this.useCalibration(cal);
      return true;
    } catch {
      return false;
    }
  }

  private tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      this.step();
    } finally {
      this.busy = false;
      this.publish();
    }
  }

  private lastTickAt = performance.now();

  private step() {
    const now = performance.now();
    const gap = now - this.lastTickAt;
    this.lastTickAt = now;
    if (!this.capture.active || this.paused) return;

    // 1. where is the board?
    const interval = this.lostTicks >= LOST_TICKS ? DETECT_RETRY_MS : VERIFY_MS;
    const searching = !this.region || (!this.manualRegion && now - this.lastDetect > interval);
    const retryOk = now - this.lastDetect > DETECT_RETRY_MS || gap > 2000;
    if (searching && retryOk) {
      if (!this.detectBoard() && !this.region) {
        this.message = 'Looking for the board… (or use “Select board”)';
        return;
      }
    }
    if (!this.region) return;

    const img = this.capture.grabBoard(this.region);
    if (!img) return;
    this.lastImg = img;

    // 2. is there a calibration for this board?
    if (!this.calibration) {
      if (!this.autoCalibrate(img, now)) this.message = 'Show the starting position once so the pieces can be learned';
      return;
    }

    const screen = readScreen(img, this.calibration);

    // a start position that our calibration misreads means the board style changed: learn it again
    if (looksLikeStart(screen)) {
      const reads = [false, true].some((f) => gridPlacement(orient(screen, f)) === START_GRID);
      if (!reads) this.autoCalibrate(img, now);
    }

    // 3. is the board still where we think it is?
    const unknownCount = screen.unknown.filter(Boolean).length;
    const garbage = screen.highlighted.length > 8 || unknownCount > 20;
    this.lostTicks = garbage ? this.lostTicks + 1 : 0;
    if (this.lostTicks >= LOST_TICKS && !this.manualRegion) {
      this.message = 'Lost the board, looking for it again…';
      if (now - this.lastDetect > DETECT_RETRY_MS) this.detectBoard();
    } else if (this.lostTicks >= LOST_TICKS) {
      this.message = 'The board region does not look like a board. Use “Select board” or “Find board”';
    }

    if (this.debug) this.debugData = this.labelsFor(screen, this.watcher.tracker.orientation);

    // 4. which position is it?
    const result = this.watcher.step(screen);
    if (result.kind === 'hold') {
      if (this.lostTicks < LOST_TICKS) this.message = result.message;
      return;
    }
    if (this.lostTicks < LOST_TICKS) this.message = '';
    if (result.kind === 'same') return;

    this.lastReading = orient(screen, result.flipped);
    this.emit(result.fen, result.flipped, result.via === 'free' && result.source === 'guess');
  }

  /** Labels and unknown flags in screen order (the order the preview grid is drawn in). */
  private labelsFor(screen: ScreenReading, flipped: boolean) {
    const read = orient(screen, flipped);
    const labels: string[] = [];
    const unknown: boolean[] = [];
    for (let i = 0; i < 64; i++) {
      const sq = flipped ? 63 - i : i;
      labels.push(read.grid[sq >> 3][sq & 7] ?? '.');
      unknown.push(read.unknown[sq]);
    }
    return { labels, unknown };
  }

  // --- preview canvas -----------------------------------------------------------------------------

  /** Connects the preview canvas (or disconnects it with `null`). */
  attachPreview(canvas: HTMLCanvasElement | null) {
    if (canvas === this.canvas) return;
    this.detachCanvas?.();
    this.detachCanvas = null;
    this.canvas = canvas;
    if (!canvas) return;

    const down = (e: PointerEvent) => {
      if (!this.selecting || !this.capture.active) return;
      canvas.setPointerCapture(e.pointerId);
      this.dragStart = this.dragNow = this.toFrame(e);
    };
    const move = (e: PointerEvent) => {
      if (this.dragStart) this.dragNow = this.toFrame(e);
    };
    const up = () => {
      if (!this.dragStart || !this.dragNow) return;
      const r = this.dragRegion();
      this.dragStart = this.dragNow = null;
      if (r && r.w > 0.02) {
        this.region = r;
        this.manualRegion = true;
        this.watcher.reset(this.calibration?.flipped);
        this.lostTicks = 0;
      }
      this.selecting = false;
      canvas.classList.remove('selecting');
      this.publish();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    this.detachCanvas = () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
    };
  }

  /** Pointer position as pixels of the video frame. */
  private toFrame(e: PointerEvent) {
    const rect = this.canvas!.getBoundingClientRect();
    const { videoWidth: vw, videoHeight: vh } = this.capture.video;
    return {
      x: ((e.clientX - rect.left) / rect.width) * vw,
      y: ((e.clientY - rect.top) / rect.height) * vh,
    };
  }

  /** The dragged rectangle forced square (the board is square). */
  private dragRegion(): Region | null {
    if (!this.dragStart || !this.dragNow) return null;
    const { videoWidth: vw, videoHeight: vh } = this.capture.video;
    const dx = this.dragNow.x - this.dragStart.x;
    const dy = this.dragNow.y - this.dragStart.y;
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    const x = dx < 0 ? this.dragStart.x - side : this.dragStart.x;
    const y = dy < 0 ? this.dragStart.y - side : this.dragStart.y;
    return { x: x / vw, y: y / vh, w: side / vw, h: side / vh };
  }

  private draw() {
    const canvas = this.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const v = this.capture.video;
    if (!this.capture.active) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (canvas.width !== v.videoWidth || canvas.height !== v.videoHeight) {
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
    }
    ctx.drawImage(v, 0, 0);
    const r = this.dragRegion() ?? this.region;
    if (!r) return;
    const x = r.x * v.videoWidth;
    const y = r.y * v.videoHeight;
    const s = r.w * v.videoWidth;
    ctx.lineWidth = Math.max(1, v.videoWidth / 800);
    ctx.strokeStyle = '#ff3b6b';
    ctx.strokeRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(255,59,107,0.45)';
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      ctx.moveTo(x + (s * i) / 8, y);
      ctx.lineTo(x + (s * i) / 8, y + s);
      ctx.moveTo(x, y + (s * i) / 8);
      ctx.lineTo(x + s, y + (s * i) / 8);
    }
    ctx.stroke();

    if (this.debugData) {
      const sq = s / 8;
      ctx.font = `bold ${Math.max(10, sq * 0.45)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 64; i++) {
        const cx = x + (i % 8) * sq;
        const cy = y + Math.floor(i / 8) * sq;
        if (this.debugData.unknown[i]) {
          ctx.fillStyle = 'rgba(255,0,0,0.35)';
          ctx.fillRect(cx, cy, sq, sq);
        }
        const label = this.debugData.labels[i];
        if (label && label !== '.') {
          ctx.fillStyle = '#ff3b6b';
          ctx.fillText(label, cx + sq / 2, cy + sq / 2);
        }
      }
    }
  }
}
