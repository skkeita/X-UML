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
  /** Vrai : le menu est posé au-dessus de la sélection (y = son bord bas). */
  above?: boolean;
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
  /** Couleur de chaque élément du tableau (pour savoir si un libellé sert encore ailleurs). */
  colors: Record<string, string>;
  onClear: () => void;
}

/**
 * Menu flottant au-dessus d'une sélection multiple : tout ce qu'on peut faire avec,
 * sans quitter le diagramme ni écrire de code.
 */
export function SelectionMenu({ x, y, above, names, onPackage, onType, onDelete, onDuplicate, onColor, legend, currentColor, colors, onClear }: Props) {
  const [step, setStep] = useState<'root' | 'package' | 'type' | 'title' | 'color'>('root');
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
      className={`absolute z-30 -translate-x-1/2 ${above ? '-translate-y-full' : ''} whitespace-nowrap rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900`}
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
