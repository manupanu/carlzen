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
  const { fen, move } = req.body;

  if (!fen || !move) {
    return res.status(400).json({ error: 'Missing fen or move in request body' });
  }

  try {
    const stream = await openai.chat.completions.create({
      model: aiModel,
      messages: [
        {
          role: 'system',
          content: `
          Provide only the final advice in 2-4 very concise sentences.
          You are CarlZen, an elite chess coach. Give a strategic summary of the move, focusing on key themes such as piece activity, king safety, or center control. Keep the final answer direct and concise. Default to plain text with no markdown or extra prefacing. Do not include internal reasoning, thoughts, or XML-like reasoning tags.
          `,
        },
        {
          role: 'user',
          content: `In the position ${fen}, why is ${move} the best move?`,
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
