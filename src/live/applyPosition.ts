import { Chess } from 'chess.js';
import type { Session } from '../SessionTabs';
import { movePlayed } from './review';

/** Placement and side to move: castling and en-passant fields are inferred from the screen and may differ. */
const key = (fen: string) => fen.split(' ').slice(0, 2).join(' ');
const placement = (fen: string) => fen.split(' ')[0];

/**
 * Turns a position read from the screen into the next state of a game tab, using the same history shape as
 * moves played on the board: one legal move is recorded as a move, a step back or forward through the
 * tab's own history is an undo or redo, anything else is a jump (new game, far-away move).
 */
export function applyLivePosition(session: Session, fen: string, orientation: 'white' | 'black'): Session {
  if (key(fen) === key(session.fen)) {
    return session.orientation === orientation ? session : { ...session, orientation };
  }
  // same pieces, other side to move: a corrected turn, the history stays
  if (placement(fen) === placement(session.fen)) {
    return { ...session, fen, orientation };
  }

  const undo = session.undoStack.at(-1);
  if (undo && key(undo.fen) === key(fen)) {
    return {
      ...session,
      fen: undo.fen,
      orientation,
      undoStack: session.undoStack.slice(0, -1),
      redoStack: [{ fen: session.fen, san: undo.san }, ...session.redoStack],
      lastMove: null,
    };
  }

  const redo = session.redoStack[0];
  if (redo && key(redo.fen) === key(fen)) {
    return {
      ...session,
      fen: redo.fen,
      orientation,
      undoStack: [...session.undoStack, { fen: session.fen, san: redo.san }],
      redoStack: session.redoStack.slice(1),
      lastMove: null,
    };
  }

  const played = movePlayed(session.fen, fen);
  if (played) {
    const game = new Chess(session.fen);
    const move = game.move(played.san);
    return {
      ...session,
      fen: game.fen(),
      orientation,
      undoStack: [...session.undoStack, { fen: session.fen, san: move.san }],
      redoStack: [],
      lastMove: { from: move.from, to: move.to },
    };
  }

  return { ...session, fen, orientation, undoStack: [], redoStack: [], lastMove: null };
}
