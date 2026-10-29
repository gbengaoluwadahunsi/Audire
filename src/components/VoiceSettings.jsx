import React, { useEffect, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { ttsManager } from '../lib/ttsManager';
import { KOKORO_VOICES, KOKORO_DEFAULT_VOICE } from '../lib/kokoroVoices';
import { isKokoroReady, isKokoroLoading, getKokoroError } from '../lib/voices/kokoroEngine';

const PREVIEW_TEXT = 'Hi, this is how this voice sounds when reading your books aloud.';

function statusFromGlobals() {
  return {
    ready: isKokoroReady(),
    loading: isKokoroLoading(),
    error: getKokoroError(),
    loaded: 0,
    total: 0,
  };
}

export default function VoiceSettings({ settings, update }) {
  const [status, setStatus] = useState(statusFromGlobals);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    const onProgress = (e) =>
      setStatus((s) => ({ ...s, loading: true, ready: false, loaded: e.detail.loaded || 0, total: e.detail.total || 0 }));
    const onReady = () => setStatus({ ready: true, loading: false, error: null, loaded: 0, total: 0 });
    const onError = (e) => setStatus({ ready: false, loading: false, error: e.detail, loaded: 0, total: 0 });
    window.addEventListener('audire-kokoro-progress', onProgress);
    window.addEventListener('audire-kokoro-ready', onReady);
    window.addEventListener('audire-kokoro-error', onError);
    return () => {
      window.removeEventListener('audire-kokoro-progress', onProgress);
      window.removeEventListener('audire-kokoro-ready', onReady);
      window.removeEventListener('audire-kokoro-error', onError);
      ttsManager.stop();
    };
  }, []);

  useEffect(() => {
    ttsManager.applySettings(settings);
  }, [settings]);

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

  const badge = () => {
    if (status.error) return <span className="voice-engine-badge voice-engine-badge--off">Failed to load</span>;
    if (status.loading) {
      const pct = status.total > 0 ? Math.round((status.loaded / status.total) * 100) : null;
      return (
        <span className="voice-engine-badge voice-engine-badge--loading">
          Downloading{pct !== null ? ` ${pct}%` : '…'}
        </span>
      );
    }
    if (status.ready) return <span className="voice-engine-badge voice-engine-badge--ok">Ready</span>;
    return <span className="voice-engine-badge voice-engine-badge--loading">Loading…</span>;
  };

  return (
    <div className="dashboard-settings-card voice-settings">
      <h3>Voice</h3>
      <p className="dashboard-settings-hint">
        Kokoro runs entirely in your browser — no server needed, works offline.
        The model downloads once (~82 MB) and is then cached on your device.
      </p>

      <div className="voice-engine">
        <div className="voice-engine-header">
          <div className="voice-engine-title">
            <strong>Kokoro neural voice</strong>
          </div>
          {badge()}
        </div>

        {status.loading && (
          <div className="kokoro-progress">
            <div
              className={status.total > 0 ? 'kokoro-progress-bar' : 'kokoro-progress-bar kokoro-progress-bar--indeterminate'}
              style={status.total > 0 ? { width: `${Math.round((status.loaded / status.total) * 100)}%` } : undefined}
            />
          </div>
        )}

        <p className="dashboard-settings-hint">
          A natural neural voice that runs directly in your browser. Works offline once downloaded.
        </p>

        <div className="voice-engine-controls">
          <select
            aria-label="Voice"
            value={settings.kokoroVoice || KOKORO_DEFAULT_VOICE}
            onChange={(e) => update('kokoroVoice', e.target.value)}
            className="dashboard-settings-select"
          >
            {KOKORO_VOICES.map((v) => (
              <option key={v.id} value={v.id}>{v.name} ({v.grade})</option>
            ))}
          </select>
          <button
            type="button"
            className="dashboard-settings-preview-btn"
            onClick={preview}
            disabled={!status.ready}
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
