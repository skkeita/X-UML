import { computeEdges, type EdgeAnchors, type EdgeGeometry } from './routing';
import type { ClassNode, Diagram, Group, LegendEntry, Member, Point, Positions, Rect, Size } from './types';

/* ------------------------------------------------------------------ */
/* Mesure des boîtes (déterministe, sans mesurer le DOM)               */
/* ------------------------------------------------------------------ */

export const GRID = 10;
export const FONT_SIZE = 12;
export const FONT_FAMILY = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
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

/** Texte affiché pour un élément (libellé s'il diffère de l'identifiant). */
export const displayName = (c: ClassNode): string => c.label ?? c.name;

/** Taille d'un élément selon sa nature (classe, acteur, cas d'utilisation, objet, système, paquetage). */
export function measureClass(c: ClassNode): Size {
  const text = displayName(c);
  switch (c.kind) {
    case 'actor':
      return { w: 60, h: 96 };
    case 'usecase':
      return { w: Math.max(130, Math.ceil(text.length * 7.6 + 56)), h: 58 };
    case 'object':
      return { w: Math.max(110, Math.ceil(text.length * CHAR_W + 32)), h: 42 };
    case 'system':
      return { w: Math.max(170, Math.ceil(text.length * 8.6 + 48)), h: 76 };
    case 'package':
      return { w: Math.max(140, Math.ceil(text.length * 8.6 + 40)), h: 74 };
    default:
      return measureClassBox(c);
  }
}

