import { describe, expect, it } from 'vitest';
import { naturalVoices, resolveWebSpeechVoice, splitForSpeech, voiceQuality } from './webSpeechEngine';

const v = (name, lang = 'en-US', extra = {}) => ({ name, lang, voiceURI: name, localService: true, ...extra });

const AVA = v('Microsoft Ava Online (Natural) - English (United States)', 'en-US', { localService: false });
const ANDREW = v('Microsoft Andrew Online (Natural) - English (United States)', 'en-US', { localService: false });
const DAVID = v('Microsoft David - English (United States)');
const ZIRA = v('Microsoft Zira - English (United States)');
const GOOGLE = v('Google US English', 'en-US', { localService: false });
const SAMANTHA = v('Samantha');
const AVA_PREMIUM = v('Ava (Premium)');

describe('voiceQuality', () => {
  it('ranks natural and premium voices above enhanced/cloud above robotic ones', () => {
    expect(voiceQuality(AVA)).toBe(3);
    expect(voiceQuality(AVA_PREMIUM)).toBe(3);
    expect(voiceQuality(v('Zoe (Enhanced)'))).toBe(2);
    expect(voiceQuality(GOOGLE)).toBe(2);
    expect(voiceQuality(DAVID)).toBe(1);
    expect(voiceQuality(SAMANTHA)).toBe(1);
  });

  it('naturalVoices leaves out the robotic ones', () => {
    expect(naturalVoices([DAVID, AVA, ZIRA, GOOGLE])).toEqual([AVA, GOOGLE]);
  });
});

describe('resolveWebSpeechVoice', () => {
  it('defaults to Ava Online (Natural) when it exists', () => {
    expect(resolveWebSpeechVoice([ANDREW, DAVID, AVA], '')).toBe(AVA);
  });

  it('keeps a saved voice that still exists', () => {
    expect(resolveWebSpeechVoice([AVA, ANDREW], ANDREW.voiceURI)).toBe(ANDREW);
  });

  it('ignores a saved voice that is gone', () => {
    expect(resolveWebSpeechVoice([AVA, ANDREW], 'Microsoft David')).toBe(AVA);
  });

  it('returns null with no voices', () => {
    expect(resolveWebSpeechVoice([], '')).toBeNull();
  });
});

describe('splitForSpeech', () => {
  it('leaves a normal sentence whole', () => {
    expect(splitForSpeech('She opened the letter slowly.')).toEqual([{ text: 'She opened the letter slowly.', offset: 0 }]);
  });

  it('splits a long sentence at a comma, keeping offsets into the original', () => {
    const text = 'The old house stood at the end of the lane, its windows dark and its garden overgrown with weeds that nobody had cut in years.';
    const parts = splitForSpeech(text, 60);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].text.endsWith(',')).toBe(true);
    for (const p of parts) {
      expect(p.text.length).toBeLessThanOrEqual(60);
      expect(text.slice(p.offset, p.offset + p.text.length)).toBe(p.text);
    }
    expect(parts.map((p) => p.text).join(' ')).toBe(text);
  });

  it('falls back to a word break when there is no punctuation', () => {
    const text = 'word '.repeat(30).trim();
    const parts = splitForSpeech(text, 40);
    expect(parts.every((p) => p.text.length <= 40 && !p.text.startsWith(' ') && !p.text.endsWith(' '))).toBe(true);
    expect(parts.map((p) => p.text).join(' ')).toBe(text);
  });
});
