import type { Suggestion } from '../core/complete';

const BADGE: Record<Suggestion['type'], string> = {
  classe: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  élément: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  attribut: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  méthode: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'mot-clé': 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
};

interface Props {
  items: Suggestion[];
  active: number;
  left: number;
  top: number;
  onPick: (s: Suggestion) => void;
  onHover: (i: number) => void;
}

/** Liste de suggestions sous le curseur. onMouseDown + preventDefault : l'éditeur garde le focus. */
export function CompletionMenu({ items, active, left, top, onPick, onHover }: Props) {
  return (
    <div
      role="listbox"
      aria-label="Suggestions"
      onMouseDown={(e) => e.preventDefault()}
      className="absolute z-20 w-[320px] overflow-hidden rounded-lg border border-slate-200 bg-white text-[13px] shadow-lg dark:border-slate-700 dark:bg-slate-900"
      style={{ left, top }}
    >
      <ul className="max-h-[280px] overflow-auto py-1">
        {items.map((s, i) => (
          <li
            key={`${s.type}-${s.label}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(s)}
            className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 ${
              i === active ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            <span className={`w-14 shrink-0 rounded px-1 text-center text-[10px] font-semibold ${BADGE[s.type]}`}>{s.type}</span>
            <span className="truncate font-mono">{s.label}</span>
            {s.detail && <span className="ml-auto shrink-0 pl-2 text-[11px] text-slate-400">{s.detail}</span>}
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-100 px-2.5 py-1 text-[10.5px] text-slate-400 dark:border-slate-800">
        ↑↓ choisir · Entrée ou Tab valider · Échap fermer
      </div>
    </div>
  );
}
