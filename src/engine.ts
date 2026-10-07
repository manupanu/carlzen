export interface EvalResult {
  depth?: number; // current search depth reported by Stockfish
  cp?: number; // centipawns (absolute, from white's perspective)
  mate?: number; // positive = white mates, negative = black mates
  multipv?: number; // which PV line this is
  pv?: string[]; // array of moves in UCI format
}

export type EngineMessage =
  | { type: 'ready' }
  | { type: 'restarted' }
  | { type: 'bestmove'; data: string; searchId: number }
  | { type: 'eval'; result: EvalResult; searchId: number };

export interface EloRange {
  min: number;
  max: number;
}

/** Parses `option name UCI_Elo type spin default … min … max …`. */
export function parseEloOption(line: string): EloRange | null {
  if (!/^option name UCI_Elo /.test(line)) return null;
  const min = /\bmin (\d+)/.exec(line);
  const max = /\bmax (\d+)/.exec(line);
  return min && max ? { min: Number(min[1]), max: Number(max[1]) } : null;
}

/** A search that prints nothing for this long is considered hung. */
const SILENCE_MS = 30000;
/** After `stop`, the engine must answer with `bestmove` within this time. */
const STOP_GRACE_MS = 5000;
const MAX_RESTARTS = 8;

interface SearchRequest {
  fen: string;
  depth: number;
  searchId: number;
}

export class Engine {
  private stockfish!: Worker;
  private onMessage: (msg: EngineMessage) => void;
  private isReady = false;
  private isSearching = false;
  private pendingGo: SearchRequest | null = null;
  private currentFen = '';
  private activeSearchId = 0;
  private nextSearchId = 1;
  /** The request that was running (or queued) last, re-issued after a restart if it never finished. */
  private lastRequest: SearchRequest | null = null;
  private lastRequestDone = true;
  private elo: number | null = null;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private restarts = 0;
  private workerUrl: string;
  /** Range the engine accepts for `UCI_Elo`, read from its option list. */
  public eloRange: EloRange = { min: 1320, max: 3190 };

  constructor(onMessage: (msg: EngineMessage) => void) {
    this.onMessage = onMessage;
    const wasmSupported =
      typeof WebAssembly === 'object' &&
      WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
    this.workerUrl = wasmSupported ? '/stockfish-19-lite-single.js' : '/stockfish-19-asm.js';
    this.spawn();
  }

  private spawn() {
    this.isReady = false;
    this.stockfish = new Worker(this.workerUrl);
    this.stockfish.onmessage = (event) => this.handleLine(event.data);
    this.stockfish.onerror = () => this.restart();
    this.stockfish.postMessage('uci');
  }

  private handleLine(line: unknown) {
    if (typeof line !== 'string') return;
    // any output means the engine is alive: push the hang deadline back
    if (this.isSearching) this.arm(SILENCE_MS);

    const elo = parseEloOption(line);
    if (elo) {
      this.eloRange = elo;
      return;
    }

    if (line === 'uciok') {
      this.stockfish.postMessage('setoption name MultiPV value 3');
      this.applyStrength();
      this.isReady = true;
      const restarted = this.restarts > 0;
      this.onMessage({ type: 'ready' });
      if (restarted) {
        this.onMessage({ type: 'restarted' });
        // carry on with the search that was lost
        if (this.lastRequest && !this.lastRequestDone) {
          const { fen, depth, searchId } = this.lastRequest;
          this.evaluatePosition(fen, depth, searchId);
        }
      }
    } else if (line.startsWith('bestmove')) {
      this.isSearching = false;
      clearTimeout(this.watchdog);
      this.restarts = 0;
      const match = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);

      if (this.pendingGo) {
        const next = this.pendingGo;
        this.pendingGo = null;
        this.evaluatePosition(next.fen, next.depth, next.searchId);
      } else {
        this.lastRequestDone = true;
        if (match) {
          this.onMessage({ type: 'bestmove', data: match[1], searchId: this.activeSearchId });
        }
      }
    } else if (line.startsWith('info depth')) {
      // If we have a pending go, we are technically stopping, so we can ignore stale evals
      if (this.pendingGo) return;

      const depthMatch = line.match(/info depth (\d+)/);
      const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
      if (scoreMatch) {
        const type = scoreMatch[1];
        const val = parseInt(scoreMatch[2], 10);
        const isBlackToMove = this.currentFen.includes(' b ');
        const absoluteScore = isBlackToMove ? -val : val;

        const multipvMatch = line.match(/multipv (\d+)/);
        const multipv = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;

        const pvMatch = line.match(/\bpv\s+(.*)$/);
        const pv = pvMatch ? pvMatch[1].trim().split(' ') : [];

        const result: EvalResult = { multipv, pv };
        if (depthMatch) result.depth = parseInt(depthMatch[1], 10);
        if (type === 'cp') result.cp = absoluteScore;
        else result.mate = absoluteScore;

        this.onMessage({ type: 'eval', result, searchId: this.activeSearchId });
      }
    }
  }

  private arm(ms: number) {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.restart(), ms);
  }

  /** Replace a hung or crashed worker; the last unfinished request is re-issued once the new one is ready. */
  private restart() {
    clearTimeout(this.watchdog);
    if (this.restarts >= MAX_RESTARTS) return;
    this.restarts++;
    this.stockfish.onmessage = null;
    this.stockfish.onerror = null;
    this.stockfish.terminate();
    this.isSearching = false;
    this.pendingGo = null;
    this.spawn();
  }

  private applyStrength() {
    if (this.elo === null) {
      this.stockfish.postMessage('setoption name UCI_LimitStrength value false');
    } else {
      this.stockfish.postMessage('setoption name UCI_LimitStrength value true');
      this.stockfish.postMessage(`setoption name UCI_Elo value ${Math.round(this.elo)}`);
    }
  }

  /**
   * Limits the strength of the move the engine picks (`bestmove`) to a playing strength; `null` means full
   * strength. The analysis lines are not weakened.
   */
  public setStrength(elo: number | null) {
    this.elo = elo;
    if (this.isReady) this.applyStrength();
  }

  public evaluatePosition(fen: string, depth: number = 18, searchId?: number) {
    if (!this.isReady) return;

    const resolvedSearchId = searchId ?? this.nextSearchId++;
    this.lastRequest = { fen, depth, searchId: resolvedSearchId };
    this.lastRequestDone = false;

    if (this.isSearching) {
      this.pendingGo = { fen, depth, searchId: resolvedSearchId };
      this.stockfish.postMessage('stop');
      this.arm(STOP_GRACE_MS);
      return resolvedSearchId;
    }

    this.isSearching = true;
    this.currentFen = fen;
    this.activeSearchId = resolvedSearchId;
    this.arm(SILENCE_MS);
    this.stockfish.postMessage(`position fen ${fen}`);
    this.stockfish.postMessage(`go depth ${depth}`);
    return resolvedSearchId;
  }

  public stop() {
    if (this.isSearching) {
      this.pendingGo = null; // Drop any queued evaluation
      this.lastRequestDone = true;
      this.stockfish.postMessage('stop');
    }
  }

  public quit() {
    clearTimeout(this.watchdog);
    this.stockfish.postMessage('quit');
    this.stockfish.terminate();
  }
}
