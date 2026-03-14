import OpenAI from 'openai';

// NOTE: In a real app this should be handled securely on a backend.
// We are injecting it via Vite env variables for prototype purposes.
const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

let openai: OpenAI | null = null;
if (apiKey) {
   openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
}

export const getCoachFeedback = async (
  fen: string, 
  bestMove: string, 
  onChunk: (text: string) => void,
  signal?: AbortSignal
) => {
  if (!openai) {
    onChunk("⚠️ OpenAI API key is missing. Please set VITE_OPENAI_API_KEY in your .env file.");
    return;
  }

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4.1-nano-2025-04-14",
      messages: [
        {
          role: "system",
          content: "You are an elite chess coach. Your goal is to explain *why* a move is good in Standard Algebraic Notation (SAN). CRITICAL RULE: Your response MUST be 2 sentences maximum. Give actionable strategic insight, do not list variations."
        },
        {
          role: "user",
          content: `The current board state (FEN) is: ${fen}. \nThe top engine recommendation is to play the move: ${bestMove}. \nWhy is this a good move? Provide strategic coaching.`
        }
      ],
      stream: true,
    }, { signal });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        onChunk(content);
      }
    }
  } catch (error) {
    console.error("Error fetching AI coaching:", error);
    onChunk("Sorry, I couldn't analyze that move right now.");
  }
};
