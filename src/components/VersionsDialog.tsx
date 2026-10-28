import { useEffect, useMemo, useRef, useState } from 'react';
import { parse } from '../core/parser';
import { computeBoxes, layoutNewClasses } from '../core/layout';
import type { SceneTheme } from '../core/theme';
import { buildSvgString } from '../lib/exportSvg';
import { REASON_LABEL, type Version } from '../lib/versions';
import { CloseIcon, HistoryIcon, TrashIcon } from './Icons';

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function dayLabel(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Aujourd’hui';
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  const s = dayFmt.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function elementCount(v: Version): number {
  return v.boards.reduce((n, b) => n + parse(b.source).diagram.classes.filter((c) => c.kind !== 'note').length, 0);
}

/**
 * Historique des versions : liste des instantanés locaux, aperçu, restauration (annulable par Ctrl+Z).
 */
export function VersionsDialog({
  versions,
  theme,
  onRestore,
  onDelete,
  onSaveNow,
  onClose,
}: {
  versions: Version[];
  theme: SceneTheme;
  onRestore: (v: Version) => void;
  onDelete: (id: string) => void;
  onSaveNow: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(versions[0]?.id ?? null);
  const [boardIdx, setBoardIdx] = useState(0);
  const previous = useRef<Element | null>(null);
  const version = versions.find((v) => v.id === selected) ?? versions[0];
  useEffect(() => setBoardIdx(0), [selected]);
  useEffect(() => {
    previous.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (previous.current instanceof HTMLElement) previous.current.focus();
    };
  }, [onClose]);

  const board = version?.boards[Math.min(boardIdx, (version?.boards.length ?? 1) - 1)];
  const preview = useMemo(() => {
    if (!board) return null;
    try {
      const d = parse(board.source).diagram;
      const svg = buildSvgString(d, computeBoxes(d, layoutNewClasses(d, board.positions)), theme, board.anchors);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      return null;
    }
  }, [board, theme]);

  const groups = useMemo(() => {
    const out: { day: string; items: Version[] }[] = [];
    for (const v of versions) {
      const day = dayLabel(v.at);
      if (out.at(-1)?.day === day) out.at(-1)!.items.push(v);
      else out.push({ day, items: [v] });
    }
    return out;
  }, [versions]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Historique des versions" className="flex h-full max-h-[720px] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <span className="text-slate-500"><HistoryIcon size={18} /></span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Historique des versions</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Instantanés pris automatiquement toutes les 10 minutes et avant chaque import. Ils restent dans ce navigateur.</p>
          </div>
          <button type="button" onClick={onSaveNow} className="ml-auto shrink-0 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
            Enregistrer une version maintenant
          </button>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer (Échap)" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <CloseIcon size={16} />
          </button>
        </header>

        {versions.length === 0 ? (
          <p className="flex flex-1 items-center justify-center px-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Aucune version pour l’instant. La première sera prise dans quelques minutes, ou tout de suite avec « Enregistrer une version maintenant ».
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <nav aria-label="Versions" className="max-h-48 shrink-0 overflow-y-auto border-b border-slate-200 p-2 sm:max-h-none sm:w-72 sm:border-b-0 sm:border-r dark:border-slate-800">
              {groups.map((g) => (
                <div key={g.day} className="mb-2">
                  <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">{g.day}</p>
                  {g.items.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelected(v.id)}
                      aria-current={v.id === version?.id}
                      data-version={v.id}
                      className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left ${v.id === version?.id ? 'bg-indigo-50 dark:bg-indigo-500/15' : 'hover:bg-slate-100 dark:hover:bg-slate-900'}`}
                    >
                      <span className={`font-mono text-[13px] tabular-nums ${v.id === version?.id ? 'text-indigo-800 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-100'}`}>{timeFmt.format(v.at)}</span>
                      <span className="truncate text-xs text-slate-500 dark:text-slate-400">{REASON_LABEL[v.reason]}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            {version && (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    {dayLabel(version.at)} à {timeFmt.format(version.at)} · {version.boards.length} tableau{version.boards.length > 1 ? 'x' : ''}, {elementCount(version)} élément{elementCount(version) > 1 ? 's' : ''}
                  </span>
                  <button type="button" onClick={() => onDelete(version.id)} title="Supprimer cette version" aria-label="Supprimer cette version" className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800">
                    <TrashIcon />
                  </button>
                  <button type="button" onClick={() => onRestore(version)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500" data-restore="">
                    Restaurer cette version
                  </button>
                </div>
                {version.boards.length > 1 && (
                  <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
                    {version.boards.map((b, i) => (
                      <button key={b.id + i} type="button" onClick={() => setBoardIdx(i)} className={`shrink-0 rounded-md px-2.5 py-1 text-xs ${i === boardIdx ? 'bg-slate-200 font-medium text-slate-900 dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4" style={{ background: theme.bg }}>
                  {preview ? <img src={preview} alt={`Aperçu de « ${board?.name} »`} className="max-h-full max-w-full object-contain" /> : <p className="text-sm text-slate-500">Tableau vide.</p>}
                </div>
                <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  Restaurer remplace le projet affiché ; l’état actuel est d’abord gardé dans l’historique, et Ctrl+Z annule.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
