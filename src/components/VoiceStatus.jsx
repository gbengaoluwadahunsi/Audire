import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ttsManager } from '../lib/ttsManager';

/** Shows which engine and voice are reading, and offers a retry while on a backup. */
export default function VoiceStatus({ active = true, compact = false }) {
  const [status, setStatus] = useState(ttsManager.status);

  useEffect(() => {
    const onStatus = (e) => setStatus({ ...ttsManager.status, ...(e.detail || {}) });
    window.addEventListener('audire-tts-status', onStatus);
    return () => window.removeEventListener('audire-tts-status', onStatus);
  }, []);

  if (!active || !status?.voice) return null;

  return (
    <div
      className={`voice-status${status.isBackup ? ' voice-status--backup' : ''}${compact ? ' voice-status--compact' : ''}`}
      aria-live="polite"
      title={status.isBackup && status.reason ? `${status.reason}. Using a backup voice.` : 'Voice reading now'}
    >
      <span className="voice-status-dot" aria-hidden="true" />
      <span className="voice-status-text">
        {status.isBackup && <span className="voice-status-tag">Backup</span>}
        {status.engineLabel} · {status.voice}
      </span>
      {status.isBackup && (
        <button
          type="button"
          className="voice-status-retry"
          onClick={() => ttsManager.retryPreferred()}
          aria-label="Retry first-choice voice from the next sentence"
          title="Retry first-choice voice"
        >
          <RotateCcw size={12} />
          {!compact && <span>Retry</span>}
        </button>
      )}
    </div>
  );
}
