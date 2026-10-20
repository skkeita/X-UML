import type { ReactNode } from 'react';
import type { ThemeName } from '../core/theme';
import type { SaveStatus } from '../lib/storage';
import { useEffect, useRef, useState } from 'react';
import { CodeIcon, DownloadIcon, ImageIcon, PaletteIcon, MoonIcon, PanelIcon, PdfIcon, RedoIcon, SunIcon, UndoIcon, UploadIcon } from './Icons';

interface Props {
  theme: ThemeName;
  onToggleTheme: () => void;
  editorOpen: boolean;
  onToggleEditor: () => void;
  /** Tableaux du projet (pour choisir ceux à exporter). */
  boards: { id: string; name: string }[];
  activeId: string;
  onExportSvg: (ids: string[]) => void;
  onDownloadProject: (ids: string[]) => void;
  /** Ouvre le sélecteur de fichier pour importer un projet. */
  onImport: () => void;
  onExportPdf: (ids: string[]) => void;
  onExportCode: (ids: string[]) => void;
  saveStatus: SaveStatus;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  relationMode: 'simple' | 'custom';
  /** Apparence du tableau affiché (écrite dans son code). */
  corners: 'rounded' | 'square';
  onCornersChange: (c: 'rounded' | 'square') => void;
  legendCount: number;
  legendVisible: boolean;
  onLegendVisibleChange: (v: boolean) => void;
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
        <StyleMenu {...p} />
        <Button onClick={p.onImport} title="Importer un projet (Ctrl+O) — ou glissez le fichier sur la fenêtre">
          <UploadIcon />
          <span className="hidden sm:inline">Importer</span>
        </Button>
        <ExportMenu boards={p.boards} activeId={p.activeId} onExportPdf={p.onExportPdf} onExportCode={p.onExportCode} onExportSvg={p.onExportSvg} onExportProject={p.onDownloadProject} />
        <Button onClick={p.onToggleTheme} title={p.theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}>
          {p.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>
    </header>
  );
}

/**
 * Menu « Exporter ». Avec plusieurs tableaux, on coche d'abord ceux à exporter
 * (le tableau affiché est coché d'office : l'export le plus courant reste en un clic).
 */
