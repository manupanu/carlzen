import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Engine, parseEloOption, type EngineMessage } from './engine';

/** A fake Stockfish worker; `hang` makes it ignore `go`, `ignoreStop` makes it ignore `stop`. */
class FakeWorker {
  static all: FakeWorker[] = [];
  static hang = false;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  say(line: string) {
    this.onmessage?.({ data: line });
  }
  postMessage(cmd: string) {
    this.sent.push(cmd);
    if (cmd === 'uci') {
      this.say('option name UCI_Elo type spin default 1320 min 1320 max 3190');
      this.say('uciok');
    } else if (cmd.startsWith('go') && !FakeWorker.hang) {
      this.say('info depth 10 multipv 1 score cp 20 pv e2e4');
      this.say('bestmove e2e4');
    }
  }
  terminate() {
    this.terminated = true;
  }
}

let messages: EngineMessage[];
const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const make = () => new Engine((m) => messages.push(m));
const best = () => messages.filter((m) => m.type === 'bestmove');

beforeEach(() => {
  vi.useFakeTimers();
  FakeWorker.all = [];
  FakeWorker.hang = false;
  messages = [];
  (globalThis as { Worker?: unknown }).Worker = FakeWorker;
});
afterEach(() => vi.useRealTimers());

describe('parseEloOption', () => {
  it('reads the UCI_Elo range', () => {
    expect(parseEloOption('option name UCI_Elo type spin default 1320 min 1320 max 3190')).toEqual({
      min: 1320,
      max: 3190,
    });
  });
  it('ignores other options', () => {
    expect(parseEloOption('option name Hash type spin default 16 min 1 max 33554432')).toBeNull();
  });
});

describe('Engine', () => {
  it('analyses and reports the best move, with White-relative scores', () => {
    const engine = make();
    engine.evaluatePosition(FEN, 10);
    expect(best()).toEqual([{ type: 'bestmove', data: 'e2e4', searchId: 1 }]);
    expect(messages.some((m) => m.type === 'eval')).toBe(true);
    expect(engine.eloRange).toEqual({ min: 1320, max: 3190 });
  });

  it('applies the strength setting, also before the engine is ready and after a restart', () => {
    const engine = make();
    engine.setStrength(1500);
    expect(FakeWorker.all[0].sent).toContain('setoption name UCI_Elo value 1500');
    FakeWorker.all[0].onerror?.();
    expect(FakeWorker.all[1].sent).toContain('setoption name UCI_Elo value 1500');
    engine.setStrength(null);
    expect(FakeWorker.all[1].sent).toContain('setoption name UCI_LimitStrength value false');
  });

  it('restarts a hung engine and finishes the request', () => {
    const engine = make();
    FakeWorker.hang = true;
    engine.evaluatePosition(FEN, 10);
    expect(best()).toEqual([]);
    FakeWorker.hang = false; // the replacement works
    vi.advanceTimersByTime(31000);
    expect(FakeWorker.all).toHaveLength(2);
    expect(FakeWorker.all[0].terminated).toBe(true);
    expect(messages.some((m) => m.type === 'restarted')).toBe(true);
    expect(best()).toHaveLength(1);
  });

  it('restarts when a new request cannot interrupt a stuck search', () => {
    const engine = make();
    FakeWorker.hang = true;
    engine.evaluatePosition(FEN, 10);
    FakeWorker.hang = false;
    engine.evaluatePosition(FEN, 12); // sends stop, which the hung engine ignores
    vi.advanceTimersByTime(5500);
    expect(FakeWorker.all).toHaveLength(2);
    expect(best().at(-1)).toMatchObject({ type: 'bestmove', searchId: 2 });
  });

  it('restarts when the worker crashes', () => {
    make();
    FakeWorker.all[0].onerror?.();
    expect(FakeWorker.all).toHaveLength(2);
  });

  it('does not restart an engine that keeps talking', () => {
    const engine = make();
    FakeWorker.hang = true;
    engine.evaluatePosition(FEN, 20);
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(20000);
      FakeWorker.all[0].say('info depth 15 multipv 1 score cp 10 pv e2e4');
    }
    expect(FakeWorker.all).toHaveLength(1);
  });
});
