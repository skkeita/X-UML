import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MOTION, prefersReducedMotion } from '../core/theme';

/**
 * Effet « Liquid Bulge » : flou gaussien + seuil alpha (filtre « gooey »).
 *
 * Principe : la tête glisse vers la cible et gonfle un instant en route (le « bulge »).
 * La traîne, elle, s'étire pour couvrir tout le trajet (départ + arrivée), puis se
 * rétracte sur la cible. Le filtre floute l'ensemble puis coupe l'alpha net : les bords
 * s'arrondissent et la jonction tête / traîne devient un col de matière. L'indicateur
 * coule comme une goutte, quelle que soit la distance parcourue.
 *
 * Règles tenues :
 *  - seul transform est animé (translate + scale), 250 ms au total ;
 *  - le contenu (texte, icônes) est posé AU-DESSUS de la couche filtrée : il reste net ;
 *  - prefers-reduced-motion : la règle globale de index.css coupe transitions et animations,
 *    l'indicateur saute directement à sa place.
 */

/** Filtres partagés, à monter une seule fois dans la page. */
export function GooDefs() {
  return (
    <svg width="0" height="0" className="pointer-events-none fixed" aria-hidden="true" focusable="false">
      <defs>
        {/* Pastilles et lignes de liste : flou large, seuil fort. */}
        <filter id="xu-goo" x="-20%" y="-50%" width="140%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
        {/* Filets fins (onglet actif) : flou réduit, sinon un trait de 3 px disparaîtrait au seuil. */}
        <filter id="xu-goo-thin" x="-10%" y="-200%" width="120%" height="500%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 14 -5" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

export interface LiquidRect {
  x: number;
  y: number;
  /** Largeur en px ; absente = toute la largeur de la couche. */
  w?: number;
  h: number;
}

interface Props {
  rect: LiquidRect | null;
  /** Change à chaque déplacement : rejoue le gonflement de la tête. */
  bulgeKey: string | number;
  /** Classe de couleur de la goutte (ex. « bg-accent »). */
  color: string;
  /** Forme du gonflement : « pill » (pastille), « bar » (filet fin), « row » (ligne de liste). */
  variant: 'pill' | 'bar' | 'row';
  filter?: 'xu-goo' | 'xu-goo-thin';
  className?: string;
  style?: CSSProperties;
  /** Contenu ajouté dans la goutte de tête (ex. le filet violet d'une ligne active). */
  children?: ReactNode;
}

/**
 * Couche liquide positionnée en absolu dans un parent `relative`.
 * La largeur ne s'anime pas directement (ce n'est pas un transform) : la goutte garde sa
 * largeur de départ et s'étire par scaleX, ce qui reste sur le compositeur.
 */
export function LiquidIndicator({ rect, bulgeKey, color, variant, filter = 'xu-goo', className = '', style, children }: Props) {
  const baseW = useRef<number | undefined>(undefined);
  if (rect?.w && baseW.current === undefined) baseW.current = rect.w;
  const trail = useRef<HTMLSpanElement>(null);
  const previous = useRef<LiquidRect | null>(null);

  // Premier placement sans animation : l'indicateur ne doit pas « voler » depuis le coin à l'ouverture.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!rect || settled) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true)));
    return () => cancelAnimationFrame(id);
  }, [rect, settled]);

  /** transform d'une goutte couvrant `r` (la largeur s'obtient par scaleX, la hauteur par scaleY). */
  const transformOf = (r: LiquidRect, h: number) => {
    const sx = r.w && baseW.current ? r.w / baseW.current : 1;
    return `translate(${r.x}px, ${r.y}px) scale(${sx}, ${r.h / h})`;
  };

  // Traîne : étirement sur tout le trajet, puis rétraction sur la cible (Web Animations, transform seul).
  const key = rect ? `${rect.x}|${rect.y}|${rect.w ?? ''}|${rect.h}` : '';
  useLayoutEffect(() => {
    const el = trail.current;
    const from = previous.current;
    previous.current = rect;
    if (!el || !rect || !from || !settled || prefersReducedMotion() || typeof el.animate !== 'function') return;
    if (from.x === rect.x && from.y === rect.y && from.w === rect.w) return;
    const x = Math.min(from.x, rect.x);
    const y = Math.min(from.y, rect.y);
    const span: LiquidRect = {
      x,
      y,
      w: rect.w !== undefined && from.w !== undefined ? Math.max(from.x + from.w, rect.x + rect.w) - x : undefined,
      h: Math.max(from.y + from.h, rect.y + rect.h) - y,
    };
    // Très long trajet (ex. de la dernière ligne à la première) : pas d'étirement sur toute la liste.
    const far = span.h > rect.h * 5 || (span.w ?? 0) > 640;
    const start = getComputedStyle(el).transform; // part d'où la traîne se trouve vraiment, même en plein trajet
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(
      far
        ? [{ transform: start === 'none' ? transformOf(from, rect.h) : start }, { transform: transformOf(rect, rect.h) }]
        : [
            { transform: start === 'none' ? transformOf(from, rect.h) : start },
            { transform: transformOf(span, rect.h), offset: 0.4 },
            { transform: transformOf(rect, rect.h) },
          ],
      { duration: MOTION.slow, easing: MOTION.ease },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settled]);

  if (!rect) return null;
  const sx = rect.w && baseW.current ? rect.w / baseW.current : 1;
  const blob: CSSProperties = {
    width: rect.w ? baseW.current : '100%',
    height: rect.h,
    transform: `translate(${rect.x}px, ${rect.y}px) scaleX(${sx})`,
  };

  return (
    <div
      className={`pointer-events-none absolute ${className}`}
      style={{ filter: `url(#${filter})`, ...style }}
      data-settled={settled}
      aria-hidden="true"
    >
      <span className="xu-blob xu-blob-lead" style={blob}>
        {/* key = position : l'animation de gonflement rejoue à chaque déplacement. */}
        <span key={bulgeKey} className={`xu-blob-body ${color} ${settled ? `xu-bulge-${variant}` : ''}`}>
          {children}
        </span>
      </span>
      <span ref={trail} className="xu-blob xu-blob-trail" style={blob}>
        <span className={`xu-blob-body ${color}`} />
      </span>
    </div>
  );
}
