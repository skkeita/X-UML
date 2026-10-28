import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { RelationChange, RelationRef } from '../core/edit';
import type { Relation, RelationKind } from '../core/types';
import { changeForChoice, isStereotypeLabel, relationChoiceOf, type RelationChoice, type Vocabulary } from '../core/vocabulary';
import { CloseIcon, SwapIcon } from './Icons';
import { RelationGlyph } from './RelationPicker';

interface Props {
  relations: Relation[];
  /** Éléments du diagramme : identifiant + nom affiché (un acteur « Client web » s'appelle ClientWeb dans le script). */
  elements: { name: string; label: string }[];
  /** Seules les relations de cet élément sont listées (fiche d'un élément, mode « un élément »). */
  filter: string | null;
  vocab: Vocabulary;
  onChange: (ref: RelationRef, change: RelationChange) => void;
  onDelete: (ref: RelationRef) => void;
  onAdd: (from: string, to: string, kind: RelationKind, label?: string) => void;
  /** Dans la fiche d'un élément : pas de repli, hauteur libre. */
  embedded?: boolean;
}

const refOf = (r: Relation): RelationRef => ({ line: r.line, from: r.from, to: r.to, auto: r.auto, via: r.via, kind: r.kind });

/** Explication affichée au survol du badge « auto ». */
function autoHint(r: Relation): string {
  if (r.via === 'member') {
    return `Déduite automatiquement : un ${r.kind === 'directed' ? 'attribut' : 'membre'} de ${r.from} est du type ${r.to}. La modifier ici en fait une relation explicite ; pour la retirer, changez le type de ce membre.`;
  }
  return `Déduite de la ${r.via === 'implements' ? 'réalisation' : 'généralisation'} déclarée sur ${r.from}. La modifier ici met la déclaration à jour.`;
}

const MULT_KINDS: RelationKind[] = ['association', 'directed', 'aggregation', 'composition'];

