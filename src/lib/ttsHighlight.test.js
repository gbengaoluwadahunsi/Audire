import { describe, expect, it } from 'vitest';
import { findChunkRangeInTextFuzzy, trimWordPunctuation } from './ttsHighlight';

describe('findChunkRangeInTextFuzzy', () => {
  const page = 'Mr. Smith arrived late. The rain had not stopped all day.';

  it('finds a sentence even when it was rewritten for speech', () => {
    const r = findChunkRangeInTextFuzzy(page, 'Mister Smith arrived late.', 0);
    expect(page.slice(r.start, r.end)).toBe('Mr. Smith arrived late.');
  });

  it('searches forward from the previous sentence', () => {
    const text = 'Stop. Go. Stop. Go.';
    const first = findChunkRangeInTextFuzzy(text, 'Stop.', 0);
    const second = findChunkRangeInTextFuzzy(text, 'Stop.', first.end);
    expect(second.start).toBe(10);
  });

  it('returns null when the text is not on the page', () => {
    expect(findChunkRangeInTextFuzzy(page, 'Completely different words here', 0)).toBeNull();
  });
});

describe('trimWordPunctuation', () => {
  it('strips surrounding punctuation but keeps inner characters', () => {
    expect(trimWordPunctuation('“slept.”')).toBe('slept');
    expect(trimWordPunctuation('forty-two,')).toBe('forty-two');
    expect(trimWordPunctuation('...')).toBe('');
  });
});
