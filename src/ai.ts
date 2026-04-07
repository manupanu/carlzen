export interface CoachLine {
  rank: number;
  cp?: number;
  mate?: number;
  uci: string[];
  san: string[];
}

export interface CoachRequestPayload {
  fen: string;
  move: string;
  moveUci?: string;
  evaluation?: string;
  scoreCp?: number;
  scoreMate?: number;
  engineDepth?: number;
  topLines?: CoachLine[];
  recentMoves?: string[];
}

export const getCoachFeedback = async (
  payload: CoachRequestPayload,
  onChunk: (text: string) => void,
  signal?: AbortSignal
) => {
  try {
    const response = await fetch('/api/coach', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch AI feedback: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      onChunk(chunk);
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') return;
    console.error('Error fetching AI coaching:', error);
    onChunk('Sorry, I couldn\'t analyze that move right now.');
  }
};