function measureClassBox(c: ClassNode): Size {
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
function computeDepths(diagram: Diagram, byDependency = false): Map<string, number> {
  const parents = new Map<string, string[]>();
  for (const r of diagram.relations) {
    if (byDependency) {
      // Paquetages : celui qui dépend est au-dessus de celui dont il dépend (lecture de haut en bas).
      if (r.kind === 'dependency' || r.kind === 'directed') parents.set(r.to, [...(parents.get(r.to) ?? []), r.from]);
    } else if (r.kind === 'inheritance' || r.kind === 'realization') {
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

/** Disposition en couches d'une liste d'éléments : parents en haut, enfants en dessous, lignes centrées. */
function layeredBlock(diagram: Diagram, nodes: ClassNode[]): { pos: Positions; w: number; h: number } {
  const depths = computeDepths(diagram, nodes.length > 0 && nodes.every((c) => c.kind === 'package'));
  const layers = new Map<number, ClassNode[]>();
  for (const c of nodes) {
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
  const sizes = new Map(nodes.map((c) => [c.name, measureClass(c)]));
  // Écart entre deux voisins : assez large pour le libellé des liaisons qui passent entre eux
  // (messages d'un diagramme de communication, rôles d'une association) — sinon il chevauche les boîtes.
  const gapsOf = (row: ClassNode[]): number[] =>
    row.slice(1).map((_, i) => {
      const left = new Set(row.slice(0, i + 1).map((c) => c.name));
      const right = new Set(row.slice(i + 1).map((c) => c.name));
      let widest = 0;
      for (const r of diagram.relations) {
        if (!r.label) continue;
        const crosses = (left.has(r.from) && right.has(r.to)) || (left.has(r.to) && right.has(r.from));
        if (crosses) widest = Math.max(widest, r.label.replace(/<<|>>/g, '«').length * 6.7 + 8);
      }
      return Math.max(H_GAP, Math.ceil(widest + 36));
    });
  const rowWidth = (row: ClassNode[]) =>
    row.reduce((sum, c) => sum + (sizes.get(c.name)?.w ?? 0), 0) + gapsOf(row).reduce((a, g) => a + g, 0);
  const maxWidth = Math.max(0, ...rows.map(rowWidth));
  const pos: Positions = {};
  let y = 0;
  for (const row of rows) {
    const gaps = gapsOf(row);
    let x = (maxWidth - rowWidth(row)) / 2;
    let rowH = 0;
    row.forEach((c, i) => {
      const sz = sizes.get(c.name) ?? { w: MIN_W, h: 60 };
      pos[c.name] = { x, y };
      x += sz.w + (gaps[i] ?? 0);
      rowH = Math.max(rowH, sz.h);
    });
    y += rowH + V_GAP;
  }
  return { pos, w: maxWidth, h: Math.max(0, y - V_GAP) };
}

/** Colonne d'éléments (acteurs à côté d'un système). */
function columnBlock(nodes: ClassNode[]): { pos: Positions; w: number; h: number } {
  const pos: Positions = {};
  let y = 0;
  let w = 0;
  for (const c of nodes) {
    const sz = measureClass(c);
    pos[c.name] = { x: 0, y };
    y += sz.h + 50;
    w = Math.max(w, sz.w);
  }
  return { pos, w, h: Math.max(0, y - 50) };
}

/** Contexte statique : le système au centre, les autres éléments répartis tout autour. */
function ringBlock(center: ClassNode, around: ClassNode[]): { pos: Positions; w: number; h: number } {
  const cs = measureClass(center);
  const pos: Positions = { [center.name]: { x: 0, y: 0 } };
  const n = around.length;
  const rx = cs.w / 2 + 230;
  const ry = cs.h / 2 + 170;
  around.forEach((c, i) => {
    const sz = measureClass(c);
    // Départ à gauche, sens horaire : les premiers acteurs à gauche, puis en haut, à droite, en bas.
    const a = Math.PI + (2 * Math.PI * i) / n;
    pos[c.name] = { x: cs.w / 2 + rx * Math.cos(a) - sz.w / 2, y: cs.h / 2 + ry * Math.sin(a) - sz.h / 2 };
  });
  const minX = Math.min(...Object.values(pos).map((p) => p.x));
  const minY = Math.min(...Object.values(pos).map((p) => p.y));
  for (const p of Object.values(pos)) {
    p.x -= minX;
    p.y -= minY;
  }
  return { pos, w: 2 * rx + cs.w, h: 2 * ry + cs.h };
}

/**
 * Disposition « idéale » d'un tableau blanc :
 *  - les membres d'un même groupe (package, système, cadre) sont placés ensemble, dans son cadre
 *    (récursivement : un système dans un cadre de diagramme garde ses acteurs à l'extérieur) ;
 *  - les acteurs libres se rangent en colonne à gauche (et à droite s'ils sont nombreux) ;
 *  - un système seul avec ses acteurs (contexte statique) : système au centre, acteurs autour ;
 *  - le reste suit la disposition en couches (diagramme de classes).
 */
function idealLayout(diagram: Diagram): Positions {
  const b = arrange(diagram, diagram.classes, diagram.groups ?? []);
  const out: Positions = {};
  for (const [name, p] of Object.entries(b.pos)) out[name] = { x: snap(MARGIN + p.x), y: snap(MARGIN + p.y) };
  return out;
}

type Block = { pos: Positions; w: number; h: number };

function arrange(diagram: Diagram, nodes: ClassNode[], groups: Group[]): Block {
  const names = new Set(nodes.map((c) => c.name));
  const byName = new Map(nodes.map((c) => [c.name, c]));
  const local = groups.filter((g) => g.members.length > 0 && g.members.every((m) => names.has(m)));
  const contains = (o: Group, g: Group) => o !== g && o.members.length > g.members.length && g.members.every((m) => o.members.includes(m));
  // Groupes « racines » à ce niveau : non contenus dans un autre groupe local.
  const roots = local.filter((g) => !local.some((o) => contains(o, g)));
  const inGroup = new Set(roots.flatMap((g) => g.members));
  const free = nodes.filter((c) => !inGroup.has(c.name));
  const freeActors = free.filter((c) => c.kind === 'actor');
  const freeSystems = free.filter((c) => c.kind === 'system');
  const others = free.filter((c) => c.kind !== 'actor' && c.kind !== 'system');

  const PAD_TOP = 18 + 26; // marge d'un cadre + son titre
  const clusters: Block[] = roots.map((g) => {
    const members = g.members.map((m) => byName.get(m)).filter((c): c is ClassNode => !!c);
    const inner = local.filter((o) => contains(g, o));
    const b = inner.length
      ? arrange(diagram, members, inner)
      : members.length > 0 && members.every((c) => c.kind === 'usecase')
        ? gridBlock(members, members.length <= 4 ? 1 : 2) // cas d'utilisation : en colonne(s), comme en UML
        : arrange(diagram, members, []);
    // On réserve la place du cadre autour du groupe.
    for (const p of Object.values(b.pos)) {
      p.x += 18;
      p.y += PAD_TOP;
    }
    return { pos: b.pos, w: b.w + 36, h: b.h + PAD_TOP + 18 };
  });

  const blocks: Block[] = [];
  if (freeSystems.length === 1 && clusters.length === 0 && free.length > 1) {
    // Contexte statique : tout ce qui est libre tourne autour du système.
    blocks.push(ringBlock(freeSystems[0], [...freeActors, ...others]));
  } else if (clusters.length === 0 && freeActors.length === 0) {
    return layeredBlock(diagram, nodes);
  } else {
    const half = freeActors.length > 3 ? Math.ceil(freeActors.length / 2) : freeActors.length;
    if (freeActors.length) blocks.push(columnBlock(freeActors.slice(0, half)));
    blocks.push(...clusters);
    if (freeActors.length > half) blocks.push(columnBlock(freeActors.slice(half)));
    const rest = [...freeSystems, ...others];
    if (rest.length) blocks.push(layeredBlock(diagram, rest));
  }
  return pack(blocks);
}

/** Blocs côte à côte (centrés verticalement), avec retour à la ligne au-delà de MAX_ROW_W. */
function pack(blocks: Block[]): Block {
  const out: Positions = {};
  const rows: Block[][] = [];
  let width = 0;
  for (const b of blocks) {
    if (rows.length === 0 || (width + b.w > MAX_ROW_W && rows[rows.length - 1].length > 0)) {
      rows.push([]);
      width = 0;
    }
    rows[rows.length - 1].push(b);
    width += b.w + BLOCK_GAP;
  }
  let y = 0;
  let w = 0;
  for (const row of rows) {
    const rowH = Math.max(0, ...row.map((b) => b.h));
    let x = 0;
    for (const b of row) {
      const dy = y + (rowH - b.h) / 2;
      for (const [name, p] of Object.entries(b.pos)) out[name] = { x: x + p.x, y: dy + p.y };
      x += b.w + BLOCK_GAP;
    }
    w = Math.max(w, x - BLOCK_GAP);
    y += rowH + BLOCK_GAP;
  }
  return { pos: out, w, h: Math.max(0, y - BLOCK_GAP) };
}

const MAX_ROW_W = 1300;
const BLOCK_GAP = 120;

/** Grille de `cols` colonnes (cas d'utilisation dans un système). */
function gridBlock(nodes: ClassNode[], cols: number): { pos: Positions; w: number; h: number } {
  const sizes = nodes.map((c) => measureClass(c));
  const colW = Math.max(...sizes.map((s) => s.w));
  const pos: Positions = {};
  let h = 0;
  nodes.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const y = row * (sizes[i].h + 40);
    pos[c.name] = { x: col * (colW + 60) + (colW - sizes[i].w) / 2, y };
    h = Math.max(h, y + sizes[i].h);
  });
  return { pos, w: cols * colW + (cols - 1) * 60, h };
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

/* ------------------------------------------------------------------ */
/* Groupes : cadres autour de leurs membres                            */
/* ------------------------------------------------------------------ */

/** Marge intérieure d'un cadre ; le haut laisse la place au titre / à l'onglet. */
const FRAME_PAD = 18;
const FRAME_TITLE = 26;

/**
 * Rectangle de chaque groupe : englobe ses membres et les groupes qu'il contient entièrement,
 * avec une marge (un cadre imbriqué reste ainsi visible à l'intérieur de son parent).
 */
export function computeFrames(groups: Group[], boxes: Record<string, Rect>): Record<string, Rect> {
  const frames: Record<string, Rect> = {};
  const sorted = [...groups].sort((a, b) => a.members.length - b.members.length);
  for (const g of sorted) {
    const inner = sorted.filter((o) => o !== g && frames[o.name] && o.members.every((m) => g.members.includes(m)));
    const rects = [...g.members.map((m) => boxes[m]).filter(Boolean), ...inner.map((o) => frames[o.name])];
    const b = boundsOf(rects);
    if (!b) continue;
    frames[g.name] = { x: b.x - FRAME_PAD, y: b.y - FRAME_PAD - FRAME_TITLE, w: b.w + 2 * FRAME_PAD, h: b.h + 2 * FRAME_PAD + FRAME_TITLE };
  }
  return frames;
}

export interface Scene {
  boxes: Record<string, Rect>;
  frames: Record<string, Rect>;
  edges: EdgeGeometry[];
}

/** Tout ce qu'il faut pour dessiner : boîtes, cadres de groupes et tracés des liens. */
export function computeScene(diagram: Diagram, positions: Positions, anchors?: Record<string, EdgeAnchors>): Scene {
  return sceneFromBoxes(diagram, computeBoxes(diagram, positions), anchors);
}

/** Variante à partir des boîtes déjà calculées (export). */
export function sceneFromBoxes(diagram: Diagram, boxes: Record<string, Rect>, anchors?: Record<string, EdgeAnchors>): Scene {
  const frames = computeFrames(diagram.groups ?? [], boxes);
  const shapes: Record<string, 'ellipse' | 'actor'> = {};
  for (const c of diagram.classes) {
    if (c.kind === 'usecase') shapes[c.name] = 'ellipse';
    else if (c.kind === 'actor') shapes[c.name] = 'actor';
  }
  const edges = computeEdges(diagram.relations, { ...boxes, ...frames }, { frames: new Set(Object.keys(frames)), shapes, anchors });
  return { boxes, frames, edges };
}

/* ------------------------------------------------------------------ */
/* Classes jamais superposées                                          */
/* ------------------------------------------------------------------ */

/** Espace minimal entre deux classes : assez pour qu'un trait passe entre elles sans les toucher. */
export const MIN_GAP = 40;

/**
 * Si la classe lâchée chevauche (ou frôle) une autre classe, renvoie la position libre la plus proche,
 * cherchée en anneaux successifs sur la grille. Sinon renvoie la position telle quelle.
 * UX : deux classes empilées masqueraient forcément des traits ; on l'empêche au lâcher,
 * sans gêner le glisser lui-même.
 */
export function resolveOverlap(p: Point, size: Size, others: Rect[], gap = MIN_GAP): Point {
  const clash = (q: Point) =>
    others.some((r) => q.x < r.x + r.w + gap && q.x + size.w + gap > r.x && q.y < r.y + r.h + gap && q.y + size.h + gap > r.y);
  if (!clash(p)) return p;
  for (let ring = 1; ring <= 80; ring++) {
    let best: Point | null = null;
    let bestD = Infinity;
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue; // seulement le bord de l'anneau
        const q = { x: p.x + dx * GRID, y: p.y + dy * GRID };
        if (clash(q)) continue;
        const d = Math.hypot(dx, dy);
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
    }
    if (best) return best;
  }
  return p;
}

/* ------------------------------------------------------------------ */
/* Légende                                                            */
/* ------------------------------------------------------------------ */

export interface LegendBox extends Rect {
  title: string;
  entries: LegendEntry[];
}
export const LEGEND_ROW = 22;
const LEGEND_HEAD = 30;

/** Légende sous le diagramme, alignée à droite : elle ne recouvre jamais un élément. */
export function legendBox(diagram: Diagram, content: Rect[]): LegendBox | null {
  const st = diagram.style;
  if (!st || st.legendHidden || st.legend.length === 0) return null;
  const title = st.legendTitle?.trim() || 'Légende';
  const w = Math.ceil(Math.max(title.length * 8 + 28, ...st.legend.map((e) => e.label.length * 7.4 + 52)));
  const h = LEGEND_HEAD + st.legend.length * LEGEND_ROW + 6;
  const b = boundsOf(content) ?? { x: 0, y: 0, w, h: 0 };
  return { x: b.x + b.w - w, y: b.y + b.h + 28, w, h, title, entries: st.legend };
}
