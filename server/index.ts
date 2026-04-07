import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { readSyncState, writeSyncState } from './syncStore.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(process.env.AI_BASE_URL ? { baseURL: process.env.AI_BASE_URL } : {}),
});

const aiModel = process.env.AI_MODEL || 'gpt-4o';

function formatCoachRequest(body: Record<string, unknown>) {
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

app.post('/api/sync/pull', (req, res) => {
  try {
    const state = readSyncState(req.body?.token);
    res.json({ state });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid sync request';
    res.status(400).json({ error: message });
  }
});

app.post('/api/sync/push', (req, res) => {
  try {
    const state = writeSyncState(req.body?.token, req.body?.state);
    res.json({ state });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid sync request';
    res.status(400).json({ error: message });
  }
});

// AI Coaching endpoint
app.post('/api/coach', async (req, res) => {
  const { fen, move } = req.body as Record<string, unknown>;

  if (!fen || !move) {
    return res.status(400).json({ error: 'Missing fen or move in request body' });
  }

  try {
    const promptBody = formatCoachRequest(req.body as Record<string, unknown>);
    const stream = await openai.chat.completions.create({
      model: aiModel,
      messages: [
        {
          role: 'system',
          content: `
          You are CarlZen, a chess coach explaining Stockfish's recommendation to a human.
          The engine data is authoritative. Do not recalculate the position from scratch and do not guess tactics or lines beyond the supplied engine context.
          Explain why the best move makes sense using the evaluation and principal variations provided.
          Focus on 1-2 concrete ideas: immediate tactical point, strategic improvement, or the plan the move enables.
          If the data indicates a forcing line or mate, mention that directly and plainly.
          Keep the answer to 2-4 concise sentences, plain text only, no markdown, no bullet points, no prefacing, no internal reasoning, and no XML-like reasoning tags.
          If the engine data is limited, be honest and explain only what is supported by the supplied lines and eval.
          `,
        },
        {
          role: 'user',
          content: `Explain why Stockfish recommends this move.\n\n${promptBody}`,
        },
      ],
      stream: true,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    let isThinking = false;
    let buffer = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (!content) continue;

      buffer += content;

      while (buffer.length > 0) {
        if (!isThinking) {
          const thinkStart = buffer.indexOf('<think>');
          if (thinkStart !== -1) {
            // Write everything before <think>
            if (thinkStart > 0) {
              res.write(buffer.substring(0, thinkStart));
            }
            buffer = buffer.substring(thinkStart + 7);
            isThinking = true;
          } else {
            // Check if buffer ends with a partial '<think>'
            const lastOpenBracket = buffer.lastIndexOf('<');
            if (lastOpenBracket !== -1 && '<think>'.startsWith(buffer.substring(lastOpenBracket))) {
              if (lastOpenBracket > 0) {
                res.write(buffer.substring(0, lastOpenBracket));
                buffer = buffer.substring(lastOpenBracket);
              }
              break; // Wait for more data to complete the tag
            } else {
              res.write(buffer);
              buffer = '';
            }
          }
        } else {
          const thinkEnd = buffer.indexOf('</think>');
          if (thinkEnd !== -1) {
            buffer = buffer.substring(thinkEnd + 8);
            isThinking = false;
          } else {
            // Check if buffer ends with a partial '</think>'
            const lastOpenBracket = buffer.lastIndexOf('<');
            if (lastOpenBracket !== -1 && '</think>'.startsWith(buffer.substring(lastOpenBracket))) {
              buffer = buffer.substring(lastOpenBracket);
              break; // Wait for more data
            } else {
              buffer = ''; // Discard everything while thinking
              break;
            }
          }
        }
      }
    }
    res.end();
  } catch (error: unknown) {
    console.error('OpenAI API Error:', error);
    res.status(500).json({ error: 'Failed to fetch AI feedback' });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*path', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
