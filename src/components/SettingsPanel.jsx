import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings } from '../lib/settings';
import { setCustomPronunciations, setSkipJunk } from '../lib/textSanitation';
import { ensureNotificationPermission } from '../lib/listeningGoal';
import { getCacheStats, clearCache } from '../lib/ttsCache';
import VoiceSettings from './VoiceSettings';

export default function SettingsPanel() {
  const [settings, setSettings] = useState(getSettings);
  const [numberDrafts, setNumberDrafts] = useState({});
  const [pronunciationText, setPronunciationText] = useState(
    () => JSON.stringify(getSettings().pronunciationDict || {}, null, 2)
  );
  const [cacheStats, setCacheStats] = useState(null);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    getCacheStats().then(setCacheStats).catch(() => {});
  }, []);

  const handleClearCache = async () => {
    setClearingCache(true);
    await clearCache();
    const stats = await getCacheStats().catch(() => ({ count: 0, bytes: 0 }));
    setCacheStats(stats);
    setClearingCache(false);
  };

  const toggleReminders = async (enabled) => {
    if (enabled) {
      const granted = await ensureNotificationPermission();
      update('remindersEnabled', granted);
      return;
    }
    update('remindersEnabled', false);
  };

  useEffect(() => {
    setSkipJunk(settings.skipJunk !== false);
    if (settings.pronunciationDict) {
      setCustomPronunciations(settings.pronunciationDict);
    }
  }, [settings.skipJunk, settings.pronunciationDict]);

  const persist = (next) => {
    setSettings(next);
    saveSettings(next);
  };

  const update = (key, value) => {
    persist({ ...settings, [key]: value });
  };

  const numberValue = (key, fallback) => {
    if (numberDrafts[key] !== undefined) return numberDrafts[key];
    const value = settings[key];
    return value !== undefined ? String(value) : String(fallback);
  };

  const handleNumberChange = (key, raw) => {
    setNumberDrafts((prev) => ({ ...prev, [key]: raw }));
  };

  const commitNumber = (key, fallback, parser = parseFloat) => {
    const raw = numberDrafts[key];
    setNumberDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (raw === undefined) return;

    const parsed = parser(raw);
    const value = Number.isFinite(parsed) ? parsed : fallback;
    update(key, value);
  };

  const commitPronunciation = () => {
    try {
      const dict = JSON.parse(pronunciationText);
      update('pronunciationDict', dict);
      setCustomPronunciations(dict);
    } catch {
      setPronunciationText(JSON.stringify(settings.pronunciationDict || {}, null, 2));
    }
  };


  return (
    <div className="dashboard-settings">
      <VoiceSettings settings={settings} update={update} />
      <div className="dashboard-settings-card">
        <h3>Skip junk while reading</h3>
        <p className="dashboard-settings-hint">
          Skip page numbers, running footers, and bare links so the voice doesn&apos;t read &quot;Page 47&quot; mid-sentence.
        </p>
        <label className="dashboard-settings-toggle">
          <input
            type="checkbox"
            checked={settings.skipJunk !== false}
            onChange={(e) => update('skipJunk', e.target.checked)}
          />
          <span>{settings.skipJunk !== false ? 'On' : 'Off'}</span>
        </label>
      </div>
      <div className="dashboard-settings-card">
        <h3>Daily listening goal</h3>
        <p className="dashboard-settings-hint">Set a target and build a daily habit. Progress shows on the Stats tab.</p>
        <div className="dashboard-settings-row">
          <label>Minutes per day</label>
          <input
            type="number"
            min="1"
            max="600"
            className="dashboard-settings-select"
            style={{ width: 100 }}
            value={numberValue('dailyGoalMinutes', 20)}
            onChange={(e) => handleNumberChange('dailyGoalMinutes', e.target.value)}
            onBlur={() => commitNumber('dailyGoalMinutes', 20, (v) => parseInt(v, 10))}
          />
        </div>
        <label className="dashboard-settings-toggle" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={!!settings.remindersEnabled}
            onChange={(e) => toggleReminders(e.target.checked)}
          />
          <span>Notify me when I reach my goal</span>
        </label>
      </div>
      <div className="dashboard-settings-card">
        <h3>Offline audio</h3>
        <p className="dashboard-settings-hint">
          Audio you listen to is cached for instant, offline replay. Use the download button in the reader to pre-save a section.
        </p>
        <p className="dashboard-settings-hint">
          {cacheStats
            ? `${cacheStats.count} segment${cacheStats.count === 1 ? '' : 's'} cached · ${(cacheStats.bytes / (1024 * 1024)).toFixed(1)} MB`
            : 'Calculating…'}
        </p>
        <button
          type="button"
          className="dashboard-settings-preview-btn"
          onClick={handleClearCache}
          disabled={clearingCache || !(cacheStats?.count)}
        >
          {clearingCache ? 'Clearing…' : 'Clear offline audio'}
        </button>
      </div>
      <div className="dashboard-settings-card">
        <h3>Highlight while reading <span style={{ fontWeight: 400, fontSize: '0.78rem', opacity: 0.7 }}>(experimental)</span></h3>
        <p className="dashboard-settings-hint">
          Highlight the sentence being read, and each word as it is spoken. Word highlighting works with the online voices and some device voices.
        </p>
        <label className="dashboard-settings-toggle">
          <input
            type="checkbox"
            checked={!!settings.karaokeHighlight}
            onChange={(e) => update('karaokeHighlight', e.target.checked)}
          />
          <span>{settings.karaokeHighlight ? 'On' : 'Off'}</span>
        </label>
      </div>
      <div className="dashboard-settings-card">
        <h3>Playback speed</h3>
        <div className="dashboard-settings-speed">
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={settings.speed}
            onChange={(e) => update('speed', parseFloat(e.target.value))}
          />
          <span>{settings.speed}x</span>
        </div>
      </div>
      <div className="dashboard-settings-card">
        <h3>Reader appearance</h3>
        <div className="dashboard-settings-row">
          <label>Layout</label>
          <select
            value={settings.layout || 'single'}
            onChange={(e) => update('layout', e.target.value)}
            className="dashboard-settings-select"
          >
            <option value="single">Single Page</option>
            <option value="dual">Dual Page (Spread)</option>
          </select>
        </div>
        <div className="dashboard-settings-row">
          <label>Font Family</label>
          <select
            value={settings.fontFamily || 'System'}
            onChange={(e) => update('fontFamily', e.target.value)}
            className="dashboard-settings-select"
          >
            <option value="System">System Default</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Times New Roman', serif">Times New Roman</option>
            <option value="'OpenDyslexic', sans-serif">OpenDyslexic</option>
            <option value="'Noto Sans', sans-serif">Noto Sans</option>
            <option value="'Noto Serif', serif">Noto Serif</option>
            <option value="'Courier New', monospace">Courier New</option>
          </select>
        </div>
        <div className="dashboard-settings-row">
          <label>Font size</label>
          <input
            type="number"
            min="12"
            max="24"
            value={numberValue('fontSize', settings.fontSize ?? 15)}
            onChange={(e) => handleNumberChange('fontSize', e.target.value)}
            onBlur={() => commitNumber('fontSize', 15, (v) => parseInt(v, 10))}
          />
        </div>
        <div className="dashboard-settings-row">
          <label>Line height</label>
          <input
            type="number"
            min="1.2"
            max="2.5"
            step="0.1"
            value={numberValue('lineHeight', settings.lineHeight ?? 1.6)}
            onChange={(e) => handleNumberChange('lineHeight', e.target.value)}
            onBlur={() => commitNumber('lineHeight', 1.6)}
          />
        </div>
        <div className="dashboard-settings-row">
          <label>Paragraph spacing (rem)</label>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={numberValue('paragraphSpacing', settings.paragraphSpacing ?? 0.5)}
            onChange={(e) => handleNumberChange('paragraphSpacing', e.target.value)}
            onBlur={() => commitNumber('paragraphSpacing', 0.5)}
          />
        </div>
        <div className="dashboard-settings-row">
          <label>Side Margins (rem)</label>
          <input
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={numberValue('margin', settings.margin ?? 1.0)}
            onChange={(e) => handleNumberChange('margin', e.target.value)}
            onBlur={() => commitNumber('margin', 1.0)}
          />
        </div>
      </div>
      <div className="dashboard-settings-card">
        <h3>Pronunciation Dictionary</h3>
        <p className="dashboard-settings-hint">Tell the voice how to say tricky words. Write them as JSON, for example <code>{'{ "Audire": "aw-deer-ray" }'}</code>.</p>
        <textarea
          className="dashboard-settings-textarea"
          value={pronunciationText}
          onChange={(e) => setPronunciationText(e.target.value)}
          onBlur={commitPronunciation}
          rows={6}
          placeholder='{&#10;  "Audire": "aw-deer-ray",&#10;  "TTS": "tee-tee-ess"&#10;}'
        />
      </div>
    </div>
  );
}
