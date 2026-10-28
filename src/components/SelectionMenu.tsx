import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ALIGN_MODES, type AlignMode } from '../core/align';
import { NAMED_COLORS } from '../core/parser';
import { CloseIcon, CopyIcon, FolderIcon, FrameIcon, NoteIcon, PaletteSmallIcon, PencilIcon, SystemIcon, TrashIcon, UngroupIcon } from './Icons';
import type { DiagramType, LegendEntry } from '../core/types';

/** Types de diagramme proposés pour « typer » une sélection. */
export const DIAGRAM_TYPES: { type: DiagramType; label: string; tag: string }[] = [
  { type: 'class', label: 'Diagramme de classes', tag: 'class' },
  { type: 'usecase', label: 'Cas d’utilisation', tag: 'uc' },
  { type: 'context', label: 'Contexte statique', tag: 'ctx' },
  { type: 'package', label: 'Paquetages', tag: 'pkg' },
  { type: 'communication', label: 'Communication', tag: 'com' },
];

interface Props {
  x: number;
  y: number;
  /** Vrai : le menu est posé au-dessus de la sélection (y = son bord bas). */
  above?: boolean;
  /** Largeur du canevas : le menu se recale pour rester entièrement visible. */
  boundsW?: number;
  names: string[];
  onPackage: (title: string) => void;
  /** La sélection est un groupe (clic sur son titre) : on peut le renommer ou le dégrouper. */
  frame?: { title: string; kind: 'package' | 'system' | 'frame' };
  onRenameFrame?: (title: string) => void;
  onUngroup?: () => void;
  /** Regroupement proposé (« Regrouper dans un paquetage », « Placer dans un système »). */
  groupAction: string;
  groupPlaceholder: string;
  onType: (type: DiagramType, title: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Aligne / répartit la sélection. */
  onAlign?: (mode: AlignMode) => void;
  /** Ajoute une note UML rattachée à la sélection. */
  onNote?: (text: string) => void;
  /** Colore la sélection (null : retire la couleur) ; le libellé alimente la légende. */
  onColor: (color: string | null, label: string) => void;
  /** Entrées de légende existantes : choisir une couleur déjà libellée reprend son libellé. */
  legend: LegendEntry[];
  /** Couleur actuelle si toute la sélection a la même. */
  currentColor?: string;
  /** Couleur de chaque élément du tableau (pour savoir si un libellé sert encore ailleurs). */
  colors: Record<string, string>;
  onClear: () => void;
}

/**
 * Menu flottant au-dessus d'une sélection multiple : tout ce qu'on peut faire avec,
 * sans quitter le diagramme ni écrire de code.
 */
export function SelectionMenu({ x, y, above, boundsW, names, frame, onRenameFrame, onUngroup, onPackage, groupAction, groupPlaceholder, onType, onDelete, onDuplicate, onNote, onAlign, onColor, legend, currentColor, colors, onClear }: Props) {
  const [step, setStep] = useState<'root' | 'package' | 'type' | 'title' | 'color' | 'rename' | 'note' | 'align'>('root');
  const [noteDraft, setNoteDraft] = useState('');
  // Centré sur la sélection, mais jamais coupé par le bord du canevas (largeur réelle mesurée).
  const rootRef = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(x);
  useLayoutEffect(() => {
    const w = rootRef.current?.offsetWidth ?? 0;
    const max = (boundsW ?? Infinity) - w / 2 - 8;
    setLeft(Math.max(w / 2 + 8, Math.min(x, max)));
  });
  const [color, setColor] = useState<string | null>(currentColor ?? null);
  const [legendLabel, setLegendLabel] = useState(() => legend.find((e) => e.color === currentColor)?.label ?? '');
  /** Un clic sur une couleur l'applique tout de suite : on voit le résultat, sans bouton « Appliquer ». */
  const pickColor = (c: string) => {
    // Une couleur déjà dans la légende reprend son libellé. Sinon on garde le libellé tapé,
    // sauf s'il appartenait à une autre couleur (il venait d'être pré-rempli, pas choisi).
    // (Le libellé suit la sélection, sauf s'il désigne encore d'autres éléments, d'une autre couleur.)
    const own = legend.find((e) => e.color === c)?.label;
    const typed = legendLabel.trim();
    const usedByOthers = Object.entries(colors).some(
      ([n, col]) => !names.includes(n) && col !== c && legend.some((e) => e.color === col && e.label === typed),
    );
    const label = own ?? (usedByOthers ? '' : typed);
    setColor(c);
    setLegendLabel(label);
    onColor(c, label);
  };
  /** Le libellé est enregistré quand on quitte le champ (ou avec Entrée). */
  const commitLabel = () => {
    if (color && legendLabel.trim() !== (legend.find((e) => e.color === color)?.label ?? '')) onColor(color, legendLabel);
  };
  // Sélecteur de couleur libre : appliqué à la fermeture du sélecteur (événement « change »),
  // pas à chaque mouvement de la souris (sinon chaque nuance survolée remplirait l'historique).
  const customRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef(pickColor);
  pickRef.current = pickColor;
  useEffect(() => {
    const el = customRef.current;
    if (!el) return;
    const f = () => pickRef.current(el.value);
    el.addEventListener('change', f);
    return () => el.removeEventListener('change', f);
  }, [step]);
  const [type, setType] = useState<DiagramType>('class');
  const [title, setTitle] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === 'package' || step === 'title' || step === 'rename') input.current?.focus();
  }, [step]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 'rename') {
      if (title.trim()) onRenameFrame?.(title.trim());
      setStep('root');
    } else if (step === 'package') {
      if (title.trim()) onPackage(title.trim());
    } else onType(type, title.trim());
  };

  const btn =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800';

  return (
    <div
      role="toolbar"
      aria-label="Actions sur la sélection"
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute z-30 -translate-x-1/2 ${above ? '-translate-y-full' : ''} whitespace-nowrap rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900`}
      ref={rootRef}
      style={{ left, top: y }}
    >
      {step === 'root' && (
        <div className="flex flex-col">
          {frame && (
            <div className="mb-0.5 flex items-center gap-0.5 border-b border-slate-100 pb-0.5 dark:border-slate-800">
              <span className="min-w-0 max-w-[220px] flex-1 truncate px-2 text-xs font-semibold text-slate-700 dark:text-slate-200" title={frame.title}>
                <span className="mr-1 inline-flex align-[-2px] text-slate-400">{frame.kind === 'package' ? <FolderIcon /> : frame.kind === 'system' ? <SystemIcon /> : <FrameIcon />}</span>
                {frame.title}
              </span>
              <button
                type="button"
                className={btn}
                onClick={() => {
                  setTitle(frame.title);
                  setStep('rename');
                }}
                title="Renommer ce groupe (ou double-clic sur son titre)"
              >
                <PencilIcon /> Renommer
              </button>
              <button type="button" className={btn} onClick={onUngroup} title="Retirer le cadre : les éléments restent, à leur place">
                <UngroupIcon /> Dégrouper
              </button>
            </div>
          )}
          <div className="flex items-center gap-0.5">
          <span className="px-2 text-xs text-slate-500 dark:text-slate-400">
            {names.length} élément{names.length > 1 ? 's' : ''}
          </span>
          <button type="button" className={btn} onClick={() => setStep('package')} title={groupAction}>
            <FolderIcon /> {groupAction}
          </button>
          <button type="button" className={btn} onClick={onDuplicate} title="Dupliquer (Ctrl+D) : copies décalées, avec leurs membres et leurs liaisons internes">
            <CopyIcon /> Dupliquer
          </button>
          {onAlign && names.length >= 2 && (
            <button type="button" className={btn} onClick={() => setStep('align')} title="Aligner ou répartir les éléments sélectionnés">
              <AlignIcon mode="left" /> Aligner
            </button>
          )}
          {onNote && (
            <button type="button" className={btn} onClick={() => setStep('note')} title="Annoter : une note UML rattachée aux éléments sélectionnés">
              <NoteIcon /> Note
            </button>
          )}
          <button type="button" className={btn} onClick={() => setStep('color')} title="Couleur de fond (et entrée de légende)">
            <PaletteSmallIcon /> Couleur
          </button>
          <button type="button" className={btn} onClick={() => setStep('type')} title="Encadrer la sélection comme un diagramme d’un type donné (uc, ctx, pkg…)">
            <FrameIcon /> Cadre de diagramme
          </button>
          <button type="button" className={`${btn} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10`} onClick={onDelete} title="Supprimer les éléments sélectionnés (Suppr)">
            <TrashIcon /> Supprimer
          </button>
          <button type="button" className={btn} onClick={onClear} title="Désélectionner (Échap)" aria-label="Désélectionner">
            <CloseIcon />
          </button>
          </div>
        </div>
      )}

      {step === 'type' && (
        <div className="flex w-64 flex-col">
          <p className="px-2 pb-1 pt-1 text-xs text-slate-500 dark:text-slate-400">Type de diagramme</p>
          {DIAGRAM_TYPES.map((d) => (
            <button
              key={d.type}
              type="button"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => {
                setType(d.type);
                setTitle(d.label);
                setStep('title');
              }}
            >
              <span className="w-10 rounded bg-slate-100 px-1 text-center font-mono text-[10.5px] dark:bg-slate-800">{d.tag}</span>
              {d.label}
            </button>
          ))}
        </div>
      )}

      {step === 'color' && (
        <div className="flex w-[324px] flex-col gap-2 p-1.5">
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Couleur">
            {Object.entries(NAMED_COLORS).map(([name, hex]) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={color === hex}
                aria-label={name}
                title={name}
                onClick={() => pickColor(hex)}
                className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 ${color === hex ? 'border-indigo-600 ring-2 ring-indigo-400' : 'border-slate-300 dark:border-slate-600'}`}
                style={{ background: hex }}
              />
            ))}
            <label
              title="Autre couleur"
              className={`relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border text-xs ${
                color && !Object.values(NAMED_COLORS).includes(color) ? 'border-indigo-600 ring-2 ring-indigo-400' : 'border-dashed border-slate-400 text-slate-500'
              }`}
              style={color && !Object.values(NAMED_COLORS).includes(color) ? { background: color } : undefined}
            >
              {color && !Object.values(NAMED_COLORS).includes(color) ? '' : '+'}
              <input ref={customRef} type="color" defaultValue={color ?? '#93c5fd'} aria-label="Autre couleur" className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
          <input
            value={legendLabel}
            disabled={!color}
            onChange={(e) => setLegendLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLabel();
              if (e.key === 'Escape') setStep('root');
            }}
            placeholder={color ? 'Nom dans la légende (facultatif)' : 'Choisis une couleur'}
            aria-label="Légende de la couleur"
            list="xuml-legend-labels"
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
          />
          <datalist id="xuml-legend-labels">
            {legend.map((e) => (
              <option key={`${e.color}${e.label}`} value={e.label} />
            ))}
          </datalist>
          <div className="flex items-center gap-1">
            {color && (
              <button
                type="button"
                className={btn}
                onClick={() => {
                  setColor(null);
                  setLegendLabel('');
                  onColor(null, '');
                }}
              >
                Sans couleur
              </button>
            )}
            <button type="button" className={`${btn} ml-auto`} onClick={onClear}>
              Terminé
            </button>
          </div>
        </div>
      )}

      {step === 'align' && (
        <div className="flex items-center gap-0.5 p-0.5" role="group" aria-label="Aligner et répartir">
          {ALIGN_MODES.map((a, i) => (
            <span key={a.mode} className="contents">
              {(i === 3 || i === 6) && <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />}
              <button
                type="button"
                title={a.label + (names.length < a.min ? ` (${a.min} éléments minimum)` : '')}
                aria-label={a.label}
                disabled={names.length < a.min}
                onClick={() => onAlign?.(a.mode)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <AlignIcon mode={a.mode} />
              </button>
            </span>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          <button type="button" className={btn} onClick={() => setStep('root')}>
            Retour
          </button>
        </div>
      )}

      {step === 'note' && (
        <form
          className="flex w-80 flex-col gap-1.5 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (noteDraft.trim()) onNote?.(noteDraft.trim());
          }}
        >
          <textarea
            autoFocus
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && noteDraft.trim()) onNote?.(noteDraft.trim());
              if (e.key === 'Escape') setStep('root');
            }}
            rows={3}
            placeholder="Texte de la note (ex. « À compléter : règles de calcul de la remise »)"
            aria-label="Texte de la note"
            className="resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
          />
          <div className="flex items-center gap-1">
            <button type="submit" disabled={!noteDraft.trim()} className="h-8 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
              Ajouter la note
            </button>
            <button type="button" className={btn} onClick={() => setStep('root')}>
              Retour
            </button>
            <span className="ml-auto text-[11px] text-slate-400">Ctrl+Entrée</span>
          </div>
        </form>
      )}

      {(step === 'package' || step === 'title' || step === 'rename') && (
        <form onSubmit={submit} className="flex items-center gap-1 p-0.5">
          <input
            ref={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setStep('root')}
            placeholder={step === 'package' ? groupPlaceholder : step === 'rename' ? 'Nouveau titre' : 'Titre du diagramme'}
            aria-label={step === 'package' ? groupPlaceholder : step === 'rename' ? 'Nouveau titre du groupe' : 'Titre du diagramme'}
            className="h-8 w-52 rounded-md border border-slate-200 bg-white px-2 text-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
          />
          <button type="submit" className="h-8 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-500">
            {step === 'package' ? 'Créer' : step === 'rename' ? 'Renommer' : 'Encadrer'}
          </button>
          <button type="button" className={btn} onClick={() => setStep('root')}>
            Retour
          </button>
        </form>
      )}
    </div>
  );
}

