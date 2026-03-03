/**
 * Toast notification component — fixed bottom-center stack.
 * Variants: info (primary), error (red), success (green).
 * Matches designs/toasts/code.html: backdrop-blur, border-white/20, Material Symbols.
 */
import { useEffect } from 'react';

const ICON_MAP = {
  info: 'sync_saved_locally',
  error: 'error',
  success: 'bookmark_added',
};

const BG_MAP = {
  info: 'bg-primary/90 dark:bg-primary/95',
  error: 'bg-red-500/90 dark:bg-red-500/95',
  success: 'bg-green-500/90 dark:bg-green-500/95',
};

const AUTO_DISMISS_MS = 5000;

export default function Toast({ toasts, onDismiss }) {
  return (
    <div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-50 max-w-md w-full px-4"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const { id, type = 'info', title, message } = toast;
  const icon = ICON_MAP[type] ?? ICON_MAP.info;
  const bgClass = BG_MAP[type] ?? BG_MAP.info;

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      className={`flex items-center w-full ${bgClass} backdrop-blur-md text-white rounded-xl p-4 shadow-2xl border border-white/20 toast-slide-in`}
      role="alert"
    >
      <div className="mr-3 flex-shrink-0">
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {message && <p className="text-xs opacity-90 mt-0.5">{message}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="ml-4 p-1 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
        aria-label="Dismiss notification"
      >
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  );
}
