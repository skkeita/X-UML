import { useLayoutEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { ParseError } from '../core/types';

interface Props {
  value: string;
  onChange: (value: string) => void;
  errors: ParseError[];
}

/*
 * Éditeur léger : <textarea> transparent superposé à un calque <pre> colorisé.
 * Choix MVP : 0 dépendance, latence nulle, accessibilité native (sélection, IME, undo).
 * Migration prévue vers CodeMirror 6 pour l'autocomplétion — l'interface (value/onChange) ne change pas.
 */

// Ordre des alternatives = priorité : commentaire, mot-clé, opérateur, visibilité, accolade, nom de type.
const TOKEN =
  /(\/\/.*$)|(\b(?:abstract|class|interface|enum)\b)|(\*--|(?<!\w)o--|--\|>|\.\.\|>|-->|\.\.>|--)|(^\s*[+\-#~])|([{}])|(\p{Lu}[\p{L}\p{N}_]*)/gu;

const CLASSES = [
  'text-slate-400 italic', // 1 commentaire
  'font-semibold text-violet-600 dark:text-violet-400', // 2 mot-clé
  'font-semibold text-amber-600 dark:text-amber-400', // 3 opérateur de relation
  'text-emerald-600 dark:text-emerald-400', // 4 visibilité
  'text-slate-400', // 5 accolade
  'text-sky-700 dark:text-sky-300', // 6 nom de classe / type
];

function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > last) out.push(line.slice(last, start));
    const group = m.findIndex((g, i) => i > 0 && g !== undefined) - 1;
    out.push(
      <span key={start} className={CLASSES[group]}>
        {m[0]}
      </span>,
    );
    last = start + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

const TEXT = 'font-mono text-[13px] leading-[20px] whitespace-pre';

export function CodeEditor({ value, onChange, errors }: Props) {
  const preRef = useRef<HTMLPreElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  /** Dernière valeur produite par la frappe : tout autre changement vient d'un Ctrl+Z ou du canevas. */
  const typed = useRef(value);

  // Changement externe (annuler / rétablir) : React replacerait le curseur en fin de texte.
  // On le remet à l'endroit modifié, pour que l'utilisateur voie ce qui a été annulé.
  useLayoutEffect(() => {
    const prev = typed.current;
    if (value === prev) return;
    typed.current = value;
    const ta = taRef.current;
    if (!ta || document.activeElement !== ta) return;
    let start = 0;
    while (start < prev.length && start < value.length && prev[start] === value[start]) start++;
    let endPrev = prev.length;
    let endNew = value.length;
    while (endPrev > start && endNew > start && prev[endPrev - 1] === value[endNew - 1]) {
      endPrev--;
      endNew--;
    }
    ta.setSelectionRange(endNew, endNew);
  }, [value]);

  const emit = (v: string) => {
    typed.current = v;
    onChange(v);
  };
  const errorLines = useMemo(() => new Set(errors.map((e) => e.line)), [errors]);
  const lines = useMemo(() => value.split('\n'), [value]);

  const syncScroll = (el: HTMLTextAreaElement) => {
    if (!preRef.current) return;
    preRef.current.scrollTop = el.scrollTop;
    preRef.current.scrollLeft = el.scrollLeft;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab insère deux espaces au lieu de quitter l'éditeur (execCommand conserve l'historique Ctrl+Z).
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      if (!document.execCommand('insertText', false, '  ')) {
        const { selectionStart: s, selectionEnd: end } = ta;
        emit(value.slice(0, s) + '  ' + value.slice(end));
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = s + 2;
        });
      }
    }
  };

  return (
    <div className="relative h-full overflow-hidden bg-white dark:bg-slate-950">
      <pre
        ref={preRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 m-0 overflow-hidden p-4 text-slate-800 dark:text-slate-200 ${TEXT}`}
      >
        {lines.map((line, i) => (
          <div key={i} className={errorLines.has(i + 1) ? 'bg-red-500/10' : undefined}>
            <span className={`inline-block w-10 select-none pr-3 text-right ${errorLines.has(i + 1) ? 'text-red-500' : 'text-slate-300 dark:text-slate-600'}`}>
              {i + 1}
            </span>
            {highlight(line)}
            {'​'}
          </div>
        ))}
      </pre>

      <textarea
        value={value}
        ref={taRef}
        onChange={(e) => emit(e.target.value)}
        onScroll={(e) => syncScroll(e.currentTarget)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        aria-label="Éditeur de script UML"
        placeholder="class Animal { + nom: string }"
        className={`absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent py-4 pl-14 pr-4 text-transparent caret-indigo-600 outline-none selection:bg-indigo-500/25 dark:caret-indigo-300 ${TEXT}`}
      />
    </div>
  );
}
