import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { formatCoachRequest } from './coachPrompt.js';
import { ThinkFilter } from './thinkFilter.js';
import { readSyncState, writeSyncState } from './syncStore.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// In production the frontend is served from this server, so CORS is only needed for the Vite dev server.
if (process.env.NODE_ENV !== 'production') {
  app.use(cors());
}
app.use(express.json({ limit: '1mb' }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(process.env.AI_BASE_URL ? { baseURL: process.env.AI_BASE_URL } : {}),
});

const aiModel = process.env.AI_MODEL || 'gpt-4o';

const limit = (perMinute: number) =>
  rateLimit({ windowMs: 60_000, limit: perMinute, standardHeaders: 'draft-7', legacyHeaders: false });

app.use('/api/coach', limit(Number(process.env.COACH_RATE_LIMIT) || 20));
app.use('/api/sync', limit(Number(process.env.SYNC_RATE_LIMIT) || 60));

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

    const filter = new ThinkFilter();

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (!content) continue;
      const text = filter.push(content);
      if (text) res.write(text);
    }

    const rest = filter.flush();
    if (rest) res.write(rest);
    res.end();
  } catch (error: unknown) {
    console.error('OpenAI API Error:', error);
    if (res.headersSent) {
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to fetch AI feedback' });
    }
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
