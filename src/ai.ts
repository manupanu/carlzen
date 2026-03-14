export const getCoachFeedback = async (
  fen: string,
  move: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal
) => {
  try {
    const response = await fetch('/api/coach', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fen, move }),
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
  } catch (error: any) {
    if (error.name === 'AbortError') return;
    console.error('Error fetching AI coaching:', error);
    onChunk('Sorry, I couldn\'t analyze that move right now.');
  }
};
