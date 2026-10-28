import { useEffect, useMemo, useRef, useState } from 'react';
import { LANGUAGES, generateCode, type Language } from '../core/codegen';
import type { Diagram } from '../core/types';
import { CloseIcon, CopyIcon, DownloadIcon } from './Icons';

/**
 * Code généré à partir du diagramme de classes : aperçu par fichier, copie, téléchargement
 * (Java : une archive .zip d'un fichier par classe ; TypeScript / Python : un module).
 */
export function CodeGenDialog({ diagram, boardName, onClose }: { diagram: Diagram; boardName: string; onClose: () => void }) {
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('x-uml:codegen-lang') as Language | null;
      return saved && LANGUAGES.some((l) => l.id === saved) ? saved : 'java';
    } catch {
      return 'java';
    }
  });
  const files = useMemo(() => generateCode(diagram, lang), [diagram, lang]);
  const [current, setCurrent] = useState(0);
  const [copied, setCopied] = useState(false);
  const previous = useRef<Element | null>(null);
  useEffect(() => setCurrent(0), [lang]);
  useEffect(() => {
    try {
      localStorage.setItem('x-uml:codegen-lang', lang);
    } catch {
      /* préférence non mémorisée */
    }
  }, [lang]);
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

  const file = files[current];
  const slug = boardName.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'modele';

  const copy = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers refusé : l'utilisateur peut sélectionner le texte */
    }
  };
  const download = async () => {
    const save = (blob: Blob, name: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    if (files.length > 1) {
      const { zipSync, strToU8 } = await import('fflate');
      const zip = zipSync(Object.fromEntries(files.map((f) => [f.name, strToU8(f.content)])));
      save(new Blob([zip], { type: 'application/zip' }), `${slug}-${lang}.zip`);
    } else if (file) save(new Blob([file.content], { type: 'text/plain;charset=utf-8' }), `${slug === 'modele' ? '' : `${slug}-`}${file.name}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Générer le code" className="flex h-full max-h-[780px] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Générer le code</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Squelettes des classes du tableau « {boardName} » : attributs, signatures et héritage. Les corps des opérations sont à écrire.</p>
          </div>
          <div role="tablist" aria-label="Langage" className="ml-auto flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={lang === l.id}
                onClick={() => setLang(l.id)}
                className={`rounded-md px-3 py-1 text-[13px] font-medium ${lang === l.id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer (Échap)" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <CloseIcon size={16} />
          </button>
        </header>

        {files.length === 0 ? (
          <p className="flex flex-1 items-center justify-center px-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Ce tableau ne contient aucune classe. La génération de code part d’un diagramme de classes (classes, interfaces, énumérations).
          </p>
        ) : (
          <div className="flex min-h-0 flex-1">
            {files.length > 1 && (
              <nav aria-label="Fichiers" className="w-52 shrink-0 overflow-y-auto border-r border-slate-200 p-2 dark:border-slate-800">
                {files.map((f, i) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-current={i === current}
                    className={`block w-full truncate rounded-md px-2.5 py-1.5 text-left font-mono text-[12.5px] ${i === current ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'}`}
                  >
                    {f.name}
                  </button>
                ))}
              </nav>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
                <span className="truncate font-mono text-[12.5px] text-slate-500 dark:text-slate-400">{file?.name}</span>
                <button type="button" onClick={copy} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                  <CopyIcon /> {copied ? 'Copié' : 'Copier ce fichier'}
                </button>
                <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500">
                  <DownloadIcon /> {files.length > 1 ? `Télécharger les ${files.length} fichiers (.zip)` : 'Télécharger'}
                </button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto bg-slate-50 px-4 py-3 font-mono text-[12.5px] leading-[19px] text-slate-800 dark:bg-slate-900 dark:text-slate-100" data-generated-code="">
                {file?.content}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
