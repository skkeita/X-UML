import { useEffect } from 'react';
import { CloseIcon } from './Icons';

export interface ToastData {
  id: number;
  message: string;
  tone: 'success' | 'error';
  action?: { label: string; onClick: () => void };
}

/** Notification discrète en bas de l'écran, qui disparaît seule (et propose « Annuler » si utile). */
export function Toast({ toast, onClose }: { toast: ToastData | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2.5 text-sm shadow-lg ${
        toast.tone === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
      }`}
    >
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onClose();
          }}
          className="font-semibold text-indigo-300 hover:underline dark:text-indigo-600"
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" onClick={onClose} aria-label="Fermer" className="opacity-60 hover:opacity-100">
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
