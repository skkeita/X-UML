import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { prefersReducedMotion } from '../core/theme';

const KEY = 'x-uml:intro';
/** Fin du maintien : la planche commence à s'effacer (le fondu dure --dur-slow, soit 3,15 s au total). */
const HOLD_UNTIL = 2900;

/** La planche n'est jouée qu'une fois par session, et jamais si l'utilisateur a réduit les animations. */
function shouldPlay(): boolean {
  if (prefersReducedMotion()) return false;
  try {
    return sessionStorage.getItem(KEY) === null;
  } catch {
    return false; // stockage indisponible : on ne risque pas de la rejouer à chaque rechargement
  }
}

/** Un trait du logo : position, sens de tracé (origine + axe), départ et durée en millisecondes. */
interface Stroke {
  style: CSSProperties;
  axis: 'x' | 'y';
  delay: number;
  dur: number;
  accent?: boolean;
}

// Logo X-UML : une boîte de classe (cadre + deux séparateurs), le nom de la classe en violet.
// Le cadre se trace d'un seul geste dans le sens horaire, puis les séparateurs, puis l'accent.
const STROKES: Stroke[] = [
  { style: { top: 0, left: 0, width: 64, height: 2, transformOrigin: 'left' }, axis: 'x', delay: 150, dur: 150 },
  { style: { top: 0, right: 0, width: 2, height: 64, transformOrigin: 'top' }, axis: 'y', delay: 300, dur: 150 },
  { style: { bottom: 0, right: 0, width: 64, height: 2, transformOrigin: 'right' }, axis: 'x', delay: 450, dur: 150 },
  { style: { bottom: 0, left: 0, width: 2, height: 64, transformOrigin: 'bottom' }, axis: 'y', delay: 600, dur: 150 },
  { style: { top: 21, left: 0, width: 64, height: 2, transformOrigin: 'left' }, axis: 'x', delay: 780, dur: 200 },
  { style: { top: 42, left: 0, width: 64, height: 2, transformOrigin: 'left' }, axis: 'x', delay: 880, dur: 200 },
  { style: { top: 10, left: 11, width: 24, height: 3, borderRadius: 2, transformOrigin: 'left' }, axis: 'x', delay: 1050, dur: 250, accent: true },
];

const vars = (v: Record<string, string>) => v as CSSProperties;

/**
 * Planche d'entrée : le logo se dessine au trait, puis « X-UML », puis « Créé par skkeita ».
 *
 * UX : c'est un simple voile posé PAR-DESSUS l'éditeur, qui se charge et s'affiche derrière
 * sans attendre. Un clic ou Échap la ferme tout de suite ; elle ne prend jamais le focus et
 * reste invisible des lecteurs d'écran (aria-hidden), qui accèdent directement à l'application.
 * Seuls transform et opacity sont animés.
 */
export function Intro() {
  const [state, setState] = useState<'playing' | 'leaving' | 'done'>(() => (shouldPlay() ? 'playing' : 'done'));
  const leave = useCallback(() => setState((s) => (s === 'playing' ? 'leaving' : s)), []);

  useEffect(() => {
    if (state !== 'playing') return;
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* ignoré */
    }
    const timer = window.setTimeout(leave, HOLD_UNTIL);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // Échap ferme la planche, pas un menu de l'éditeur derrière
      leave();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [state, leave]);

  if (state === 'done') return null;
  return (
    <div
      className="xu-intro"
      data-leaving={state === 'leaving'}
      aria-hidden="true"
      onClick={leave}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && state === 'leaving') setState('done');
      }}
    >
      <div className="relative h-16 w-16">
        {STROKES.map((s, i) => (
          <span
            key={i}
            className={`xu-intro-stroke ${s.accent ? '!bg-accent-strong' : ''}`}
            style={{
              ...s.style,
              ...vars({ '--delay': `${s.delay}ms`, '--dur': `${s.dur}ms`, [s.axis === 'x' ? '--from-x' : '--from-y']: '0' }),
            }}
          />
        ))}
      </div>
      <p className="xu-intro-rise mt-6 text-[28px] font-semibold leading-none tracking-tight" style={vars({ '--delay': '1250ms' })}>
        X-UML
      </p>
      <p className="xu-intro-rise mt-3 font-mono text-xs text-fg-muted" style={vars({ '--delay': '1750ms' })}>
        Créé par skkeita
      </p>
    </div>
  );
}
