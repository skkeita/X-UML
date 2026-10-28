import { useEffect, useRef, useState } from 'react';
import type { Issue } from '../core/validate';

/**
 * Badge « Vérification » : nombre d'avertissements du modèle, liste au clic.
 * Discret quand tout va bien (une coche), visible quand il y a quelque chose à corriger.
 */
export function ModelCheck({ issues, onPick }: { issues: Issue[]; onPick: (issue: Issue) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const warnings = issues.filter((i) => i.level === 'warning').length;
  const infos = issues.length - warnings;
  const label = issues.length === 0 ? 'Modèle vérifié' : `${issues.length} point${issues.length > 1 ? 's' : ''} à vérifier`;

  return (
    <div ref={root} className="relative" onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={issues.length === 0 ? 'Aucune erreur UML détectée' : 'Voir les points à vérifier dans le modèle'}
        className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium shadow-sm backdrop-blur ${
          warnings > 0
            ? 'border-amber-300 bg-amber-50/95 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/80 dark:text-amber-200'
            : 'border-slate-200 bg-white/90 text-slate-600 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300'
        }`}
        data-model-check={issues.length}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {issues.length === 0 ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M12 4l9 16H3zM12 10v4M12 17.5v.5" />}
        </svg>
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Vérification du modèle"
          className="absolute bottom-10 right-0 z-30 w-[380px] max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="px-2 pb-1.5 pt-1 text-[13px] font-semibold text-slate-900 dark:text-white">
            {issues.length === 0 ? 'Rien à signaler' : 'À vérifier avant de rendre'}
            {issues.length > 0 && (
              <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                {warnings > 0 && `${warnings} probable${warnings > 1 ? 's' : ''} erreur${warnings > 1 ? 's' : ''}`}
                {warnings > 0 && infos > 0 && ', '}
                {infos > 0 && `${infos} remarque${infos > 1 ? 's' : ''}`}
              </span>
            )}
          </p>
          {issues.length === 0 ? (
            <p className="px-2 pb-2 text-[13px] text-slate-600 dark:text-slate-400">
              Pas d’héritage circulaire, pas d’élément isolé, pas de nom en double : le diagramme est cohérent.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {issues.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => onPick(i)}
                    title="Sélectionner les éléments concernés"
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] leading-snug text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.level === 'warning' ? 'bg-amber-500' : 'bg-slate-400'}`}
                      aria-label={i.level === 'warning' ? 'Probable erreur' : 'Remarque'}
                    />
                    {i.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
