import { useLayoutEffect, useRef, useState } from 'react';
import type { RelationChoice } from '../core/vocabulary';
import { CloseIcon, SwapIcon, TrashIcon } from './Icons';
import { RelationGlyph } from './RelationPicker';

interface Props {
  x: number;
  y: number;
  above: boolean;
  boundsW: number;
  count: number;
  choices: RelationChoice[];
  /** Type commun à toute la sélection (sinon aucun n'est coché). */
  currentId?: string;
  onPick: (choice: RelationChoice) => void;
  onReverse: () => void;
  onDelete: () => void;
  onClear: () => void;
}

/**
 * Menu au-dessus de plusieurs relations sélectionnées (Shift+clic) : même type pour toutes,
 * inverser, supprimer. Chaque action est une seule étape d'annulation.
 */
export function RelationSelectionMenu({ x, y, above, boundsW, count, choices, currentId, onPick, onReverse, onDelete, onClear }: Props) {
  const [typesOpen, setTypesOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(x);
  useLayoutEffect(() => {
    const w = rootRef.current?.offsetWidth ?? 0;
    setLeft(Math.max(w / 2 + 8, Math.min(x, boundsW - w / 2 - 8)));
  });
  const btn =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800';

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label="Actions sur les relations sélectionnées"
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute z-30 -translate-x-1/2 ${above ? '-translate-y-full' : ''} whitespace-nowrap rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900`}
      style={{ left, top: y }}
    >
      {typesOpen ? (
        <div className="flex w-64 flex-col">
          <p className="px-2 pb-1 pt-1 text-xs text-slate-500 dark:text-slate-400">
            Type pour les {count} relations
          </p>
          {choices.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.hint}
              aria-pressed={c.id === currentId}
              onClick={() => {
                onPick(c);
                setTypesOpen(false);
              }}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm ${
                c.id === currentId
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <RelationGlyph kind={c.kind} />
              {c.label}
            </button>
          ))}
          <button type="button" className={`${btn} mt-1 self-start`} onClick={() => setTypesOpen(false)}>
            Retour
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <span className="px-2 text-xs text-slate-500 dark:text-slate-400">{count} relation{count > 1 ? 's' : ''}</span>
          <button type="button" className={btn} onClick={() => setTypesOpen(true)} title="Donner le même type à toutes les relations sélectionnées">
            Changer le type
          </button>
          <button type="button" className={btn} onClick={onReverse} title="Inverser le sens de chaque relation sélectionnée">
            <SwapIcon /> Inverser
          </button>
          <button type="button" className={`${btn} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10`} onClick={onDelete} title="Supprimer les relations sélectionnées (Suppr)">
            <TrashIcon /> Supprimer
          </button>
          <button type="button" className={btn} onClick={onClear} title="Désélectionner (Échap)" aria-label="Désélectionner">
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
