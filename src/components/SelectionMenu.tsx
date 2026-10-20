import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DiagramType } from '../core/types';

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
  onClear: () => void;
}

/**
 * Menu flottant au-dessus d'une sélection multiple : tout ce qu'on peut faire avec,
 * sans quitter le diagramme ni écrire de code.
 */
export function SelectionMenu({ x, y, names, onPackage, onType, onDelete, onClear }: Props) {
  const [step, setStep] = useState<'root' | 'package' | 'type' | 'title'>('root');
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
