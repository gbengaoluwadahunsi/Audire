import React, { useEffect, useRef, useState } from 'react';
import { Download, Share, Plus, X } from 'lucide-react';

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

/**
 * Renders an "Install app" affordance.
 * - Chrome/Android/Edge: uses the captured `beforeinstallprompt` event.
 * - iOS Safari: shows Add-to-Home-Screen instructions (no native prompt exists).
 * Renders nothing if the app is already installed or not installable.
 */
export default function InstallButton({ className = '', label = 'Install app' }) {
  const deferredPrompt = useRef(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setCanPrompt(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setCanPrompt(false);
      deferredPrompt.current = null;
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const iosEligible = isIos() && !isStandalone();
  if (!canPrompt && !iosEligible) return null;

  const handleClick = async () => {
    if (canPrompt && deferredPrompt.current) {
      deferredPrompt.current.prompt();
      try {
        await deferredPrompt.current.userChoice;
      } finally {
        deferredPrompt.current = null;
        setCanPrompt(false);
      }
      return;
    }
    if (iosEligible) setShowIosHelp((v) => !v);
  };

  return (
    <div className="install-button-wrap">
      <button
        type="button"
        className={`install-button ${className}`}
        onClick={handleClick}
        title="Install Audire on your device"
      >
        <Download size={18} />
        <span>{label}</span>
      </button>

      {showIosHelp && (
        <div className="install-ios-help" role="dialog" aria-label="How to install on iPhone or iPad">
          <button
            type="button"
            className="install-ios-help-close"
            onClick={() => setShowIosHelp(false)}
            aria-label="Close"
          >
            <X size={16} />
          </button>
          <p className="install-ios-help-title">Install on iPhone / iPad</p>
          <ol>
            <li>
              Tap the <Share size={14} /> <strong>Share</strong> button in Safari.
            </li>
            <li>
              Choose <Plus size={14} /> <strong>Add to Home Screen</strong>.
            </li>
            <li>Tap <strong>Add</strong> — Audire appears on your home screen.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
