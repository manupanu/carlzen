/** Builds the engine-context part of the coach prompt from an untrusted request body. */
export function formatCoachRequest(body: Record<string, unknown>) {
  const fen = typeof body.fen === 'string' ? body.fen : '';
  const move = typeof body.move === 'string' ? body.move : '';
  const moveUci = typeof body.moveUci === 'string' ? body.moveUci : '';
  const evaluation = typeof body.evaluation === 'string' ? body.evaluation : '';
  const scoreCp = typeof body.scoreCp === 'number' ? body.scoreCp : undefined;
  const scoreMate = typeof body.scoreMate === 'number' ? body.scoreMate : undefined;
  const engineDepth = typeof body.engineDepth === 'number' ? body.engineDepth : undefined;
  const recentMoves = Array.isArray(body.recentMoves)
    ? body.recentMoves.filter((item): item is string => typeof item === 'string').slice(-8)
    : [];
  const topLines = Array.isArray(body.topLines)
    ? body.topLines
        .filter((line): line is Record<string, unknown> => typeof line === 'object' && line !== null)
        .slice(0, 3)
        .map((line, index) => ({
          rank: typeof line.rank === 'number' ? line.rank : index + 1,
          cp: typeof line.cp === 'number' ? line.cp : undefined,
          mate: typeof line.mate === 'number' ? line.mate : undefined,
          uci: Array.isArray(line.uci) ? line.uci.filter((item): item is string => typeof item === 'string').slice(0, 6) : [],
          san: Array.isArray(line.san) ? line.san.filter((item): item is string => typeof item === 'string').slice(0, 6) : [],
        }))
    : [];

  return [
    `Position FEN: ${fen}`,
    `Best move (SAN): ${move}`,
    moveUci ? `Best move (UCI): ${moveUci}` : null,
    evaluation ? `Stockfish evaluation: ${evaluation}` : null,
    scoreCp !== undefined ? `Stockfish centipawn score from White's perspective: ${scoreCp}` : null,
    scoreMate !== undefined ? `Stockfish mate score from White's perspective: ${scoreMate}` : null,
    engineDepth !== undefined ? `Engine depth used: ${engineDepth}` : null,
    recentMoves.length > 0 ? `Recent SAN moves: ${recentMoves.join(' ')}` : null,
    topLines.length > 0
      ? `Top Stockfish lines:\n${topLines
          .map((line) => {
            const score =
              line.mate !== undefined ? `mate ${line.mate}` : line.cp !== undefined ? `cp ${line.cp}` : 'no score';
            const san = line.san.length > 0 ? line.san.join(' ') : 'n/a';
            const uci = line.uci.length > 0 ? line.uci.join(' ') : 'n/a';
            return `#${line.rank}: ${score}; SAN: ${san}; UCI: ${uci}`;
          })
          .join('\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}
