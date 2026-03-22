export interface EvalResult {
  cp?: number;       // centipawns (absolute, from white's perspective)
  mate?: number;     // positive = white mates, negative = black mates
  multipv?: number;  // which PV line this is
  pv?: string[];     // array of moves in UCI format
}

export type EngineMessage =
  | { type: 'ready' }
  | { type: 'bestmove'; data: string }
  | { type: 'eval'; result: EvalResult };

export class Engine {
  private stockfish: Worker;
  private onMessage: (msg: EngineMessage) => void;
  private isReady = false;
  private isSearching = false;
  private pendingGo: { fen: string; depth: number } | null = null;
  private currentFen = '';

  constructor(onMessage: (msg: EngineMessage) => void) {
    this.onMessage = onMessage;
    const wasmSupported =
      typeof WebAssembly === 'object' &&
      WebAssembly.validate(
        Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
      );
    this.stockfish = new Worker(
      wasmSupported ? '/stockfish-18-lite-single.js' : '/stockfish-18-asm.js'
    );

    this.stockfish.onmessage = (event) => {
      const line = event.data;
      if (typeof line !== 'string') return;

      if (line === 'uciok') {
        this.stockfish.postMessage('setoption name MultiPV value 3');
        this.isReady = true;
        this.onMessage({ type: 'ready' });
      } else if (line.startsWith('bestmove')) {
        this.isSearching = false;
        const match = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
        
        if (this.pendingGo) {
          const next = this.pendingGo;
          this.pendingGo = null;
          this.evaluatePosition(next.fen, next.depth);
        } else if (match) {
          this.onMessage({ type: 'bestmove', data: match[1] });
        }
      } else if (line.startsWith('info depth')) {
        // If we have a pending go, we are technically stopping, so we can ignore stale evals
        if (this.pendingGo) return;
        
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
          if (type === 'cp') result.cp = absoluteScore;
          else result.mate = absoluteScore;

          this.onMessage({ type: 'eval', result });
        }
      }
    };

    this.stockfish.postMessage('uci');
  }

  public evaluatePosition(fen: string, depth: number = 18) {
    if (!this.isReady) return;
    
    if (this.isSearching) {
      this.pendingGo = { fen, depth };
      this.stockfish.postMessage('stop');
      return;
    }

    this.isSearching = true;
    this.currentFen = fen;
    this.stockfish.postMessage(`position fen ${fen}`);
    this.stockfish.postMessage(`go depth ${depth}`);
  }

  public stop() {
    if (this.isSearching) {
      this.pendingGo = null; // Drop any queued evaluation
      this.stockfish.postMessage('stop');
    }
  }

  public quit() {
    this.stockfish.postMessage('quit');
    this.stockfish.terminate();
  }
}
