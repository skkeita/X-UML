import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NAMED_COLORS } from '../core/parser';
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
  names: string[];
  onPackage: (title: string) => void;
  onType: (type: DiagramType, title: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Colore la sélection (null : retire la couleur) ; le libellé alimente la légende. */
  onColor: (color: string | null, label: string) => void;
  /** Entrées de légende existantes : choisir une couleur déjà libellée reprend son libellé. */
  legend: LegendEntry[];
  /** Couleur actuelle si toute la sélection a la même. */
  currentColor?: string;
  onClear: () => void;
}

/**
 * Menu flottant au-dessus d'une sélection multiple : tout ce qu'on peut faire avec,
 * sans quitter le diagramme ni écrire de code.
 */
export function SelectionMenu({ x, y, names, onPackage, onType, onDelete, onDuplicate, onColor, legend, currentColor, onClear }: Props) {
  const [step, setStep] = useState<'root' | 'package' | 'type' | 'title' | 'color'>('root');
  const [color, setColor] = useState(currentColor ?? NAMED_COLORS.bleu);
  const [legendLabel, setLegendLabel] = useState(() => legend.find((e) => e.color === currentColor)?.label ?? '');
  const pickColor = (c: string) => {
    setColor(c);
    // Une couleur déjà présente dans la légende reprend son libellé : un clic suffit pour « ranger » un élément.
    const known = legend.find((e) => e.color === c);
    if (known) setLegendLabel(known.label);
  };
  const [type, setType] = useState<DiagramType>('class');
  const [title, setTitle] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === 'package' || step === 'title') input.current?.focus();
  }, [step]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 'package') {
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
      className="absolute z-30 -translate-x-1/2 whitespace-nowrap rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
      style={{ left: x, top: y }}
    >
      {step === 'root' && (
        <div className="flex items-center gap-0.5">
          <span className="px-2 text-xs text-slate-500 dark:text-slate-400">
            {names.length} élément{names.length > 1 ? 's' : ''}
          </span>
          <button type="button" className={btn} onClick={() => setStep('package')} title="Regrouper dans un package (dossier UML)">
            📁 Mettre dans un package
          </button>
          <button type="button" className={btn} onClick={onDuplicate} title="Dupliquer (Ctrl+D) : copies décalées, avec leurs membres et leurs liaisons internes">
            ⧉ Dupliquer
          </button>
          <button type="button" className={btn} onClick={() => setStep('color')} title="Couleur de fond (et entrée de légende)">
            🎨 Couleur
          </button>
          <button type="button" className={btn} onClick={() => setStep('type')} title="Encadrer comme un diagramme d’un type donné">
            🏷️ Typer
          </button>
          <button type="button" className={`${btn} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10`} onClick={onDelete} title="Supprimer les éléments sélectionnés (Suppr)">
            🗑️ Supprimer
          </button>
          <button type="button" className={btn} onClick={onClear} title="Désélectionner (Échap)" aria-label="Désélectionner">
            ✕
          </button>
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onColor(color, legendLabel);
          }}
          className="flex w-[324px] flex-col gap-2 p-1.5"
        >
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
                className={`h-6 w-6 rounded-md border ${color === hex ? 'border-indigo-600 ring-2 ring-indigo-400' : 'border-slate-300 dark:border-slate-600'}`}
                style={{ background: hex }}
              />
            ))}
            <label title="Autre couleur" className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-400 text-xs text-slate-500">
              +
              <input type="color" value={color} onChange={(e) => pickColor(e.target.value)} aria-label="Autre couleur" className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
          <input
            value={legendLabel}
            onChange={(e) => setLegendLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setStep('root')}
            placeholder="Légende (facultatif) : ex. Métier"
            aria-label="Légende de la couleur"
            list="xuml-legend-labels"
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
          />
          <datalist id="xuml-legend-labels">
            {legend.map((e) => (
              <option key={`${e.color}${e.label}`} value={e.label} />
            ))}
          </datalist>
          <div className="flex items-center gap-1">
            <button type="submit" className="h-8 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-500">
              Appliquer
            </button>
            {currentColor && (
              <button type="button" className={btn} onClick={() => onColor(null, '')}>
                Sans couleur
              </button>
            )}
            <button type="button" className={btn} onClick={() => setStep('root')}>
              Retour
            </button>
          </div>
        </form>
      )}

      {(step === 'package' || step === 'title') && (
        <form onSubmit={submit} className="flex items-center gap-1 p-0.5">
          <input
            ref={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setStep('root')}
            placeholder={step === 'package' ? 'Nom du package' : 'Titre du diagramme'}
            aria-label={step === 'package' ? 'Nom du package' : 'Titre du diagramme'}
            className="h-8 w-52 rounded-md border border-slate-200 bg-white px-2 text-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
          />
          <button type="submit" className="h-8 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-500">
            {step === 'package' ? 'Créer' : 'Typer'}
          </button>
          <button type="button" className={btn} onClick={() => setStep('root')}>
            Retour
          </button>
        </form>
      )}
    </div>
  );
}
