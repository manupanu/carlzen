import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// AI Coaching endpoint
app.post('/api/coach', async (req, res) => {
  const { fen, move } = req.body;

  if (!fen || !move) {
    return res.status(400).json({ error: 'Missing fen or move in request body' });
  }

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are CarlZen, an elite chess coach. Explain the strategic intent behind moves in 1-2 concise sentences. Focus on concepts (e.g., control of the center, piece activity, pawn structure) rather than just tactical lines.',
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

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(content);
      }
    }
    res.end();
  } catch (error: any) {
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