function ExportMenu({
  boards,
  activeId,
  onExportPdf,
  onExportCode,
  onExportSvg,
  onExportProject,
}: {
  boards: { id: string; name: string }[];
  activeId: string;
  onExportPdf: (ids: string[]) => void;
  onExportCode: (ids: string[]) => void;
  onExportSvg: (ids: string[]) => void;
  onExportProject: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([activeId]);
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

  const toggleMenu = () => {
    if (!open) setChosen([activeId]); // à chaque ouverture : le tableau affiché
    setOpen((o) => !o);
  };
  // Ordre des onglets conservé, tableaux disparus ignorés.
  const ids = boards.map((b) => b.id).filter((id) => chosen.includes(id));
  const n = ids.length;
  const many = boards.length > 1;
  const all = n === boards.length;
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const item = (icon: ReactNode, label: string, hint: string, action: (ids: string[]) => void) => (
    <button
      type="button"
      role="menuitem"
      disabled={n === 0}
      onClick={() => {
        action(ids);
        setOpen(false);
      }}
      className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-slate-800"
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
      <Button onClick={toggleMenu} title="Exporter : PDF (Ctrl+P), projet (Ctrl+S) ou image" pressed={open}>
        <DownloadIcon />
        <span className="hidden sm:inline">Exporter</span>
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-80 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {many && (
            <fieldset className="mb-1 border-b border-slate-100 px-2.5 pb-2 pt-1.5 dark:border-slate-800">
              <legend className="sr-only">Tableaux à exporter</legend>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Tableaux à exporter</span>
                <button
                  type="button"
                  onClick={() => setChosen(all ? [activeId] : boards.map((b) => b.id))}
                  className="rounded px-1.5 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                >
                  {all ? 'Seulement celui affiché' : 'Tout cocher'}
                </button>
              </div>
              <div className="max-h-44 overflow-y-auto">
                {boards.map((b) => (
                  <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                    <input type="checkbox" checked={chosen.includes(b.id)} onChange={() => toggle(b.id)} className="h-3.5 w-3.5 accent-indigo-600" />
                    <span className="truncate">{b.name}</span>
                    {b.id === activeId && <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-slate-400">affiché</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {item(
            <PdfIcon />,
            'Document PDF (.pdf)',
            n > 1 ? `Un seul PDF, une page A4 par tableau (${n} pages)` : 'Format A4, prêt à imprimer ou à joindre à un rapport (Ctrl+P)',
            onExportPdf,
          )}
          {item(
            <DownloadIcon />,
            'Projet X-UML (.json)',
            many ? `Code et positions de ${n} tableau${n > 1 ? 'x' : ''}, pour le réimporter plus tard` : 'Le code et la position des classes, pour le réimporter plus tard',
            onExportProject,
          )}
          {item(
            <CodeIcon />,
            'Code du diagramme (.txt)',
            n > 1 ? `Le script de chaque tableau (${n} fichiers), lisible et réimportable` : 'Le script seul : à lire, versionner (Git) ou réimporter',
            onExportCode,
          )}
          {item(<ImageIcon />, 'Image du diagramme (.svg)', n > 1 ? `Une image par tableau (${n} fichiers)` : 'Nette à toutes les tailles, pour un rapport ou un site', onExportSvg)}
          {n === 0 && <p className="px-2.5 pb-1.5 text-xs text-amber-600 dark:text-amber-400">Coche au moins un tableau.</p>}
        </div>
      )}
    </div>
  );
}

/** Interrupteur accessible (role="switch"), plus parlant qu'une case à cocher pour un réglage d'affichage. */
function Switch({ label, hint, checked, disabled, onChange }: { label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-slate-800"
    >
      <span className={`mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
        <span className={`h-3 w-3 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-3' : ''}`} />
      </span>
      <span>
        <span className="block text-sm text-slate-800 dark:text-slate-100">{label}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
    </button>
  );
}

/** Menu « Style » : apparence du tableau affiché. Les couleurs se posent sur une sélection (🎨). */
function StyleMenu(p: Props) {
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
  return (
    <div ref={root} className="relative">
      <Button onClick={() => setOpen((o) => !o)} title="Style : coins, couleurs, légende" pressed={open}>
        <PaletteIcon />
        <span className="hidden lg:inline">Style</span>
      </Button>
      {open && (
        <div role="dialog" aria-label="Style du tableau" className="absolute right-0 top-10 z-30 w-80 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <Switch
            label="Coins arrondis"
            hint="Décoché : boîtes à angles droits, plus sobres pour un rapport"
            checked={p.corners === 'rounded'}
            onChange={(v) => p.onCornersChange(v ? 'rounded' : 'square')}
          />
          <Switch
            label="Afficher la légende"
            hint={p.legendCount > 0 ? `${p.legendCount} couleur${p.legendCount > 1 ? 's' : ''} libellée${p.legendCount > 1 ? 's' : ''}, sous le diagramme et dans les exports` : 'Donne un libellé à une couleur pour créer la légende'}
            checked={p.legendVisible && p.legendCount > 0}
            disabled={p.legendCount === 0}
            onChange={p.onLegendVisibleChange}
          />
          <div className="mt-1 border-t border-slate-100 px-2.5 py-2 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <p>
              <b className="font-medium text-slate-700 dark:text-slate-200">Couleurs :</b> Shift+clic sur des éléments → 🎨 Couleur.
            </p>
            <p className="mt-1">
              Ou dans le code : <code className="rounded bg-slate-100 px-1 font-mono text-[11px] dark:bg-slate-800">color A, B bleu "Métier"</code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
