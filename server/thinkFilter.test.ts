import { describe, expect, it } from 'vitest';
import { ThinkFilter } from './thinkFilter';

function run(chunks: string[]) {
  const f = new ThinkFilter();
  return chunks.map((c) => f.push(c)).join('') + f.flush();
}

describe('ThinkFilter', () => {
  it('passes plain text through', () => {
    expect(run(['Hello ', 'world'])).toBe('Hello world');
  });

  it('drops a think block', () => {
    expect(run(['<think>secret</think>Answer'])).toBe('Answer');
  });

  it('handles tags split across chunks', () => {
    expect(run(['Hi <thi', 'nk>hidden</th', 'ink> there'])).toBe('Hi  there');
  });

  it('handles several blocks and character-by-character input', () => {
    const text = 'a<think>x</think>b<think>y</think>c';
    expect(run([...text])).toBe('abc');
  });

  it('keeps a lone "<" that is not a tag', () => {
    expect(run(['1 < 2', ' and 3 <'])).toBe('1 < 2 and 3 <');
  });

  it('drops an unterminated think block', () => {
    expect(run(['ok<think>never closed'])).toBe('ok');
  });
});
