import { useEffect, useState } from 'react';
import { getWebSpeechVoices, naturalVoices, onVoicesChanged } from './webSpeechEngine';

/**
 * The voices worth offering: natural/enhanced ones when the device has any, otherwise
 * every usable voice so reading still works. Updates when the browser's list changes.
 */
export function useDeviceVoices() {
  const [all, setAll] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    getWebSpeechVoices().then((v) => { if (live) { setAll(v); setReady(true); } });
    const off = onVoicesChanged((v) => { if (live && v.length) setAll(v); });
    return () => { live = false; off(); };
  }, []);

  const natural = naturalVoices(all);
  return { voices: natural.length ? natural : all, hasNatural: natural.length > 0, ready };
}

/** "Microsoft Ava Online (Natural) - English (United States)" → "Ava · English (United States)" */
export function voiceDisplayName(v) {
  const m = v.name.match(/^Microsoft\s+(.+?)\s+Online \(Natural\)\s*-\s*(.+)$/);
  if (m) return `${m[1]} · ${m[2]}`;
  return `${v.name.replace(/^Microsoft\s+/, '')} (${v.lang})`;
}
