export type EditorMode = 'all' | 'class';

interface Props {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  /** Classe affichée en mode « une classe » (null si aucune). */
  focusName: string | null;
  lineCount: number;
  totalLines: number;
}

/**
 * Bascule de l'éditeur entre le script complet et la seule classe cliquée.
 * UX : contrôle segmenté toujours visible → on sait à tout moment si l'on voit tout ou une partie.
 */
export function EditorModeBar({ mode, onModeChange, focusName, lineCount, totalLines }: Props) {
  const option = (value: EditorMode, label: string, title: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      onClick={() => onModeChange(value)}
      title={title}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        mode === value
          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 dark:border-slate-800 dark:bg-slate-900">
      <div role="radiogroup" aria-label="Affichage du code" className="flex rounded-lg bg-slate-200/70 p-0.5 dark:bg-slate-800">
        {option('all', 'Tout le code', 'Afficher le script complet : toutes les classes et toutes les liaisons')}
        {option('class', 'Une classe', 'N’afficher que le code de la classe cliquée dans le diagramme')}
      </div>
      {mode === 'class' && focusName && (
        <span className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400" title="Cliquez sur une autre classe du diagramme pour changer">
          <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">{focusName}</span>
          <span className="ml-1.5">
            · {lineCount}/{totalLines} lignes
          </span>
        </span>
      )}
    </div>
  );
}

/** Message affiché en mode « une classe » tant qu'aucune classe n'est choisie. */
export function FocusPlaceholder({ missing, onShowAll }: { missing: string | null; onShowAll: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm text-slate-500 dark:text-slate-400">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" className="opacity-60">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 10h16M4 15h16" />
        <path d="M17 21l2-2-2-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p>
        {missing ? (
          <>
            La classe <span className="font-mono">{missing}</span> n’existe plus dans le script.
            <br />
          </>
        ) : null}
        Cliquez sur une classe dans le diagramme pour n’afficher que son code et ses liaisons.
      </p>
      <button type="button" onClick={onShowAll} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
        Afficher tout le code
      </button>
    </div>
  );
}
