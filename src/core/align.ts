import type { Point, Rect } from './types';

/*
 * Aligner et répartir une sélection : calcule les nouvelles positions (coin haut-gauche).
 * Fonctions pures, testées à part ; le canevas applique le résultat en une étape d'annulation.
 */

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hspace' | 'vspace';

export const ALIGN_MODES: { mode: AlignMode; label: string; min: number }[] = [
  { mode: 'left', label: 'Aligner à gauche', min: 2 },
  { mode: 'hcenter', label: 'Centrer sur un même axe vertical', min: 2 },
  { mode: 'right', label: 'Aligner à droite', min: 2 },
  { mode: 'top', label: 'Aligner en haut', min: 2 },
  { mode: 'vcenter', label: 'Centrer sur une même ligne horizontale', min: 2 },
  { mode: 'bottom', label: 'Aligner en bas', min: 2 },
  { mode: 'hspace', label: 'Répartir horizontalement (espaces égaux)', min: 3 },
  { mode: 'vspace', label: 'Répartir verticalement (espaces égaux)', min: 3 },
];

const round = (v: number) => Math.round(v);

/** Nouvelles positions des éléments ; ceux qui ne bougent pas sont omis. */
export function alignBoxes(boxes: Record<string, Rect>, mode: AlignMode): Record<string, Point> {
  const items = Object.entries(boxes);
  const out: Record<string, Point> = {};
  if (items.length < 2) return out;
  const minX = Math.min(...items.map(([, r]) => r.x));
  const maxX = Math.max(...items.map(([, r]) => r.x + r.w));
  const minY = Math.min(...items.map(([, r]) => r.y));
  const maxY = Math.max(...items.map(([, r]) => r.y + r.h));
  const set = (n: string, r: Rect, x: number, y: number) => {
    if (round(x) !== r.x || round(y) !== r.y) out[n] = { x: round(x), y: round(y) };
  };

  switch (mode) {
    case 'left':
      for (const [n, r] of items) set(n, r, minX, r.y);
      break;
    case 'right':
      for (const [n, r] of items) set(n, r, maxX - r.w, r.y);
      break;
    case 'hcenter': {
      const cx = (minX + maxX) / 2;
      for (const [n, r] of items) set(n, r, cx - r.w / 2, r.y);
      break;
    }
    case 'top':
      for (const [n, r] of items) set(n, r, r.x, minY);
      break;
    case 'bottom':
      for (const [n, r] of items) set(n, r, r.x, maxY - r.h);
      break;
    case 'vcenter': {
      const cy = (minY + maxY) / 2;
      for (const [n, r] of items) set(n, r, r.x, cy - r.h / 2);
      break;
    }
    case 'hspace':
    case 'vspace': {
      if (items.length < 3) break;
      const horiz = mode === 'hspace';
      // Ordre actuel conservé (de gauche à droite / de haut en bas) ; les deux extrémités ne bougent pas.
      const sorted = [...items].sort((a, b) => (horiz ? a[1].x + a[1].w / 2 - (b[1].x + b[1].w / 2) : a[1].y + a[1].h / 2 - (b[1].y + b[1].h / 2)));
      const first = sorted[0][1];
      const last = sorted[sorted.length - 1][1];
      const span = horiz ? last.x + last.w - first.x : last.y + last.h - first.y;
      const sizes = sorted.reduce((s, [, r]) => s + (horiz ? r.w : r.h), 0);
      const gap = (span - sizes) / (sorted.length - 1);
      let at = horiz ? first.x : first.y;
      for (const [n, r] of sorted) {
        if (horiz) set(n, r, at, r.y);
        else set(n, r, r.x, at);
        at += (horiz ? r.w : r.h) + gap;
      }
      break;
    }
  }
  // Aligner ne doit jamais empiler deux éléments : on les écarte sur l'autre axe, dans leur ordre actuel.
  if (mode === 'left' || mode === 'right' || mode === 'hcenter') unstack(items, out, 'y');
  if (mode === 'top' || mode === 'bottom' || mode === 'vcenter') unstack(items, out, 'x');
  return out;
}

const GAP = 40;
function unstack(items: [string, Rect][], out: Record<string, Point>, axis: 'x' | 'y') {
  const at = (n: string, r: Rect) => ({ ...r, ...(out[n] ?? {}) });
  const size = axis === 'y' ? 'h' : 'w';
  const sorted = items.map(([n, r]) => [n, at(n, r)] as const).sort((a, b) => a[1][axis] + a[1][size] / 2 - (b[1][axis] + b[1][size] / 2));
  let end = -Infinity;
  for (const [n, r] of sorted) {
    let start = r[axis];
    if (start < end + GAP && end > -Infinity) start = end + GAP;
    if (start !== r[axis]) out[n] = { x: axis === 'x' ? round(start) : r.x, y: axis === 'y' ? round(start) : r.y };
    end = start + r[size];
  }
}
