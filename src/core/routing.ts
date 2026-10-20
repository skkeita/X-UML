import type { Point, Rect, Relation, RelationKind } from './types';

/*
 * Routage orthogonal des liens : uniquement des segments horizontaux et verticaux.
 *
 * Choix UX :
 *  - Classes alignées → trait droit. Sinon → coude(s) automatique(s), en « Z ».
 *  - Les extrémités sont réparties sur le côté de la boîte (« ports ») : deux liens ne
 *    se superposent jamais au même point d'ancrage.
 *  - Héritage / réalisation vers une même classe → un seul point d'arrivée : les liens
 *    fusionnent en « arbre », la convention UML la plus lisible.
 *  - Si le trajet traverse une autre classe, on essaie des contournements en « U »
 *    par-dessus / par-dessous (ou par les côtés) et l'on garde le premier trajet libre.
 */

export interface EdgeGeometry {
  relation: Relation;
  /** Chemin SVG composé uniquement de segments horizontaux / verticaux. */
  d: string;
  /** Points du tracé (utile pour les tests et le placement des libellés). */
  points: Point[];
  label: Point;
}

type Side = 'top' | 'bottom' | 'left' | 'right';

const TREE_KINDS: RelationKind[] = ['inheritance', 'realization'];
/** Écart minimal (px) d'un trajet de contournement par rapport aux classes. */
const CLEARANCE = 24;
/** Chevauchement minimal pour tirer un trait parfaitement droit entre deux classes. */
const MIN_STRAIGHT_OVERLAP = 16;
/** Marge autour des classes pour la détection de collision. */
const HIT_PAD = 6;

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const isVerticalSide = (s: Side) => s === 'top' || s === 'bottom';

/** Point au milieu d'un côté. */
function sideCenter(r: Rect, s: Side): Point {
  switch (s) {
    case 'top':
      return { x: r.x + r.w / 2, y: r.y };
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h };
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 };
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 };
  }
}

/* ------------------------------------------------------------------ */
/* 1) Orientation principale de chaque lien                            */
/* ------------------------------------------------------------------ */

interface Plan {
  index: number;
  relation: Relation;
  a: Rect;
  b: Rect;
  /** true : sorties haut/bas (trajet vertical) ; false : sorties gauche/droite. */
  vertical: boolean;
  sideA: Side;
  sideB: Side;
}

function planEdge(index: number, relation: Relation, a: Rect, b: Rect): Plan {
  // Espace libre entre les boîtes sur chaque axe (négatif si elles se chevauchent sur cet axe).
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const ca = center(a);
  const cb = center(b);
  // Héritage / réalisation : la hiérarchie se lit de haut en bas → sortie verticale dès que possible.
  const vertical = TREE_KINDS.includes(relation.kind) && gapY > 0 ? true : gapY >= gapX;
  if (vertical) {
    const down = cb.y >= ca.y;
    return { index, relation, a, b, vertical, sideA: down ? 'bottom' : 'top', sideB: down ? 'top' : 'bottom' };
  }
  const right = cb.x >= ca.x;
  return { index, relation, a, b, vertical, sideA: right ? 'right' : 'left', sideB: right ? 'left' : 'right' };
}

/* ------------------------------------------------------------------ */
/* 2) Répartition des points d'ancrage (ports) sur les côtés           */
/* ------------------------------------------------------------------ */

interface PortGroup {
  box: Rect;
  side: Side;
  /** clé de port → coordonnée de tri (position de l'autre extrémité) et nombre de liens. */
  keys: Map<string, { sort: number; count: number }>;
}

function assignPorts(plans: Plan[]): Map<string, Point> {
  const groups = new Map<string, PortGroup>();
  const add = (boxName: string, box: Rect, side: Side, key: string, other: Rect) => {
    const gk = `${boxName}|${side}`;
    let g = groups.get(gk);
    if (!g) {
      g = { box, side, keys: new Map() };
      groups.set(gk, g);
    }
    const c = center(other);
    const sort = isVerticalSide(side) ? c.x : c.y;
    const k = g.keys.get(key);
    if (k) k.count++;
    else g.keys.set(key, { sort, count: 1 });
  };

  for (const p of plans) {
    add(p.relation.from, p.a, p.sideA, `e${p.index}`, p.b);
    const shared = TREE_KINDS.includes(p.relation.kind);
    add(p.relation.to, p.b, p.sideB, shared ? `tree-${p.relation.kind}` : `e${p.index}`, p.a);
  }

  const ports = new Map<string, Point>();
  for (const [gk, g] of groups) {
    const sorted = [...g.keys.entries()].sort((x, y) => x[1].sort - y[1].sort);
    const n = sorted.length;
    sorted.forEach(([key], i) => {
      const t = (i + 1) / (n + 1);
      const { box, side } = g;
      const pt: Point = isVerticalSide(side)
        ? { x: box.x + box.w * t, y: side === 'top' ? box.y : box.y + box.h }
        : { x: side === 'left' ? box.x : box.x + box.w, y: box.y + box.h * t };
      ports.set(`${gk}|${key}`, pt);
    });
  }
  return ports;
}

