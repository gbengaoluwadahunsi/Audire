import React, { useEffect, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { ttsManager } from '../lib/ttsManager';
import { useDeviceVoices, voiceDisplayName } from '../lib/voices/useDeviceVoices';
import { isWebSpeechSupported, resolveWebSpeechVoice } from '../lib/voices/webSpeechEngine';

const PREVIEW_TEXT = 'Hi, this is how this voice sounds when reading your books aloud.';

/** Where this device's natural voices come from, for when none are installed. */
function naturalVoiceHint() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) return 'For a natural voice, open Settings → Accessibility → Spoken Content → Voices → English, and download a voice marked Enhanced or Premium. Then reopen Audire.';
  if (/Android/.test(ua)) return 'For a natural voice, install or update "Speech Recognition & Synthesis by Google" from the Play Store, then reopen Audire.';
  if (/Macintosh/.test(ua)) return 'For a natural voice, open System Settings → Accessibility → Spoken Content → System Voice → Manage Voices, and download an Enhanced or Premium voice.';
  if (/Edg\//.test(ua)) return 'Microsoft Edge\'s natural voices did not load. Update Edge (edge://settings/help), restart it, and reopen Audire.';
  return 'For the most natural voices, like Ava, open Audire in Microsoft Edge.';
}

export default function VoiceSettings({ settings, update }) {
  const { voices, hasNatural, ready } = useDeviceVoices();
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => () => ttsManager.stop(), []);

  useEffect(() => {
    ttsManager.applySettings(settings);
  }, [settings]);

  const selected = resolveWebSpeechVoice(voices, settings.webSpeechVoice);

  const preview = async () => {
    if (previewing) { ttsManager.stop(); setPreviewing(false); return; }
    setPreviewError('');
    setPreviewing(true);
    try {
      ttsManager.applySettings(settings);
      await ttsManager.speak(PREVIEW_TEXT);
    } catch (err) {
      setPreviewError(err?.message || 'Could not preview this voice.');
    } finally {
      setPreviewing(false);
    }
  };

  if (!isWebSpeechSupported()) {
    return (
      <div className="dashboard-settings-card voice-settings">
        <h3>Voice</h3>
        <p className="voice-engine-error">This browser cannot read aloud. Try Microsoft Edge, Chrome or Safari.</p>
      </div>
    );
  }

  const english = voices.filter((v) => v.lang?.startsWith('en'));
  const other = voices.filter((v) => !v.lang?.startsWith('en'));

  return (
    <div className="dashboard-settings-card voice-settings">
      <h3>Voice</h3>
      <p className="dashboard-settings-hint">
        Audire reads with the voices built into your device and browser, showing only the natural-sounding ones.
      </p>

      <div className="voice-engine">
        <div className="voice-engine-header">
          <div className="voice-engine-title">
            <strong>{selected ? voiceDisplayName(selected) : 'Device voice'}</strong>
          </div>
          {ready && (
            <span className={`voice-engine-badge voice-engine-badge--${hasNatural ? 'ok' : 'off'}`}>
              {hasNatural ? 'Natural' : 'Standard only'}
            </span>
          )}
        </div>

        {ready && !hasNatural && <p className="dashboard-settings-hint">{naturalVoiceHint()}</p>}

        <div className="voice-engine-controls">
          <select
            aria-label="Voice"
            value={selected?.voiceURI || ''}
            onChange={(e) => update('webSpeechVoice', e.target.value)}
            className="dashboard-settings-select"
            disabled={!voices.length}
          >
            {!voices.length && <option value="">Loading voices…</option>}
            {english.length > 0 && (
              <optgroup label="English">
                {english.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{voiceDisplayName(v)}</option>)}
              </optgroup>
            )}
            {other.length > 0 && (
              <optgroup label="Other languages">
                {other.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{voiceDisplayName(v)}</option>)}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            className="dashboard-settings-preview-btn"
            onClick={preview}
            disabled={!voices.length}
            aria-label={previewing ? 'Stop preview' : 'Preview voice'}
          >
            {previewing ? <Square size={14} /> : <Play size={14} />}
            <span>{previewing ? 'Stop' : 'Preview'}</span>
          </button>
        </div>
      </div>

      {previewError && <p className="voice-engine-error" role="alert">{previewError}</p>}
    </div>
  );
}
