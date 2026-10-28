import { describe, expect, it } from 'vitest';
import { splitIntoSentenceChunks } from './textSanitation';

const words = (s) => s.split(/\s+/).filter(Boolean);

describe('splitIntoSentenceChunks', () => {
  it('never drops or reorders words', () => {
    const text = [
      'It was a cold morning. “Are you coming?” she asked. He nodded!',
      'Chapter 2 began at 7.30 with 42 people... Nobody spoke',
      `${'A very long clause, '.repeat(30)}and the end.`,
    ].join('\n\n');
    const chunks = splitIntoSentenceChunks(text);
    expect(words(chunks.join(' '))).toEqual(words(text));
  });

  it('never merges across paragraphs', () => {
    const chunks = splitIntoSentenceChunks('Short one.\n\nShort two.');
    expect(chunks).toEqual(['Short one.', 'Short two.']);
  });

  it('splits very long sentences at natural pauses', () => {
    const long = `${'word '.repeat(60).trim()}, ${'more '.repeat(60).trim()}.`;
    const chunks = splitIntoSentenceChunks(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 450)).toBe(true);
  });

  it('returns nothing for empty input', () => {
    expect(splitIntoSentenceChunks('')).toEqual([]);
    expect(splitIntoSentenceChunks(null)).toEqual([]);
  });
});
