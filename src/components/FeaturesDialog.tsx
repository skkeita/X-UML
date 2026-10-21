import { useEffect, useMemo, useRef, useState } from 'react';
import { FEATURE_SECTIONS, SHORTCUTS, searchFeatures, type Feature } from '../core/features';
import { CloseIcon } from './Icons';

/** Combinaison de touches affichée comme sur un clavier (« Ctrl » « Z »). */
function Keys({ combo }: { combo: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {combo.split(' · ').map((alt, i) => (
        <span key={alt} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[11px] text-slate-400">ou</span>}
          {alt.split('+').map((k, j) => (
            <span key={`${k}-${j}`} className="inline-flex items-center gap-1">
              {j > 0 && <span className="text-[10px] text-slate-400">+</span>}
              <kbd className="rounded border border-slate-300 border-b-2 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                {k}
              </kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function FeatureCard({ f }: { f: Feature }) {
  return (
    <li className="rounded-lg border border-slate-200 p-3 dark:border-slate-800" data-feature={f.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{f.title}</h4>
        {f.keys && (
          <span className="flex flex-wrap gap-2">
            {f.keys.map((k) => (
              <Keys key={k} combo={k} />
            ))}
          </span>
        )}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{f.text}</p>
      {f.how && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-600 dark:text-slate-300">Comment : </span>
          {f.how}
        </p>
      )}
      {f.code && (
        <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 px-3 py-2 font-mono text-[12px] leading-[18px] text-slate-700 dark:bg-slate-900 dark:text-slate-200">{f.code}</pre>
      )}
    </li>
  );
}

/**
 * Toutes les fonctionnalités de l'application, classées et cherchables.
 * UX : recherche immédiate (insensible aux accents), sommaire cliquable, raccourcis en touches de clavier.
 */
export function FeaturesDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const sections = useMemo(() => searchFeatures(query), [query]);
  const showShortcuts = !query.trim() || /racc|touche|clavier|ctrl/i.test(query);
  const body = useRef<HTMLDivElement>(null);
  const previous = useRef<Element | null>(null);

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
      // Le focus revient là où il était (le bouton « Fonctionnalités »).
      if (previous.current instanceof HTMLElement) previous.current.focus();
    };
  }, [onClose]);

  const count = sections.reduce((n, s) => n + s.items.length, 0);
  const total = FEATURE_SECTIONS.reduce((n, s) => n + s.items.length, 0);
  const goTo = (id: string) => body.current?.querySelector(`#feat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fonctionnalités de X-UML"
        className="flex h-full max-h-[860px] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Fonctionnalités</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Tout ce que permet X-UML, et comment y accéder.</p>
          </div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher : couleur, dupliquer, PDF…"
            aria-label="Rechercher une fonctionnalité"
            className="ml-auto h-9 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer (Échap)"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Sommaire */}
          <nav aria-label="Sommaire" className="hidden w-56 shrink-0 overflow-y-auto border-r border-slate-200 p-2 md:block dark:border-slate-800">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(s.id)}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
              >
                <span className="truncate">{s.title}</span>
                <span className="ml-2 text-[11px] text-slate-400">{s.items.length}</span>
              </button>
            ))}
            {showShortcuts && (
              <button
                type="button"
                onClick={() => goTo('raccourcis')}
                className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
              >
                Raccourcis clavier
              </button>
            )}
          </nav>

          <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {query.trim() && (
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400" role="status">
                {count} résultat{count > 1 ? 's' : ''} sur {total}
              </p>
            )}
            {sections.length === 0 && !showShortcuts && (
              <p className="py-10 text-center text-sm text-slate-500">Aucune fonctionnalité ne correspond à « {query} ».</p>
            )}
            {sections.map((s) => (
              <section key={s.id} id={`feat-${s.id}`} className="mb-6 scroll-mt-2">
                <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">{s.title}</h3>
                {s.intro && !query.trim() && <p className="mb-2 text-[13px] text-slate-500 dark:text-slate-400">{s.intro}</p>}
                <ul className="grid gap-2 lg:grid-cols-2">
                  {s.items.map((f) => (
                    <FeatureCard key={f.title} f={f} />
                  ))}
                </ul>
              </section>
            ))}
            {showShortcuts && (
              <section id="feat-raccourcis" className="mb-4 scroll-mt-2">
                <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Raccourcis clavier</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {SHORTCUTS.map((sc) => (
                      <tr key={sc.keys} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                        <td className="w-56 py-1.5 pr-3 align-top">
                          <Keys combo={sc.keys} />
                        </td>
                        <td className="py-1.5 text-slate-600 dark:text-slate-300">{sc.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
