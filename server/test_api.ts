import dotenv from 'dotenv';
dotenv.config();
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_BASE_URL,
});

async function run() {
  const stream = await openai.chat.completions.create({
    model: process.env.AI_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `
          Provide only the final advice in 2-4 very concise sentences.
          You are CarlZen, an elite chess coach. Give a strategic summary of the move, focusing on key themes such as piece activity, king safety, or center control. Keep the final answer direct and concise. Default to plain text with no markdown or extra prefacing. Do not include internal reasoning, thoughts, or <think> tags.
          `
      },
      {
        role: 'user',
        content: `In the position r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3, why is Bb5 the best move?`
      }
    ],
    stream: true,
  });

  console.log("Stream started...");
  for await (const chunk of stream) {
    if (chunk.choices[0]?.delta) {
      console.log("DELTA:", JSON.stringify(chunk.choices[0].delta));
    }
  }
  console.log("Stream finished.");
}

run().catch(console.error);
