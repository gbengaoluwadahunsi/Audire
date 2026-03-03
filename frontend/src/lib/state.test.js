import { beforeEach, describe, expect, it } from 'vitest';
import {
  addToLibrary,
  getBookVoiceProfile,
  getReadingInsights,
  getVoiceFavorites,
  recordListening,
  setBookVoiceProfile,
  toggleVoiceFavorite,
} from './state';

describe('state analytics and voice profile', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('tracks listening insights', () => {
    recordListening('book.epub', 10, { seconds: 120, words: 300 });
    const insights = getReadingInsights();
    expect(insights.totalListenSeconds).toBe(120);
    expect(insights.totalWordsHeard).toBe(300);
    expect(insights.avgWpm).toBeGreaterThan(0);
  });

  it('toggles voice favorites', () => {
    expect(getVoiceFavorites()).toEqual([]);
    toggleVoiceFavorite('lessac');
    expect(getVoiceFavorites()).toContain('lessac');
    toggleVoiceFavorite('lessac');
    expect(getVoiceFavorites()).not.toContain('lessac');
  });

  it('stores per-book voice profile', () => {
    addToLibrary({ name: 'book.epub', size: 10, title: 'Book', totalPages: 10, currentPage: 1 });
    setBookVoiceProfile('book.epub', 10, { voice: 'lessac', rate: 1.25 });
    const profile = getBookVoiceProfile('book.epub', 10);
    expect(profile.voice).toBe('lessac');
    expect(profile.rate).toBe(1.25);
  });
});
