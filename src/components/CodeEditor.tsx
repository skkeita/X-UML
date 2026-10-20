import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { complete, type Completion, type Suggestion } from '../core/complete';
import type { Diagram, ParseError } from '../core/types';
import { CompletionMenu } from './CompletionMenu';

interface Props {
  value: string;
  onChange: (value: string) => void;
  errors: ParseError[];
  /** Numéros de ligne à afficher (vue ciblée : numéros d'origine dans le script complet). */
  lineNumbers?: number[];
  /** Lignes (numéros affichés) à mettre en évidence, ex. la classe cliquée dans le diagramme. */
  highlightLines?: Set<number>;
  /** Ligne (numéro affiché) à faire défiler dans la zone visible quand elle change. */
  revealLine?: number | null;
  placeholder?: string;
  /** Diagramme courant : source des suggestions de Ctrl+Espace. */
  diagram?: Diagram;
}

/*
 * Éditeur léger : <textarea> transparent superposé à un calque <pre> colorisé.
 * Choix MVP : 0 dépendance, latence nulle, accessibilité native (sélection, IME, undo).
 * Migration prévue vers CodeMirror 6 pour l'autocomplétion — l'interface (value/onChange) ne change pas.
 */

// Ordre des alternatives = priorité : commentaire, mot-clé, opérateur, visibilité, accolade, nom de type.
const TOKEN =
  /(\/\/.*$)|(\b(?:abstract|class|interface|enum|extends|implements|actor|usecase|object|system|package|diagram|color|style|legend)\b)|(\*--|(?<!\w)o--|--\|>|\.\.\|>|-->|\.\.>|--)|(^\s*[+\-#~])|([{}])|(\p{Lu}[\p{L}\p{N}_]*)/gu;

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

const LINE_H = 20;
const PAD_TOP = 16;
const PAD_LEFT = 56; // pl-14
const MENU_W = 320;

export function CodeEditor({ value, onChange, errors, lineNumbers, highlightLines, revealLine, placeholder, diagram }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [charW, setCharW] = useState(7.8);
  const [comp, setComp] = useState<Completion | null>(null);
  const [active, setActive] = useState(0);
  const [, setScrollTick] = useState(0);
  /** Position du curseur à rétablir juste après l'insertion d'une suggestion. */
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const w = measureRef.current?.getBoundingClientRect().width;
    if (w) setCharW(w / 20);
  }, []);
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

  useLayoutEffect(() => {
    const c = pendingCaret.current;
    if (c === null || !taRef.current) return;
    pendingCaret.current = null;
    taRef.current.setSelectionRange(c, c);
  }, [value]);

  const emit = (v: string) => {
    typed.current = v;
    onChange(v);
  };
  const errorLines = useMemo(() => new Set(errors.map((e) => e.line)), [errors]);
  const lines = useMemo(() => value.split('\n'), [value]);

  const numberAt = (i: number) => lineNumbers?.[i] ?? i + 1;

  // Fait apparaître la ligne demandée (ex. déclaration de la classe cliquée), sans voler le focus.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta || revealLine == null) return;
    const idx = lineNumbers ? lineNumbers.indexOf(revealLine) : revealLine - 1;
    if (idx < 0) return;
    const top = idx * 20;
    if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - 60) {
      ta.scrollTop = Math.max(0, top - 40);
      syncScroll(ta);
    }
  }, [revealLine]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncScroll = (el: HTMLTextAreaElement) => {
    if (!preRef.current) return;
    preRef.current.scrollTop = el.scrollTop;
    preRef.current.scrollLeft = el.scrollLeft;
  };

  // --- Autocomplétion (uniquement à la demande : Ctrl+Espace) ---------------------------------
  const openCompletion = (text: string, caret: number) => {
    const c = diagram ? complete(text, caret, diagram) : null;
    setComp(c);
    setActive(0);
  };
  const accept = (s: Suggestion) => {
    const ta = taRef.current;
    if (!comp || !ta) return;
    const next = value.slice(0, comp.from) + s.insert + value.slice(comp.to);
    // Le curseur est replacé dès que React a écrit la nouvelle valeur (avant la frappe suivante).
    pendingCaret.current = comp.from + s.insert.length;
    emit(next);
    setComp(null);
    ta.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openCompletion(value, e.currentTarget.selectionStart);
      return;
    }
    if (comp) {
      const n = comp.items.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        accept(comp.items[active]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setComp(null);
        return;
      }
    }
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
    <div ref={rootRef} className="relative h-full overflow-hidden bg-white dark:bg-slate-950">
      <span ref={measureRef} aria-hidden="true" className={`invisible absolute left-0 top-0 ${TEXT}`}>
        {'M'.repeat(20)}
      </span>
      <pre
        ref={preRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 m-0 overflow-hidden p-4 text-slate-800 dark:text-slate-200 ${TEXT}`}
      >
        {lines.map((line, i) => {
          const n = numberAt(i);
          const isError = errorLines.has(n);
          const isHighlighted = highlightLines?.has(n);
          // Vue ciblée : un fin trait signale que les lignes ne se suivent pas dans le script complet.
          const gap = lineNumbers && i > 0 && n !== numberAt(i - 1) + 1;
          return (
          <div
            key={i}
            className={`${isError ? 'bg-red-500/10' : isHighlighted ? 'bg-indigo-500/10' : ''} ${
              gap ? 'shadow-[inset_0_1px_0_rgba(100,116,139,0.35)]' : ''
            }`}
          >
            <span className={`inline-block w-10 select-none pr-3 text-right ${isError ? 'text-red-500' : isHighlighted ? 'text-indigo-500' : 'text-slate-300 dark:text-slate-600'}`}>
              {n}
            </span>
            {highlight(line)}
            {'​'}
          </div>
          );
        })}
      </pre>

      <textarea
        value={value}
        ref={taRef}
        onChange={(e) => {
          emit(e.target.value);
          // Menu ouvert : il se filtre au fil de la frappe (et se ferme si plus rien ne correspond).
          if (comp) openCompletion(e.target.value, e.target.selectionStart);
        }}
        onScroll={(e) => {
          syncScroll(e.currentTarget);
          if (comp) setScrollTick((t) => t + 1);
        }}
        onMouseDown={() => setComp(null)}
        onBlur={() => setComp(null)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        aria-label="Éditeur de script UML"
        placeholder={placeholder ?? 'class Animal { + nom: string }'}
        className={`absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent py-4 pl-14 pr-4 text-transparent caret-indigo-600 outline-none selection:bg-indigo-500/25 dark:caret-indigo-300 ${TEXT}`}
      />
      {comp && taRef.current && (() => {
        const ta = taRef.current;
        const lineStart = value.lastIndexOf('\n', comp.from - 1) + 1;
        const row = value.slice(0, comp.from).split('\n').length - 1;
        const col = comp.from - lineStart;
        const height = Math.min(comp.items.length, 9) * 31 + 34;
        const below = PAD_TOP + (row + 1) * LINE_H - ta.scrollTop + 4;
        const above = PAD_TOP + row * LINE_H - ta.scrollTop - height - 4;
        const fits = below + height <= (rootRef.current?.clientHeight ?? 800) - 4;
        const maxLeft = (rootRef.current?.clientWidth ?? 600) - MENU_W - 8;
        return (
          <CompletionMenu
            items={comp.items}
            active={active}
            left={Math.max(8, Math.min(PAD_LEFT + col * charW - ta.scrollLeft - 10, maxLeft))}
            top={fits || above < 4 ? below : above}
            onPick={accept}
            onHover={setActive}
          />
        );
      })()}
    </div>
  );
}
