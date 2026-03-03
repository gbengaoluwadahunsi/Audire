import { createPortal } from "react-dom";

export default function ConfirmDeleteModal({ isOpen, book, onConfirm, onCancel }) {
  if (!isOpen) return null;

  const title = book?.title || book?.name || "Untitled";
  const author = book?.author || "Unknown author";
  const coverUrl = book?.coverUrl ?? null;
  const fallbackLetter = (title || "?").charAt(0).toUpperCase();

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onCancel?.();
  };

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background-dark/80 backdrop-blur-sm p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div
        className="w-full max-w-md bg-[#1a2130] border border-slate-800 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="size-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-3xl">delete_forever</span>
            </div>
            <h3 id="confirm-delete-title" className="text-xl font-bold text-white leading-tight">
              Remove &quot;{title}&quot;?
            </h3>
            <p className="text-slate-400 text-base leading-relaxed">
              This will remove the book from your library and delete all data. This action cannot be undone.
            </p>
          </div>
          <div className="mt-6 p-3 bg-background-dark/50 rounded-lg flex items-center gap-4 border border-slate-800">
            {coverUrl ? (
              <div
                className="size-12 rounded-md bg-cover bg-center shrink-0"
                style={{ backgroundImage: `url(${coverUrl})` }}
                role="img"
                aria-label={`Cover of ${title}`}
              />
            ) : (
              <div className="size-12 rounded-md bg-slate-700 flex items-center justify-center shrink-0 text-slate-300 font-bold text-lg">
                {fallbackLetter}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-white truncate">{title}</span>
              <span className="text-xs text-slate-500">{author}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-lg border border-primary text-primary font-semibold text-sm hover:bg-primary/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm shadow-lg shadow-red-900/20"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
