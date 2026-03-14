export interface EvalResult {
  cp?: number;       // centipawns (absolute, from white's perspective)
  mate?: number;     // positive = white mates, negative = black mates
}

export type EngineMessage =
  | { type: 'ready' }
  | { type: 'bestmove'; data: string }
  | { type: 'eval'; result: EvalResult };

export class Engine {
  private stockfish: Worker;
  private onMessage: (msg: EngineMessage) => void;
  private isReady = false;
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
        this.isReady = true;
        this.onMessage({ type: 'ready' });
      } else if (line.startsWith('bestmove')) {
        const match = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (match) {
          this.onMessage({ type: 'bestmove', data: match[1] });
        }
      } else if (line.startsWith('info depth')) {
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        if (scoreMatch) {
          const type = scoreMatch[1];
          const val = parseInt(scoreMatch[2], 10);
          const isBlackToMove = this.currentFen.includes(' b ');

          if (type === 'cp') {
            // Normalize to always be from white's perspective
            const absoluteCp = isBlackToMove ? -val : val;
            this.onMessage({ type: 'eval', result: { cp: absoluteCp } });
          } else {
            // mate: positive = side to move mates, normalize to white's perspective
            const absoluteMate = isBlackToMove ? -val : val;
            this.onMessage({ type: 'eval', result: { mate: absoluteMate } });
          }
        }
      }
    };

    this.stockfish.postMessage('uci');
  }

  public evaluatePosition(fen: string, depth: number = 18) {
    if (!this.isReady) return;
    this.currentFen = fen;
    this.stockfish.postMessage(`position fen ${fen}`);
    this.stockfish.postMessage(`go depth ${depth}`);
  }

  public stop() {
    this.stockfish.postMessage('stop');
  }

  public quit() {
    this.stockfish.postMessage('quit');
    this.stockfish.terminate();
  }
}