/** Pictogrammes d'alignement : un trait de référence et deux blocs. */
function AlignIcon({ mode }: { mode: AlignMode }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const };
  const shapes: Record<AlignMode, JSX.Element> = {
    left: <><path d="M4 3v18" {...p} /><rect x="7" y="6" width="12" height="4" rx="1" {...p} /><rect x="7" y="14" width="7" height="4" rx="1" {...p} /></>,
    hcenter: <><path d="M12 3v18" strokeDasharray="2 2" {...p} /><rect x="5" y="6" width="14" height="4" rx="1" {...p} /><rect x="8" y="14" width="8" height="4" rx="1" {...p} /></>,
    right: <><path d="M20 3v18" {...p} /><rect x="5" y="6" width="12" height="4" rx="1" {...p} /><rect x="10" y="14" width="7" height="4" rx="1" {...p} /></>,
    top: <><path d="M3 4h18" {...p} /><rect x="6" y="7" width="4" height="12" rx="1" {...p} /><rect x="14" y="7" width="4" height="7" rx="1" {...p} /></>,
    vcenter: <><path d="M3 12h18" strokeDasharray="2 2" {...p} /><rect x="6" y="5" width="4" height="14" rx="1" {...p} /><rect x="14" y="8" width="4" height="8" rx="1" {...p} /></>,
    bottom: <><path d="M3 20h18" {...p} /><rect x="6" y="5" width="4" height="12" rx="1" {...p} /><rect x="14" y="10" width="4" height="7" rx="1" {...p} /></>,
    hspace: <><path d="M3 4v16M21 4v16" {...p} /><rect x="9.5" y="7" width="5" height="10" rx="1" {...p} /></>,
    vspace: <><path d="M4 3h16M4 21h16" {...p} /><rect x="7" y="9.5" width="10" height="5" rx="1" {...p} /></>,
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      {shapes[mode]}
    </svg>
  );
}
