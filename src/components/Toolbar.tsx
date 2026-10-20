import type { ReactNode } from 'react';
import type { ThemeName } from '../core/theme';
import type { SaveStatus } from '../lib/storage';
import { DownloadIcon, ImageIcon, MoonIcon, PanelIcon, SunIcon } from './Icons';

interface Props {
  theme: ThemeName;
  onToggleTheme: () => void;
  editorOpen: boolean;
  onToggleEditor: () => void;
  onExportSvg: () => void;
  onDownloadProject: () => void;
  saveStatus: SaveStatus;
}

const STATUS: Record<SaveStatus, { label: string; dot: string }> = {
  saved: { label: 'Enregistré localement', dot: 'bg-emerald-500' },
  saving: { label: 'Enregistrement…', dot: 'bg-amber-500 animate-pulse' },
  error: { label: 'Échec de la sauvegarde locale', dot: 'bg-red-500' },
};

function Button({ onClick, title, children, pressed }: { onClick: () => void; title: string; children: ReactNode; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={pressed}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-slate-200 dark:hover:bg-slate-800 ${
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
        <Button onClick={p.onExportSvg} title="Exporter le diagramme en SVG">
          <ImageIcon />
          <span className="hidden sm:inline">Exporter SVG</span>
        </Button>
        <Button onClick={p.onDownloadProject} title="Télécharger le projet (JSON)">
          <DownloadIcon />
          <span className="hidden sm:inline">Projet</span>
        </Button>
        <Button onClick={p.onToggleTheme} title={p.theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}>
          {p.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>
    </header>
  );
}
