import { describe, expect, it } from 'vitest';
import {
  START_FEN,
  cpToPercent,
  createSession,
  isTrivialState,
  normalizeSession,
  normalizeSessions,
  uciLineToSan,
} from './sessions';

describe('sessions', () => {
  it('maps centipawns to a capped percentage', () => {
    expect(cpToPercent(0)).toBe(50);
    expect(cpToPercent(5000)).toBe(95);
    expect(cpToPercent(-5000)).toBe(5);
  });

  it('falls back to a fresh session for garbage input', () => {
    const [only] = normalizeSessions('nope', 1);
    expect(only.name).toBe('Game 1');
    expect(only.fen).toBe(START_FEN);
  });

  it('repairs a partly broken session and drops bad history entries', () => {
    const s = normalizeSession(
      { id: 'a', name: '  ', fen: '', orientation: 'x', undoStack: [{ fen: 'f', san: 'e4' }, 7], lastMove: { from: 'e2' } },
      2,
      99
    )!;
    expect(s).toMatchObject({ name: 'Game 3', fen: START_FEN, orientation: 'white', lastMove: null, updatedAt: 99 });
    expect(s.undoStack).toEqual([{ fen: 'f', san: 'e4' }]);
    expect(normalizeSession({ name: 'no id' }, 0)).toBeNull();
  });

  it('dedupes sessions by id', () => {
    const list = normalizeSessions([{ id: 'a', name: 'one' }, { id: 'a', name: 'two' }]);
    expect(list).toHaveLength(1);
  });

  it('detects the untouched default state', () => {
    const s = createSession('Game 1', { id: 'x' });
    expect(isTrivialState([s], 'x')).toBe(true);
    expect(isTrivialState([{ ...s, orientation: 'black' }], 'x')).toBe(false);
  });

  it('converts UCI lines to SAN and stops at an illegal move', () => {
    expect(uciLineToSan(START_FEN, ['e2e4', 'e7e5', 'a1a5'])).toEqual(['e4', 'e5']);
  });
});
