import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSettings, saveSettings } from '../lib/state';
import { getBrowserVoicesSorted, getPreferredNaturalVoice } from '../lib/tts';

const THEMES = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'sepia', label: 'Sepia' },
];

const AUTO_SAVE_OPTIONS = [
  { value: 0, label: 'On sentence / page change only' },
  { value: 15, label: 'Every 15 seconds' },
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every 60 seconds' },
];

export default function Settings() {
  const navigate = useNavigate();
  const [rate, setRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [theme, setTheme] = useState('dark');
  const [edgeVoice, setEdgeVoice] = useState('');
  const [voices, setVoices] = useState(() => getBrowserVoicesSorted());
  const [autoSaveIntervalSeconds, setAutoSaveIntervalSeconds] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const refresh = () => setVoices(getBrowserVoicesSorted());
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', refresh);
      refresh();
    }
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', refresh);
  }, []);

  useEffect(() => {
    const s = loadSettings();
    setRate(s.rate ?? 1.0);
    setVolume(s.volume ?? 1.0);
    setTheme(s.theme ?? 'dark');
    const list = getBrowserVoicesSorted();
    const preferred = getPreferredNaturalVoice(list);
    const defaultURI = preferred?.voiceURI ?? list[0]?.voiceURI ?? '';
    const storedVoice = s.edgeVoice ?? '';
    setEdgeVoice(list.some((v) => v.voiceURI === storedVoice) ? storedVoice : defaultURI);
    setAutoSaveIntervalSeconds(s.autoSaveIntervalSeconds ?? 0);
  }, []);

  const handleSave = () => {
    saveSettings({
      ...loadSettings(),
      rate,
      volume,
      theme,
      edgeVoice,
      autoSaveIntervalSeconds,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background-dark pb-16">
      <div className="sticky top-0 z-10 bg-background-dark border-b border-border-dark backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/library')}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-surface transition-colors"
            aria-label="Back to library"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold text-white flex-1">Settings</h1>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-colors"
          >
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Playback defaults */}
        <section className="bg-card-dark border border-border-dark rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined">speed</span>
            Playback defaults
          </h2>
          <p className="text-slate-400 text-sm mb-6">Used for new books when no per-book speed is set.</p>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Default speed</label>
              <select
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                className="w-full bg-surface border border-border-dark rounded-lg px-4 py-2.5 text-white"
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                  <option key={r} value={r}>{r}×</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Default voice</label>
              <select
                value={edgeVoice}
                onChange={(e) => setEdgeVoice(e.target.value)}
                className="w-full bg-surface border border-border-dark rounded-lg px-4 py-2.5 text-white"
              >
                {voices.length === 0 && <option value="">Default</option>}
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name}{v.lang ? ` (${v.lang})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Volume</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-slate-500 mt-1">{Math.round(volume * 100)}%</p>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section className="bg-card-dark border border-border-dark rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined">palette</span>
            Appearance
          </h2>
          <p className="text-slate-400 text-sm mb-6">Default reader theme for new sessions.</p>

          <div className="flex gap-2 flex-wrap">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={`px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  theme === t.id ? 'bg-primary text-white' : 'bg-surface text-slate-300 hover:text-white border border-border-dark'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        {/* Auto-save */}
        <section className="bg-card-dark border border-border-dark rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined">save</span>
            Auto-save position
          </h2>
          <p className="text-slate-400 text-sm mb-6">How often to save your reading position (in addition to when you change page or sentence).</p>

          <select
            value={autoSaveIntervalSeconds}
            onChange={(e) => setAutoSaveIntervalSeconds(parseInt(e.target.value, 10))}
            className="w-full bg-surface border border-border-dark rounded-lg px-4 py-2.5 text-white"
          >
            {AUTO_SAVE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </section>

        {saved && (
          <p className="text-center text-secondary-green text-sm font-medium">Settings saved.</p>
        )}
      </div>
    </div>
  );
}
