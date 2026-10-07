import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Session } from '../SessionTabs';
import { applyLivePosition } from './applyPosition';

const start = new Chess().fen();
const after = (...sans: string[]) => {
  const c = new Chess();
  for (const m of sans) c.move(m);
  return c.fen();
};
const placement = (fen: string) => fen.split(' ')[0];

const session = (fen = start, patch: Partial<Session> = {}): Session => ({
  id: 's1',
  name: 'Game 1',
  fen,
  orientation: 'white',
  undoStack: [],
  redoStack: [],
  lastMove: null,
  updatedAt: 0,
  ...patch,
});

describe('applyLivePosition', () => {
  it('records one legal move like a move played on the board', () => {
    const next = applyLivePosition(session(), after('e4'), 'white');
    expect(next.fen).toBe(after('e4'));
    expect(next.undoStack).toEqual([{ fen: start, san: 'e4' }]);
    expect(next.redoStack).toEqual([]);
    expect(next.lastMove).toEqual({ from: 'e2', to: 'e4' });
  });

  it('follows a whole game into the history', () => {
    let s = session();
    for (const sans of [['e4'], ['e4', 'e5'], ['e4', 'e5', 'Nf3']]) s = applyLivePosition(s, after(...sans), 'white');
    expect(s.undoStack.map((e) => e.san)).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('treats stepping back as an undo and forward again as a redo', () => {
    let s = applyLivePosition(session(), after('e4'), 'white');
    s = applyLivePosition(s, after('e4', 'e5'), 'white');
    const back = applyLivePosition(s, after('e4'), 'white');
    expect(back.fen).toBe(after('e4'));
    expect(back.undoStack.map((e) => e.san)).toEqual(['e4']);
    expect(back.redoStack.map((e) => e.san)).toEqual(['e5']);
    const forward = applyLivePosition(back, after('e4', 'e5'), 'white');
    expect(forward.undoStack.map((e) => e.san)).toEqual(['e4', 'e5']);
    expect(forward.redoStack).toEqual([]);
  });

  it('starts fresh on a jump', () => {
    const s = applyLivePosition(session(), after('e4'), 'white');
    const far = after('e4', 'e5', 'Nf3', 'Nc6', 'Bb5');
    const next = applyLivePosition(s, far, 'white');
    expect(next.fen).toBe(far);
    expect(next.undoStack).toEqual([]);
    expect(next.lastMove).toBeNull();
  });

  it('keeps the history when only the side to move was corrected', () => {
    const s = applyLivePosition(session(), after('e4'), 'white');
    const wrongTurn = after('e4').replace(' b ', ' w ');
    const next = applyLivePosition(s, wrongTurn, 'white');
    expect(next.undoStack).toEqual(s.undoStack);
    expect(next.fen).toBe(wrongTurn);
  });

  it('does nothing when the screen shows the position already on the board', () => {
    const s = session();
    expect(applyLivePosition(s, start, 'white')).toBe(s);
  });

  it('follows the side that is at the bottom of the screen', () => {
    const next = applyLivePosition(session(), start, 'black');
    expect(next.orientation).toBe('black');
  });

  it('copes with a screen position whose castling field differs', () => {
    const s = applyLivePosition(session(), after('e4'), 'white');
    const noCastling = after('e4', 'e5').replace('KQkq', '-');
    const next = applyLivePosition(s, noCastling, 'white');
    expect(placement(next.fen)).toBe(placement(noCastling));
    expect(next.undoStack.map((e) => e.san)).toEqual(['e4', 'e5']);
  });
});
