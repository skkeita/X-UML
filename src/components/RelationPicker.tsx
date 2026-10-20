import type { RelationKind } from '../core/types';
import { CloseIcon, SwapIcon, TrashIcon } from './Icons';
import type { RelationChoice } from '../core/vocabulary';

interface Props {
  /** Position écran (px, relative au canevas) où ancrer le panneau. */
  x: number;
  y: number;
  /** Taille du canevas : le panneau est replacé pour ne jamais en déborder. */
  bounds: { w: number; h: number };
  from: string;
  /** null : la cible sera choisie ensuite, d'un clic sur une classe. */
  to: string | null;
  /** Options proposées, dans le vocabulaire du diagramme affiché. */
  choices: RelationChoice[];
  /** Option actuelle (édition d'un lien existant) ; absente lors d'une création. */
  current?: RelationChoice;
  onPick: (choice: RelationChoice) => void;
  /** Actions d'édition, uniquement pour un lien existant. */
  onReverse?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** Aperçu miniature de la flèche, dessiné en dur (indépendant des <marker> du canevas). */
export function RelationGlyph({ kind }: { kind: RelationKind }) {
  const dashed = kind === 'realization' || kind === 'dependency';
  const startX = kind === 'composition' || kind === 'aggregation' ? 16 : 2;
  const endX = kind === 'inheritance' || kind === 'realization' ? 38 : 46;
  return (
    <svg width="48" height="14" viewBox="0 0 48 14" aria-hidden="true" className="shrink-0">
      <line x1={startX} y1={7} x2={endX} y2={7} stroke="currentColor" strokeWidth={1.4} strokeDasharray={dashed ? '4 3' : undefined} />
      {(kind === 'inheritance' || kind === 'realization') && (
        <path d="M 38 2 L 46 7 L 38 12 Z" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
      )}
      {(kind === 'directed' || kind === 'dependency') && (
        <path d="M 40 2.5 L 46 7 L 40 11.5" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
      )}
      {(kind === 'composition' || kind === 'aggregation') && (
        <path
          d="M 2 7 L 9 2.5 L 16 7 L 9 11.5 Z"
          fill={kind === 'composition' ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

const PANEL_W = 264;

/**
 * Panneau contextuel affiché au clic sur un lien.
 * UX : choix visuel (aperçu de la flèche) + raccourcis 1–7, R (inverser), Suppr, Échap.
 */
export function RelationPicker({ x, y, bounds, from, to, choices, current, onPick, onReverse, onDelete, onClose }: Props) {
  // Hauteur approximative (7 lignes + en-tête + pied) : suffit pour décider de l'ouvrir au-dessus.
  const panelH = choices.length * 34 + (onReverse || onDelete ? 92 : to ? 52 : 82);
  const left = Math.min(Math.max(8, x - PANEL_W / 2), Math.max(8, bounds.w - PANEL_W - 8));
  const below = y + 14;
  const top = below + panelH <= bounds.h - 8 ? below : Math.max(8, y - 14 - panelH);
  return (
    <div
      role="dialog"
      aria-label="Type de relation"
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-10 rounded-xl border border-slate-200 bg-white/95 p-1.5 text-sm shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
      style={{ left, top, width: PANEL_W }}
    >
      <div className="flex items-center justify-between px-2 pb-1.5 pt-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="truncate">
          {current === undefined && <span className="mr-1 font-sans font-medium text-indigo-600 dark:text-indigo-400">Nouvelle relation</span>}
          <span className="font-mono">
            {from} → {to ?? '?'}
          </span>
        </span>
        <button type="button" onClick={onClose} title="Fermer (Échap)" className="rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-800">
          <CloseIcon />
        </button>
      </div>

      <ul className="flex flex-col">
        {choices.map((c, i) => {
          const active = c.id === current?.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                title={c.hint}
                aria-pressed={active}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                  active
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <RelationGlyph kind={c.kind} />
                <span className="flex-1">{c.label}</span>
                <kbd className="text-[10px] text-slate-400">{i + 1}</kbd>
              </button>
            </li>
          );
        })}
      </ul>

      {!to && (
        <p className="px-2 pb-1 pt-1.5 text-[11px] text-slate-500 dark:text-slate-400">Choisissez le type de relation, puis cliquez sur la cible.</p>
      )}

      {(onReverse || onDelete) && (
      <div className="mt-1 flex gap-1 border-t border-slate-200 pt-1.5 dark:border-slate-700">
        <button type="button" onClick={onReverse} title="Inverser le sens (R)" className="flex-1 rounded-md px-2 py-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
          <span className="inline-flex items-center gap-1.5"><SwapIcon /> Inverser</span>
        </button>
        {onDelete ? (
          <button type="button" onClick={onDelete} title="Supprimer la relation (Suppr)" className="flex-1 rounded-md px-2 py-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
            <span className="inline-flex items-center gap-1.5"><TrashIcon /> Supprimer</span>
          </button>
        ) : (
          <span className="flex-1 self-center px-2 text-center text-[10.5px] leading-tight text-slate-400" title="Relation déduite du type d’un attribut ou d’une opération">
            déduite du code
          </span>
        )}
      </div>
      )}
    </div>
  );
}
