import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LiquidIndicator } from './Liquid';

export interface Command {
  id: string;
  label: string;
  /** Rubrique affichée à droite (« Export », « Affichage »…). */
  group: string;
  /** Raccourci clavier, « Ctrl+S ». */
  keys?: string;
  icon?: ReactNode;
  /** Mots-clés supplémentaires pour la recherche. */
  tags?: string;
  disabled?: boolean;
  run: () => void;
}

/** Hauteur d'une ligne de résultat (h-10), en px : sert à placer le surlignage liquide. */
const ROW_H = 40;

/** Recherche insensible à la casse et aux accents (« editeur » trouve « Éditeur »). */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Palette de commandes (Ctrl+K) : toutes les actions de l'application, au clavier.
 *
 * UX : on tape quelques lettres, Entrée lance la première action — plus rapide que de
 * chercher un bouton, et chaque ligne rappelle le raccourci direct pour la fois suivante.
 * Le filtrage est immédiat (aucune animation sur la liste) ; seule l'ouverture est animée.
 */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const previous = useRef<Element | null>(null);

  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const usable = commands.filter((c) => !c.disabled);
    if (words.length === 0) return usable;
    return usable.filter((c) => {
      const hay = fold(`${c.label} ${c.group} ${c.tags ?? ''}`);
      return words.every((w) => hay.includes(w));
    });
  }, [commands, query]);
  const current = Math.min(index, Math.max(results.length - 1, 0));

  // Le focus revient là où il était (l'éditeur, le plus souvent) à la fermeture.
  useEffect(() => {
    previous.current = document.activeElement;
    return () => {
      if (previous.current instanceof HTMLElement) previous.current.focus();
    };
  }, []);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-start justify-center bg-slate-950/40 px-3 pt-[14vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        className="flex max-h-[60vh] w-full max-w-xl animate-pop-in flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIndex(results.length ? (current + 1) % results.length : 0);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIndex(results.length ? (current - 1 + results.length) % results.length : 0);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            run(results[current]);
          }
        }}
      >
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="xu-commands"
          aria-activedescendant={results[current] ? `xu-command-${results[current].id}` : undefined}
          aria-label="Rechercher une action"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          placeholder="Rechercher une action : exporter, thème, nouveau tableau…"
          className="h-12 shrink-0 border-b border-line bg-transparent px-4 text-[15px] text-fg placeholder:text-fg-muted focus:outline-none"
        />
        <ul ref={list} id="xu-commands" role="listbox" aria-label="Actions" className="relative min-h-0 flex-1 overflow-y-auto p-1.5">
          {/* Surlignage liquide : il coule de ligne en ligne au clavier comme à la souris.
              La couche couvre toute la liste (pas seulement la partie visible) et défile avec elle. */}
          {results.length > 0 && (
            <LiquidIndicator
              className="left-1.5 right-1.5 top-1.5"
              style={{ height: results.length * ROW_H }}
              rect={{ x: 0, y: current * ROW_H, h: ROW_H }}
              bulgeKey={current}
              color="rounded-md bg-indigo-100 dark:bg-accent-soft"
              variant="row"
            >
              <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-strong" />
            </LiquidIndicator>
          )}
          {results.map((c, i) => {
            const selected = i === current;
            return (
              <li
                key={c.id}
                id={`xu-command-${c.id}`}
                role="option"
                aria-selected={selected}
                onMouseMove={() => setIndex(i)}
                onClick={() => run(c)}
                // Ligne active : le fond et le filet violets sont portés par la couche liquide ci-dessus.
                className="relative flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-fg"
              >
                <span className={`flex w-4 shrink-0 justify-center ${selected ? 'text-accent-strong' : 'text-fg-muted'}`}>{c.icon}</span>
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {c.keys ? (
                  <span className="flex shrink-0 items-center gap-1">
                    {c.keys.split('+').map((k) => (
                      <kbd key={k} className="xu-kbd">
                        {k}
                      </kbd>
                    ))}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-fg-muted">{c.group}</span>
                )}
              </li>
            );
          })}
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-fg-muted">Aucune action ne correspond à « {query} ».</li>}
        </ul>
        <footer className="flex shrink-0 items-center gap-4 border-t border-line px-4 py-2 text-xs text-fg-muted">
          <span className="flex items-center gap-1.5">
            <kbd className="xu-kbd">↑</kbd>
            <kbd className="xu-kbd">↓</kbd> naviguer
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="xu-kbd">Entrée</kbd> lancer
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <kbd className="xu-kbd">Échap</kbd> fermer
          </span>
        </footer>
      </div>
    </div>
  );
}
