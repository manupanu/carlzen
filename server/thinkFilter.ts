const OPEN = '<think>';
const CLOSE = '</think>';

/** Strips `<think>…</think>` blocks from a streamed response, even when a tag is split across chunks. */
export class ThinkFilter {
  private buffer = '';
  private thinking = false;

  /** Feeds a chunk and returns the text that is safe to forward. */
  push(chunk: string): string {
    this.buffer += chunk;
    let out = '';

    while (this.buffer.length > 0) {
      const tag = this.thinking ? CLOSE : OPEN;
      const at = this.buffer.indexOf(tag);

      if (at !== -1) {
        if (!this.thinking) out += this.buffer.slice(0, at);
        this.buffer = this.buffer.slice(at + tag.length);
        this.thinking = !this.thinking;
        continue;
      }

      // Keep a trailing partial tag until more data arrives.
      const keep = partialTagLength(this.buffer, tag);
      if (!this.thinking) out += this.buffer.slice(0, this.buffer.length - keep);
      this.buffer = this.buffer.slice(this.buffer.length - keep);
      break;
    }

    return out;
  }

  /** Returns text still held back at the end of the stream (nothing while inside a think block). */
  flush(): string {
    const rest = this.thinking ? '' : this.buffer;
    this.buffer = '';
    return rest;
  }
}

/** Length of the longest suffix of `text` that is a proper prefix of `tag`. */
function partialTagLength(text: string, tag: string): number {
  for (let len = Math.min(text.length, tag.length - 1); len > 0; len--) {
    if (tag.startsWith(text.slice(text.length - len))) return len;
  }
  return 0;
}
