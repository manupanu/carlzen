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
      throw new Error(await describeFailure(response));
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
    onChunk(
      error instanceof Error && error.message
        ? `Sorry, I couldn't analyze that move right now (${error.message}).`
        : 'Sorry, I couldn\'t analyze that move right now.'
    );
  }
};

/** Turns a failed coach response into a short, readable reason. */
async function describeFailure(response: Response): Promise<string> {
  if (response.status === 429) return 'too many requests, try again in a minute';
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // not JSON; fall through
  }
  return response.statusText || `HTTP ${response.status}`;
}
