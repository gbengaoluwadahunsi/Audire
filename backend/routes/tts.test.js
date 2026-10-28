import { describe, expect, it } from 'vitest';
import { locateWords } from './tts.js';

describe('locateWords', () => {
  it('maps each spoken word to its position in the text', () => {
    const text = 'Mister Smith read, then read again.';
    const words = locateWords(text, [
      { part: 'Mister', start: 0, end: 300 },
      { part: 'Smith', start: 310, end: 600 },
      { part: 'read', start: 610, end: 800 },
      { part: 'then', start: 900, end: 1000 },
      { part: 'read', start: 1010, end: 1200 },
      { part: 'again', start: 1210, end: 1500 },
    ]);
    expect(words.map((w) => w.offset)).toEqual([0, 7, 13, 19, 24, 29]);
    // The second "read" lands on the second occurrence.
    expect(text.slice(words[4].offset, words[4].offset + 4)).toBe('read');
  });

  it('skips words that are not in the text instead of misplacing the rest', () => {
    const words = locateWords('Read on.', [{ part: 'Ghost', start: 0, end: 1 }, { part: 'on', start: 2, end: 3 }]);
    expect(words).toEqual([{ text: 'on', offset: 5, start: 2, end: 3 }]);
  });
});
