import { useRef, type CSSProperties, type KeyboardEvent } from 'react';

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

/** Largeur d'une option, en px. Options de même largeur → la pastille ne fait que glisser (transform seul). */
const OPTION_W = 64;
const GOO_ID = 'xu-goo';

/**
 * Sélecteur segmenté « liquide » (effet Liquid Bulge : flou gaussien + seuil alpha).
 *
 * Deux pastilles violettes superposées glissent vers l'option choisie, la seconde un peu plus
 * lentement. Pendant le trajet elles s'écartent : le filtre SVG floute leur réunion puis
 * coupe l'alpha net, ce qui dessine un pont de matière entre les deux. La pastille semble
 * s'étirer comme une goutte, puis se reforme en une seule à l'arrivée.
 *
 * UX : le mouvement montre d'où l'on vient et où l'on va (continuité spatiale), en 250 ms
 * maximum. Les libellés sont posés au-dessus de la couche filtrée : le texte reste net.
 * La pastille de tête gonfle légèrement en route (le « bulge »), puis reprend sa forme.
 * Seul transform est animé ; en prefers-reduced-motion la pastille saute directement.
 */
export function LiquidSwitch<T extends string>({ options, value, onChange, ariaLabel, className = '' }: Props<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const blobX = { transform: `translateX(${index * OPTION_W}px)` } satisfies CSSProperties;

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
      {/* Filtre « gooey » : flou → seuil alpha (le contour redevient net) → couleur d'origine. */}
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <defs>
          <filter id={GOO_ID} x="-20%" y="-50%" width="140%" height="200%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* Couche liquide : les deux pastilles, filtrées ensemble. */}
      <div className="pointer-events-none absolute inset-0.5" style={{ filter: `url(#${GOO_ID})` }} aria-hidden="true">
        <span className="xu-blob xu-blob-lead" style={blobX}>
          {/* key = option active : l'animation de gonflement rejoue à chaque changement. */}
          <span key={index} className="xu-blob-body xu-bulge" />
        </span>
        <span className="xu-blob xu-blob-trail" style={blobX}>
          <span className="xu-blob-body" />
        </span>
      </div>

      {/* Libellés au-dessus, hors filtre : texte toujours net. */}
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
              className={`h-7 rounded-md text-xs font-medium transition-opacity ${active ? 'text-accent-ink' : 'text-fg-muted hover:text-fg'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
