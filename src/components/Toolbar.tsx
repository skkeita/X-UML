import type { ReactNode } from 'react';
import type { ThemeName } from '../core/theme';
import type { SaveStatus } from '../lib/storage';
import { useEffect, useRef, useState } from 'react';
import { DownloadIcon, ImageIcon, MoonIcon, PanelIcon, RedoIcon, SunIcon, UndoIcon, UploadIcon } from './Icons';

interface Props {
  theme: ThemeName;
  onToggleTheme: () => void;
  editorOpen: boolean;
  onToggleEditor: () => void;
  onExportSvg: () => void;
  onDownloadProject: () => void;
  /** Ouvre le sélecteur de fichier pour importer un projet. */
  onImport: () => void;
  saveStatus: SaveStatus;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  relationMode: 'simple' | 'custom';
  onRelationModeChange: (m: 'simple' | 'custom') => void;
}

const STATUS: Record<SaveStatus, { label: string; dot: string }> = {
  saved: { label: 'Enregistré localement', dot: 'bg-emerald-500' },
  saving: { label: 'Enregistrement…', dot: 'bg-amber-500 animate-pulse' },
  error: { label: 'Échec de la sauvegarde locale', dot: 'bg-red-500' },
};

function Button({
  onClick,
  title,
  children,
  pressed,
  disabled,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={pressed}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-slate-700 transition-colors disabled:pointer-events-none disabled:opacity-35 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-200 dark:hover:bg-slate-800 ${
        pressed ? 'bg-slate-100 dark:bg-slate-800' : ''
      }`}
    >
      {children}
    </button>
  );
}

export function Toolbar(p: Props) {
  const status = STATUS[p.saveStatus];
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-3">
        <Button onClick={p.onToggleEditor} title="Afficher / masquer l’éditeur (Ctrl+B)" pressed={p.editorOpen}>
          <PanelIcon />
        </Button>
        <span className="text-[15px] font-semibold tracking-tight">
          X<span className="text-indigo-500">-</span>UML
        </span>
        {/* Indicateur discret : rassure sans jamais demander d'action */}
        <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex dark:text-slate-400" role="status" aria-live="polite">
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {/* Mode des liaisons : tout dans le code, ou réglées à la main dans un panneau dédié */}
        <div role="radiogroup" aria-label="Mode des liaisons" className="mr-1 hidden rounded-lg bg-slate-100 p-0.5 md:flex dark:bg-slate-800">
          {(
            [
              ['simple', 'Simplifié', 'Tout s’écrit dans le code, liaisons comprises (A --|> B). « extends » crée l’héritage tout seul.'],
              ['custom', 'Personnalisé', 'Le code ne contient que les classes ; chaque liaison se règle à la main dans le panneau Liaisons.'],
            ] as const
          ).map(([value, label, title]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={p.relationMode === value}
              title={title}
              onClick={() => p.onRelationModeChange(value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                p.relationMode === value
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Annuler / rétablir visibles : la fonction se découvre sans connaître le raccourci */}
        <Button onClick={p.onUndo} title="Annuler (Ctrl+Z)" disabled={!p.canUndo}>
          <UndoIcon />
        </Button>
        <Button onClick={p.onRedo} title="Rétablir (Ctrl+Y ou Ctrl+Maj+Z)" disabled={!p.canRedo}>
          <RedoIcon />
        </Button>
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-800" aria-hidden="true" />
        <Button onClick={p.onImport} title="Importer un projet (Ctrl+O) — ou glissez le fichier sur la fenêtre">
          <UploadIcon />
          <span className="hidden sm:inline">Importer</span>
        </Button>
        <ExportMenu onExportSvg={p.onExportSvg} onExportProject={p.onDownloadProject} />
        <Button onClick={p.onToggleTheme} title={p.theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}>
          {p.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>
    </header>
  );
}

/** Menu « Exporter » : le projet complet (pour le reprendre plus tard) ou l'image du diagramme. */
function ExportMenu({ onExportSvg, onExportProject }: { onExportSvg: () => void; onExportProject: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const item = (icon: ReactNode, label: string, hint: string, action: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        action();
        setOpen(false);
      }}
      className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <span className="mt-0.5 text-slate-500">{icon}</span>
      <span>
        <span className="block text-sm text-slate-800 dark:text-slate-100">{label}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
    </button>
  );

  return (
    <div ref={root} className="relative">
      <Button onClick={() => setOpen((o) => !o)} title="Exporter (Ctrl+S pour le projet)" pressed={open}>
        <DownloadIcon />
        <span className="hidden sm:inline">Exporter</span>
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {item(<DownloadIcon />, 'Projet X-UML (.json)', 'Le code et la position des classes, pour le réimporter plus tard', onExportProject)}
          {item(<ImageIcon />, 'Image du diagramme (.svg)', 'Nette à toutes les tailles, pour un rapport ou un site', onExportSvg)}
        </div>
      )}
    </div>
  );
}
