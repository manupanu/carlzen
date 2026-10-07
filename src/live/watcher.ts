import type { ScreenReading } from './recognizer';
import { Stabilizer, type TurnSource } from './position';
import { Tracker } from './tracker';

export type StepResult =
  | { kind: 'hold'; message: string }
  /** The board shows the position that was already accepted. */
  | { kind: 'same' }
  /** A new stable position. */
  | { kind: 'position'; fen: string; flipped: boolean; via: 'tracked' | 'free'; source?: TurnSource };

/** Turns a stream of screen readings into accepted positions: tracker + 2-frame stabilizer. */
export class Watcher {
  readonly tracker: Tracker;
  private stabilizer = new Stabilizer(2);
  private lastKey: string | null = null;

  constructor(prior = false) {
    this.tracker = new Tracker(prior);
  }

  private key(fen: string, flipped: boolean) {
    return `${flipped ? 'b' : 'w'} ${fen}`;
  }

  step(screen: ScreenReading): StepResult {
    const result = this.tracker.update(screen);
    if ('hold' in result) {
      this.stabilizer.reset();
      return { kind: 'hold', message: result.hold };
    }
    const stable = this.stabilizer.push(this.key(result.fen, result.flipped));
    if (stable === null || stable === this.lastKey) return { kind: 'same' };
    this.lastKey = stable;
    this.tracker.commit(result.fen, result.flipped);
    return { kind: 'position', ...result };
  }

  /** The position was changed from outside (side-to-move toggle). */
  override(fen: string, flipped: boolean) {
    this.lastKey = this.key(fen, flipped);
    this.tracker.commit(fen, flipped);
  }

  reset(prior?: boolean) {
    this.tracker.reset();
    if (prior !== undefined) this.tracker.setPrior(prior);
    this.stabilizer.reset();
    this.lastKey = null;
  }

  /** Forget in-flight frames (pause/resume) without forgetting the position. */
  settle() {
    this.stabilizer.reset();
  }
}
