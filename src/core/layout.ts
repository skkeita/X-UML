import type { ClassNode, Diagram, Member, Point, Positions, Rect, Size } from './types';

/* ------------------------------------------------------------------ */
/* Mesure des boîtes (déterministe, sans mesurer le DOM)               */
/* ------------------------------------------------------------------ */

export const GRID = 10;
export const FONT_SIZE = 12;
export const FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const ROW_H = 20;
const CHAR_W = 7.4; // largeur moyenne d'un caractère monospace à 12 px
const PAD_X = 14;
const MIN_W = 140;
export const HEAD_H = 34;
export const HEAD_H_STEREO = 50;

export const memberLabel = (m: Member): string => `${m.visibility} ${m.text}`;

export const compartmentHeight = (count: number): number => (count === 0 ? 16 : count * ROW_H + 12);

export function splitMembers(c: ClassNode): { attrs: Member[]; methods: Member[] } {
  return {
    attrs: c.members.filter((m) => m.kind === 'attribute'),
    methods: c.members.filter((m) => m.kind === 'method'),
  };
}

export function headerHeight(c: ClassNode): number {
  return c.stereotype ? HEAD_H_STEREO : HEAD_H;
}

export function measureClass(c: ClassNode): Size {
  const { attrs, methods } = splitMembers(c);
  const longestMember = Math.max(0, ...c.members.map((m) => memberLabel(m).length));
  const widest = Math.max(c.name.length * 1.2, longestMember, c.stereotype ? c.stereotype.length + 4 : 0);
  const w = Math.max(MIN_W, Math.ceil(widest * CHAR_W + PAD_X * 2));
  const h = headerHeight(c) + compartmentHeight(attrs.length) + compartmentHeight(methods.length);
  return { w, h };
}

export function computeBoxes(diagram: Diagram, positions: Positions): Record<string, Rect> {
  const boxes: Record<string, Rect> = {};
  for (const c of diagram.classes) {
    const p = positions[c.name] ?? { x: 0, y: 0 };
    boxes[c.name] = { ...p, ...measureClass(c) };
  }
  return boxes;
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* ------------------------------------------------------------------ */
/* Placement automatique des NOUVELLES classes                         */
/* ------------------------------------------------------------------ */

const H_GAP = 60;
const V_GAP = 80;
const MARGIN = 40;
const MAX_PER_ROW = 4;

/** Profondeur hiérarchique : 0 = racine, +1 par niveau d'héritage / réalisation. */
function computeDepths(diagram: Diagram): Map<string, number> {
  const parents = new Map<string, string[]>();
  for (const r of diagram.relations) {
    if (r.kind === 'inheritance' || r.kind === 'realization') {
      parents.set(r.from, [...(parents.get(r.from) ?? []), r.to]);
    }
  }
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (name: string): number => {
    const cached = memo.get(name);
    if (cached !== undefined) return cached;
    if (visiting.has(name)) return 0; // cycle : on coupe
    visiting.add(name);
    const ps = parents.get(name) ?? [];
    const d = ps.length === 0 ? 0 : 1 + Math.max(...ps.map(depth));
    visiting.delete(name);
    memo.set(name, d);
    return d;
  };
  for (const c of diagram.classes) depth(c.name);
  return memo;
}

/** Disposition « idéale » en couches : parents en haut, enfants en dessous, lignes centrées. */
function idealLayout(diagram: Diagram): Positions {
  const depths = computeDepths(diagram);
  const layers = new Map<number, ClassNode[]>();
  for (const c of diagram.classes) {
    const d = depths.get(c.name) ?? 0;
    layers.set(d, [...(layers.get(d) ?? []), c]);
  }

  // Découpe chaque couche en lignes de MAX_PER_ROW boîtes maximum.
  const rows: ClassNode[][] = [];
  [...layers.keys()]
    .sort((a, b) => a - b)
    .forEach((d) => {
      const list = layers.get(d) ?? [];
      for (let i = 0; i < list.length; i += MAX_PER_ROW) rows.push(list.slice(i, i + MAX_PER_ROW));
    });

  const sizes = new Map(diagram.classes.map((c) => [c.name, measureClass(c)]));
  const rowWidth = (row: ClassNode[]) =>
    row.reduce((sum, c) => sum + (sizes.get(c.name)?.w ?? 0), 0) + H_GAP * (row.length - 1);
  const maxWidth = Math.max(0, ...rows.map(rowWidth));

  const out: Positions = {};
  let y = MARGIN;
  for (const row of rows) {
    let x = MARGIN + (maxWidth - rowWidth(row)) / 2;
    let rowH = 0;
    for (const c of row) {
      const s = sizes.get(c.name) ?? { w: MIN_W, h: 60 };
      out[c.name] = { x: snap(x), y: snap(y) };
      x += s.w + H_GAP;
      rowH = Math.max(rowH, s.h);
    }
    y += rowH + V_GAP;
  }
  return out;
}

export const snap = (v: number): number => Math.round(v / GRID) * GRID;

const overlaps = (a: Rect, b: Rect, pad = 20): boolean =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/**
 * Conserve les positions déjà connues (déplacées par l'utilisateur ou restaurées)
 * et ne place automatiquement que les classes qui n'en ont pas encore.
 * UX : taper du texte ne « réorganise » jamais ce que l'utilisateur a rangé à la main.
 */
export function layoutNewClasses(diagram: Diagram, known: Positions): Positions {
  const result: Positions = {};
  const names = new Set(diagram.classes.map((c) => c.name));
  for (const [name, p] of Object.entries(known)) if (names.has(name)) result[name] = p;

  const missing = diagram.classes.filter((c) => !result[c.name]);
  if (missing.length === 0) return result;

  const ideal = idealLayout(diagram);
  const placed: Rect[] = diagram.classes
    .filter((c) => result[c.name])
    .map((c) => ({ ...result[c.name], ...measureClass(c) }));

  for (const c of missing) {
    const size = measureClass(c);
    const p: Point = { ...(ideal[c.name] ?? { x: MARGIN, y: MARGIN }) };
    // Évite de poser une nouvelle boîte sur une boîte déjà déplacée.
    let guard = 0;
    while (placed.some((r) => overlaps({ ...p, ...size }, r)) && guard++ < 200) p.x += GRID * 4;
    result[c.name] = p;
    placed.push({ ...p, ...size });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Géométrie des liens : voir routing.ts (routage orthogonal)          */
/* ------------------------------------------------------------------ */

export { computeEdges, type EdgeGeometry } from './routing';
