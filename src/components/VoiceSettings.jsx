import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Play, Square } from 'lucide-react';
import { ttsManager } from '../lib/ttsManager';
import { EDGE_TTS_VOICES } from '../lib/edgeTtsVoices';
import { ENGINE_EDGE, ENGINE_INFO, ENGINE_WEB_SPEECH, normalizeEngineOrder } from '../lib/voices/engines';
import { getWebSpeechVoices, isWebSpeechSupported } from '../lib/voices/webSpeechEngine';

const PREVIEW_TEXT = 'Hi, this is how this voice sounds when reading your books aloud.';

function StatusBadge({ tone, children }) {
  return <span className={`voice-engine-badge voice-engine-badge--${tone}`}>{children}</span>;
}

/** Voice settings: engine order and a voice per engine with preview. */
export default function VoiceSettings({ settings, update }) {
  const order = normalizeEngineOrder(settings.engineOrder);
  const [previewing, setPreviewing] = useState(null); // engine id being previewed
  const [previewError, setPreviewError] = useState('');
  const [webVoices, setWebVoices] = useState([]);

  useEffect(() => {
    getWebSpeechVoices().then(setWebVoices).catch(() => {});
    return () => { ttsManager.stop(); };
  }, []);

  useEffect(() => {
    ttsManager.applySettings(settings);
  }, [settings]);

  const move = (index, delta) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    update('engineOrder', next);
  };

  const preview = async (engine) => {
    if (previewing) {
      ttsManager.stop();
      setPreviewing(null);
      if (previewing === engine) return;
    }
    setPreviewError('');
    setPreviewing(engine);
    try {
      ttsManager.applySettings(settings);
      await ttsManager.speak(PREVIEW_TEXT, engine);
    } catch (err) {
      setPreviewError(err?.message || 'This voice could not be previewed.');
    } finally {
      setPreviewing((p) => (p === engine ? null : p));
    }
  };

  const engineStatus = (engine) => {
    if (engine === ENGINE_EDGE) return <StatusBadge tone="ok">Ready · online</StatusBadge>;
    if (!isWebSpeechSupported() || webVoices.length === 0) {
      return <StatusBadge tone="off">Not available on this device</StatusBadge>;
    }
    return <StatusBadge tone="ok">Ready</StatusBadge>;
  };

  const previewButton = (engine, disabled = false) => (
    <button
      type="button"
      className="dashboard-settings-preview-btn"
      onClick={() => preview(engine)}
      disabled={disabled}
      aria-label={`${previewing === engine ? 'Stop preview of' : 'Preview'} ${ENGINE_INFO[engine].label}`}
    >
      {previewing === engine ? <Square size={14} /> : <Play size={14} />}
      <span>{previewing === engine ? 'Stop' : 'Preview'}</span>
    </button>
  );

  const voicePicker = (engine) => {
    if (engine === ENGINE_EDGE) {
      return (
        <select
          aria-label="Online voice"
          value={settings.edgeTtsVoice || 'en-US-AvaMultilingualNeural'}
          onChange={(e) => update('edgeTtsVoice', e.target.value)}
          className="dashboard-settings-select"
        >
          {EDGE_TTS_VOICES.map((v) => (
            <option key={v.id} value={v.id}>{v.name} ({v.grade})</option>
          ))}
        </select>
      );
    }
    return (
      <select
        aria-label="Device voice"
        value={settings.webSpeechVoice || ''}
        onChange={(e) => update('webSpeechVoice', e.target.value)}
        className="dashboard-settings-select"
        disabled={webVoices.length === 0}
      >
        <option value="">Device default</option>
        {webVoices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
        ))}
      </select>
    );
  };

  return (
    <div className="dashboard-settings-card voice-settings">
      <h3>Voices</h3>
      <p className="dashboard-settings-hint">
        Audire reads with your first choice. If it stops responding, the same sentence carries on with the next
        voice in this list, so nothing is skipped.
      </p>

      <ol className="voice-engine-list">
        {order.map((engine, i) => (
          <li key={engine} className="voice-engine">
            <div className="voice-engine-header">
              <span className="voice-engine-rank" aria-hidden="true">{i + 1}</span>
              <div className="voice-engine-title">
                <strong>{ENGINE_INFO[engine].label}</strong>
                <span className="voice-engine-role">{i === 0 ? 'First choice' : `Backup ${i}`}</span>
              </div>
              {engineStatus(engine)}
              <div className="voice-engine-order">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${ENGINE_INFO[engine].label} up`}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${ENGINE_INFO[engine].label} down`}>
                  <ArrowDown size={14} />
                </button>
              </div>
            </div>
            <p className="dashboard-settings-hint">{ENGINE_INFO[engine].description}</p>
            <div className="voice-engine-controls">
              {voicePicker(engine)}
              {previewButton(engine, engine === ENGINE_WEB_SPEECH && webVoices.length === 0)}
            </div>
          </li>
        ))}
      </ol>
      {previewError && <p className="voice-engine-error" role="alert">{previewError}</p>}
    </div>
  );
}
