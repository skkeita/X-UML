import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { RELATION_CHOICES, type RelationChange, type RelationRef } from '../core/edit';
import type { Relation, RelationKind } from '../core/types';
import { RelationGlyph } from './RelationPicker';

interface Props {
  relations: Relation[];
  classNames: string[];
  /** Mode « Une classe » : seules les liaisons de cette classe sont listées. */
  filter: string | null;
  onChange: (ref: RelationRef, change: RelationChange) => void;
  onDelete: (ref: RelationRef) => void;
  onAdd: (from: string, to: string, kind: RelationKind) => void;
}

const refOf = (r: Relation): RelationRef => ({ line: r.line, from: r.from, to: r.to });

/** Bouton montrant la flèche actuelle ; ouvre la liste des 7 types, chacun avec son dessin. */
function KindSelect({ kind, onPick }: { kind: RelationKind; onPick: (k: RelationKind) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const label = RELATION_CHOICES.find((c) => c.kind === kind)?.label ?? kind;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        title={`${label} — cliquer pour changer`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        <RelationGlyph kind={kind} />
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Type de liaison"
          className="absolute left-1/2 top-8 z-30 w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {RELATION_CHOICES.map((c) => (
            <li key={c.kind}>
              <button
                type="button"
                role="option"
                aria-selected={c.kind === kind}
                title={c.hint}
                onClick={() => {
                  onPick(c.kind);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                  c.kind === kind
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <RelationGlyph kind={c.kind} />
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Libellé modifiable ; validé à la sortie du champ ou avec Entrée (une seule étape d'annulation). */
function LabelInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft.trim() !== value) onCommit(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setDraft(value);
      requestAnimationFrame(() => e.currentTarget?.blur());
    }
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      placeholder="libellé"
      aria-label="Libellé de la liaison"
      className="h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-xs text-slate-600 placeholder:text-slate-300 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none dark:text-slate-300 dark:placeholder:text-slate-600 dark:hover:border-slate-700 dark:focus:bg-slate-900"
    />
  );
}

const SELECT =
  'h-7 w-full min-w-0 truncate rounded-md border border-slate-200 bg-white px-1.5 font-mono text-xs text-sky-700 hover:border-indigo-300 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300';

/**
 * Panneau « Liaisons » : les liaisons sont séparées du code des classes.
 * Chaque ligne se règle avec des menus — aucun symbole à mémoriser ni à taper.
 */
export function RelationsPanel({ relations, classNames, filter, onChange, onDelete, onAdd }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const list = filter ? relations.filter((r) => r.from === filter || r.to === filter) : relations;
  // Les classes citées dans une liaison doivent rester sélectionnables même si elles ne sont pas déclarées.
  const options = (current: string) => (classNames.includes(current) ? classNames : [current, ...classNames]);

  const add = () => {
    const from = filter ?? classNames[0];
    if (!from) return;
    const to = classNames.find((n) => n !== from) ?? from;
    onAdd(from, to, 'association');
    setCollapsed(false);
  };

  return (
    <section
      aria-label="Liaisons"
      className={`flex shrink-0 flex-col border-t border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40 ${collapsed ? '' : 'max-h-[45%] min-h-[120px]'}`}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 px-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="flex items-center gap-1.5 rounded px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className={collapsed ? '-rotate-90' : ''}>
            <path d="M6 9l6 6 6-6" />
          </svg>
          Liaisons
          <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-medium normal-case tracking-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {list.length}
          </span>
        </button>
        {filter && (
          <span className="truncate text-xs text-slate-400">
            de <span className="font-mono text-indigo-600 dark:text-indigo-400">{filter}</span>
          </span>
        )}
        <button
          type="button"
          onClick={add}
          disabled={classNames.length === 0}
          className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
        >
          + Ajouter
        </button>
      </header>

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {list.length === 0 ? (
            <p className="px-1 py-3 text-xs leading-relaxed text-slate-400">
              Aucune liaison. Cliquez sur « + Ajouter », ou tirez un trait depuis un rond ◦ sur le bord d’une classe dans le diagramme.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {list.map((r) => {
                const ref = refOf(r);
                return (
                  <li
                    key={`${r.line}-${r.from}-${r.to}`}
                    data-relation-row={r.line}
                    className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,0.9fr)_auto] items-center gap-1 rounded-md bg-white p-1 shadow-[0_0_0_1px_rgba(148,163,184,0.25)] dark:bg-slate-900"
                  >
                    <select value={r.from} onChange={(e) => onChange(ref, { from: e.target.value })} aria-label="Classe source" className={SELECT}>
                      {options(r.from).map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                    <KindSelect kind={r.kind} onPick={(kind) => onChange(ref, { kind })} />
                    <select value={r.to} onChange={(e) => onChange(ref, { to: e.target.value })} aria-label="Classe cible" className={SELECT}>
                      {options(r.to).map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                    <LabelInput value={r.label ?? ''} onCommit={(label) => onChange(ref, { label })} />
                    <div className="flex">
                      <button
                        type="button"
                        onClick={() => onChange(ref, { reverse: true })}
                        title="Inverser le sens"
                        aria-label="Inverser le sens"
                        className="flex h-7 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        ⇄
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(ref)}
                        title="Supprimer la liaison"
                        aria-label="Supprimer la liaison"
                        className="flex h-7 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