/** Bouton montrant la flèche actuelle ; ouvre la liste des 7 types, chacun avec son dessin. */
function KindSelect({ choices, current, onPick }: { choices: RelationChoice[]; current?: RelationChoice; onPick: (c: RelationChoice) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

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
        title={`${current?.label ?? ''} — cliquer pour changer`}
        aria-label={`Type : ${current?.label ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        {current && <RelationGlyph kind={current.kind} />}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Type de relation"
          className="absolute left-1/2 top-8 z-30 w-60 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {choices.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={c.id === current?.id}
                title={c.hint}
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                  c.id === current?.id
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
function LabelInput({ value, onCommit, placeholder = 'libellé', label = 'Libellé de la relation', className }: { value: string; onCommit: (v: string) => void; placeholder?: string; label?: string; className?: string }) {
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
      placeholder={placeholder}
      aria-label={label}
      className={`${className ?? ''} h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-xs text-slate-600 placeholder:text-slate-300 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none dark:text-slate-300 dark:placeholder:text-slate-600 dark:hover:border-slate-700 dark:focus:bg-slate-900`}
    />
  );
}

const SELECT =
  'h-7 w-full min-w-0 truncate rounded-md border border-slate-200 bg-white px-1.5 font-mono text-xs text-sky-700 hover:border-indigo-300 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300';

/**
 * Relations du diagramme, réglées avec des menus : aucun symbole à mémoriser ni à taper.
 * Les options et les mots suivent le type de diagramme (« Inclusion «include» », « Message »…).
 */
export function RelationsPanel({ relations, elements, filter, vocab, onChange, onDelete, onAdd, embedded }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  // Les liens de note se règlent depuis la note elle-même : ils ne sont pas des relations UML.
  const umlRelations = relations.filter((r) => r.via !== 'note');
  const list = filter ? umlRelations.filter((r) => r.from === filter || r.to === filter) : umlRelations;
  const names = elements.map((e) => e.name);
  const labelOf = (n: string) => elements.find((e) => e.name === n)?.label ?? n;
  // Un élément cité dans une relation doit rester sélectionnable même s'il n'est pas déclaré.
  const options = (current: string) => (names.includes(current) ? names : [current, ...names]);

  const add = () => {
    const from = filter ?? names[0];
    if (!from) return;
    const to = names.find((n) => n !== from) ?? from;
    const first = vocab.relations[0];
    onAdd(from, to, first.kind, first.stereotype);
    setCollapsed(false);
  };

  const open = embedded || !collapsed;
  return (
    <section
      aria-label={vocab.relationsLabel}
      className={
        embedded
          ? 'flex flex-col'
          : `flex shrink-0 flex-col border-t border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40 ${collapsed ? '' : 'max-h-[45%] min-h-[120px]'}`
      }
    >
      <header className={`flex shrink-0 items-center gap-2 ${embedded ? 'h-8' : 'h-9 px-2'}`}>
        {embedded ? (
          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
            {vocab.relationsLabel} <span className="font-normal normal-case text-slate-400">({list.length})</span>
          </h3>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="flex items-center gap-1.5 rounded px-1 text-[13px] font-semibold text-slate-800 hover:text-slate-950 dark:text-slate-200 dark:hover:text-white"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className={collapsed ? '-rotate-90' : ''}>
              <path d="M6 9l6 6 6-6" />
            </svg>
            {vocab.relationsLabel}
            <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-medium normal-case tracking-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {list.length}
            </span>
          </button>
        )}
        {filter && !embedded && (
          <span className="truncate text-xs text-slate-400">
            de <span className="font-medium text-indigo-600 dark:text-indigo-400">{labelOf(filter)}</span>
          </span>
        )}
        <button
          type="button"
          onClick={add}
          disabled={names.length === 0}
          className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
        >
          + Ajouter
        </button>
      </header>

      {open && (
        <div className={embedded ? '' : 'min-h-0 flex-1 overflow-auto px-2 pb-2'}>
          {list.length === 0 ? (
            <p className="px-1 py-2 text-xs leading-relaxed text-slate-400">
              Aucune {vocab.relation}. Cliquez sur « + Ajouter », ou tirez un trait depuis l’une des poignées rondes au bord d’un élément du diagramme.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {list.map((r) => {
                const ref = refOf(r);
                const choice = relationChoiceOf(vocab, r);
                const stereo = isStereotypeLabel(r.label) && choice?.stereotype === r.label?.trim();
                const mult = vocab.multiplicities && MULT_KINDS.includes(r.kind) && !r.auto;
                return (
                  <li
                    key={`${r.line}-${r.from}-${r.to}-${r.kind}`}
                    data-relation-row={r.line}
                    className="flex flex-col gap-1 rounded-md bg-white p-1 shadow-[0_0_0_1px_rgba(148,163,184,0.25)] dark:bg-slate-900"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1">
                      <select value={r.from} onChange={(e) => onChange(ref, { from: e.target.value })} aria-label="Source" className={SELECT}>
                        {options(r.from).map((n) => (
                          <option key={n} value={n}>
                            {labelOf(n)}
                          </option>
                        ))}
                      </select>
                      <KindSelect choices={vocab.relations} current={choice} onPick={(c) => onChange(ref, changeForChoice(c, r.label))} />
                      <select value={r.to} onChange={(e) => onChange(ref, { to: e.target.value })} aria-label="Cible" className={SELECT}>
                        {options(r.to).map((n) => (
                          <option key={n} value={n}>
                            {labelOf(n)}
                          </option>
                        ))}
                      </select>
                      <div className="flex">
                        <button
                          type="button"
                          onClick={() => onChange(ref, { reverse: true })}
                          title="Inverser le sens"
                          aria-label="Inverser le sens"
                          className="flex h-7 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          <SwapIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(ref)}
                          disabled={r.via === 'member'}
                          title={r.via === 'member' ? `Changez le type du membre de ${labelOf(r.from)} pour retirer cette relation` : `Supprimer la ${vocab.relation}`}
                          aria-label={`Supprimer la ${vocab.relation}`}
                          className="flex h-7 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:hover:bg-red-500/10"
                        >
                          <CloseIcon />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pl-0.5">
                      {r.auto ? (
                        <span
                          title={autoHint(r)}
                          className="flex h-6 items-center gap-1 truncate rounded-md bg-indigo-50 px-1.5 text-[10.5px] font-medium text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"
                        >
                          {choice?.label ?? r.kind} · déduite
                        </span>
                      ) : stereo ? (
                        <span className="flex h-6 items-center truncate px-1.5 text-[11px] text-slate-500 dark:text-slate-400">{choice?.label}</span>
                      ) : (
                        <LabelInput value={r.label ?? ''} onCommit={(label) => onChange(ref, { label })} placeholder={`${choice?.label ?? ''} · ${vocab.labelPlaceholder}`} />
                      )}
                      {mult && (
                        <>
                          <LabelInput value={r.multFrom ?? ''} onCommit={(m) => onChange(ref, { multFrom: m })} placeholder="mult." label={`Multiplicité côté ${labelOf(r.from)}`} className="!w-14 shrink-0 text-center font-mono" />
                          <LabelInput value={r.multTo ?? ''} onCommit={(m) => onChange(ref, { multTo: m })} placeholder="mult." label={`Multiplicité côté ${labelOf(r.to)}`} className="!w-14 shrink-0 text-center font-mono" />
                        </>
                      )}
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
