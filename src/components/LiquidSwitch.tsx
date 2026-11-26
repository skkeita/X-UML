import { useRef, type KeyboardEvent } from 'react';
import { LiquidIndicator } from './Liquid';

export interface LiquidOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

interface Props<T extends string> {
  options: readonly LiquidOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Largeur d'une option, en px. Options de même largeur → la pastille ne fait que glisser. */
const OPTION_W = 64;

/**
 * Sélecteur segmenté « liquide » : la pastille violette coule d'une option à l'autre.
 * UX : le mouvement montre d'où l'on vient et où l'on va (continuité spatiale) en 250 ms ;
 * les libellés restent au-dessus de la couche filtrée, donc parfaitement nets.
 */
export function LiquidSwitch<T extends string>({ options, value, onChange, ariaLabel, className = '' }: Props<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  // Groupe de boutons radio : les flèches changent d'option, comme un vrai <input type="radio">.
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} className={`relative rounded-lg bg-surface-2 p-0.5 ${className}`}>
      <LiquidIndicator
        className="inset-0.5"
        rect={{ x: index * OPTION_W, y: 0, w: OPTION_W, h: 28 }}
        bulgeKey={index}
        color="rounded-md bg-accent"
        variant="pill"
      />
      <div className="relative flex">
        {options.map((o, i) => {
          const active = i === index;
          return (
            <button
              key={o.value}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              title={o.title}
              onClick={() => onChange(o.value)}
              style={{ width: OPTION_W }}
              className={`h-7 rounded-md text-xs font-medium ${active ? 'text-accent-ink' : 'text-fg-muted hover:text-fg'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