/* ------------------------------------------------------------------ */
/* 3) Construction des trajets                                         */
/* ------------------------------------------------------------------ */

/** Supprime les points en double et les points alignés inutiles. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const [a, b, c] = [out[i - 1], out[i], out[i + 1]];
    const colinear = (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
    if (colinear) out.splice(i, 1);
  }
  return out;
}

/** Trajet en « Z » entre deux ports qui se font face. */
function zRoute(pa: Point, pb: Point, vertical: boolean): Point[] {
  if (vertical) {
    if (Math.abs(pa.x - pb.x) < 1) return [pa, { x: pa.x, y: pb.y }];
    const midY = (pa.y + pb.y) / 2;
    return [pa, { x: pa.x, y: midY }, { x: pb.x, y: midY }, pb];
  }
  if (Math.abs(pa.y - pb.y) < 1) return [pa, { x: pb.x, y: pa.y }];
  const midX = (pa.x + pb.x) / 2;
  return [pa, { x: midX, y: pa.y }, { x: midX, y: pb.y }, pb];
}

/** Trajet en « U » : les deux extrémités sortent du même côté et se rejoignent au-delà. */
function uRoute(a: Rect, b: Rect, side: Side, level: number): Point[] {
  const pa = sideCenter(a, side);
  const pb = sideCenter(b, side);
  if (isVerticalSide(side)) return [pa, { x: pa.x, y: level }, { x: pb.x, y: level }, pb];
  return [pa, { x: level, y: pa.y }, { x: level, y: pb.y }, pb];
}

function segmentHitsRect(p: Point, q: Point, r: Rect): boolean {
  const minX = Math.min(p.x, q.x);
  const maxX = Math.max(p.x, q.x);
  const minY = Math.min(p.y, q.y);
  const maxY = Math.max(p.y, q.y);
  return maxX > r.x - HIT_PAD && minX < r.x + r.w + HIT_PAD && maxY > r.y - HIT_PAD && minY < r.y + r.h + HIT_PAD;
}

function collides(points: Point[], obstacles: Rect[]): Rect | null {
  for (let i = 0; i < points.length - 1; i++) {
    for (const r of obstacles) if (segmentHitsRect(points[i], points[i + 1], r)) return r;
  }
  return null;
}

/** Cherche un contournement en « U » libre ; la ligne de passage s'éloigne tant qu'elle heurte une classe. */
function detour(a: Rect, b: Rect, side: Side, obstacles: Rect[]): Point[] | null {
  let level =
    side === 'top'
      ? Math.min(a.y, b.y) - CLEARANCE
      : side === 'bottom'
        ? Math.max(a.y + a.h, b.y + b.h) + CLEARANCE
        : side === 'left'
          ? Math.min(a.x, b.x) - CLEARANCE
          : Math.max(a.x + a.w, b.x + b.w) + CLEARANCE;
  for (let attempt = 0; attempt < 8; attempt++) {
    const pts = uRoute(a, b, side, level);
    const hit = collides(pts, obstacles);
    if (!hit) return pts;
    level =
      side === 'top'
        ? hit.y - CLEARANCE
        : side === 'bottom'
          ? hit.y + hit.h + CLEARANCE
          : side === 'left'
            ? hit.x - CLEARANCE
            : hit.x + hit.w + CLEARANCE;
  }
  return null;
}

/**
 * Trajets à un seul coude (« L ») : sortie verticale puis entrée horizontale, ou l'inverse.
 * Renvoie uniquement les variantes géométriquement valides (chaque extrémité quitte bien sa boîte).
 */
function lRoutes(a: Rect, b: Rect): Point[][] {
  const ca = center(a);
  const cb = center(b);
  const out: Point[][] = [];
  // 1) A sort par le haut/bas, B est atteint par sa gauche/droite.
  {
    const pa = sideCenter(a, cb.y > ca.y ? 'bottom' : 'top');
    const pb = sideCenter(b, ca.x < cb.x ? 'left' : 'right');
    const okA = cb.y > ca.y ? pb.y > pa.y : pb.y < pa.y;
    const okB = ca.x < cb.x ? pa.x < pb.x : pa.x > pb.x;
    if (okA && okB) out.push([pa, { x: pa.x, y: pb.y }, pb]);
  }
  // 2) A sort par sa gauche/droite, B est atteint par le haut/bas.
  {
    const pa = sideCenter(a, cb.x > ca.x ? 'right' : 'left');
    const pb = sideCenter(b, ca.y < cb.y ? 'top' : 'bottom');
    const okA = cb.x > ca.x ? pb.x > pa.x : pb.x < pa.x;
    const okB = ca.y < cb.y ? pa.y < pb.y : pa.y > pb.y;
    if (okA && okB) out.push([pa, { x: pb.x, y: pa.y }, pb]);
  }
  return out;
}

function length(points: Point[]): number {
  let l = 0;
  for (let i = 0; i < points.length - 1; i++) l += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
  return l;
}

/** Libellé au milieu du segment le plus long (le plus lisible). */
function labelPoint(points: Point[]): Point {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const l = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
    if (l > bestLen) {
      bestLen = l;
      best = i;
    }
  }
  const p = points[best];
  const q = points[best + 1] ?? p;
  const horizontal = Math.abs(p.y - q.y) < 0.5;
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 - (horizontal ? 6 : 0) };
}

const toPath = (points: Point[]): string =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`).join(' ');

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                      */
/* ------------------------------------------------------------------ */

export function computeEdges(relations: Relation[], boxes: Record<string, Rect>): EdgeGeometry[] {
  const plans: Plan[] = [];
  relations.forEach((r, index) => {
    const a = boxes[r.from];
    const b = boxes[r.to];
    if (a && b && r.from !== r.to) plans.push(planEdge(index, r, a, b));
  });
  const ports = assignPorts(plans);

  // Combien de liens utilisent chaque côté : on ne redresse un lien en trait droit
  // que s'il est seul sur ses deux côtés (sinon les ports répartis priment).
  const sideUse = new Map<string, number>();
  for (const p of plans) {
    for (const k of [`${p.relation.from}|${p.sideA}`, `${p.relation.to}|${p.sideB}`]) sideUse.set(k, (sideUse.get(k) ?? 0) + 1);
  }

  const edges: EdgeGeometry[] = [];
  relations.forEach((r, index) => {
    const a = boxes[r.from];
    const b = boxes[r.to];
    if (!a || !b) return;

    // Lien réflexif : boucle carrée sur le côté droit.
    if (r.from === r.to) {
      const x = a.x + a.w;
      const y = a.y + 18;
      const points = [
        { x, y },
        { x: x + 36, y },
        { x: x + 36, y: y + 30 },
        { x, y: y + 30 },
      ];
      edges.push({ relation: r, d: toPath(points), points, label: { x: x + 42, y: y + 18 } });
      return;
    }

    const p = plans.find((pl) => pl.index === index);
    if (!p) return;
    const shared = TREE_KINDS.includes(r.kind);
    let pa = ports.get(`${r.from}|${p.sideA}|e${index}`) ?? sideCenter(a, p.sideA);
    let pb = ports.get(`${r.to}|${p.sideB}|${shared ? `tree-${r.kind}` : `e${index}`}`) ?? sideCenter(b, p.sideB);

    // Classes alignées (chevauchement suffisant sur l'axe transversal) → trait parfaitement droit.
    const alone = sideUse.get(`${r.from}|${p.sideA}`) === 1 && sideUse.get(`${r.to}|${p.sideB}`) === 1;
    if (alone) {
      const lo = p.vertical ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
      const hi = p.vertical ? Math.min(a.x + a.w, b.x + b.w) : Math.min(a.y + a.h, b.y + b.h);
      if (hi - lo >= MIN_STRAIGHT_OVERLAP) {
        const m = (lo + hi) / 2;
        if (p.vertical) {
          pa = { x: m, y: pa.y };
          pb = { x: m, y: pb.y };
        } else {
          pa = { x: pa.x, y: m };
          pb = { x: pb.x, y: m };
        }
      }
    }

    const obstacles = Object.entries(boxes)
      .filter(([name]) => name !== r.from && name !== r.to)
      .map(([, rect]) => rect);

    let points = zRoute(pa, pb, p.vertical);
    if (collides(points, obstacles)) {
      // Plan B, du plus simple au plus long : « Z » dans l'autre orientation, « L » à un coude,
      // puis contournements en « U ». On garde le plus court des trajets libres.
      const right = center(b).x > center(a).x;
      const down = center(b).y > center(a).y;
      const flipped = p.vertical
        ? zRoute(sideCenter(a, right ? 'right' : 'left'), sideCenter(b, right ? 'left' : 'right'), false)
        : zRoute(sideCenter(a, down ? 'bottom' : 'top'), sideCenter(b, down ? 'top' : 'bottom'), true);
      const sides: Side[] = ['top', 'bottom', 'left', 'right'];
      const candidates = [flipped, ...lRoutes(a, b), ...sides.map((s) => detour(a, b, s, obstacles))].filter(
        (c): c is Point[] => c !== null && !collides(c, obstacles),
      );
      if (candidates.length > 0) points = candidates.reduce((x, y) => (length(y) < length(x) ? y : x));
    }

    points = simplify(points);
    edges.push({ relation: r, d: toPath(points), points, label: labelPoint(points) });
  });
  return edges;
}
