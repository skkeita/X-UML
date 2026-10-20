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
/** Distance minimale (px) entre un trajet de contournement et une classe. */
const CLEARANCE = 16;
/** Coût d'un virage (en px équivalents) : on préfère un trajet un peu plus long mais plus simple. */
const BEND_COST = 40;
/** Coût pour sortir d'une classe par un autre côté que celui prévu. */
const SIDE_COST = 30;
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
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const [a, b, c] = [out[i - 1], out[i], out[i + 1]];
    const colinear = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
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

/* ------------------------------------------------------------------ */
/* 4) Contournement garanti : recherche d'itinéraire (A*)              */
/* ------------------------------------------------------------------ */

/*
 * Quand le trajet simple heurte une classe, on cherche le meilleur trajet sur une grille
 * « creuse » dont les lignes passent à CLEARANCE px autour de chaque classe (graphe de
 * visibilité orthogonal). Toutes les classes — y compris les deux reliées — sont des obstacles :
 * le trait ne peut donc jamais en traverser une. Coût = longueur + pénalité par virage.
 */

const DIRS: Point[] = [
  { x: 0, y: -1 }, // haut
  { x: 1, y: 0 }, // droite
  { x: 0, y: 1 }, // bas
  { x: -1, y: 0 }, // gauche
];
const SIDE_DIR: Record<Side, number> = { top: 0, right: 1, bottom: 2, left: 3 };
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

function stubOf(r: Rect, side: Side, port: Point): Point {
  switch (side) {
    case 'top':
      return { x: port.x, y: r.y - CLEARANCE };
    case 'bottom':
      return { x: port.x, y: r.y + r.h + CLEARANCE };
    case 'left':
      return { x: r.x - CLEARANCE, y: port.y };
    case 'right':
      return { x: r.x + r.w + CLEARANCE, y: port.y };
  }
}

/** File de priorité minimale (tas binaire). */
class MinHeap<T> {
  private items: { k: number; v: T }[] = [];
  get size() {
    return this.items.length;
  }
  push(k: number, v: T) {
    const a = this.items;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0].v;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

interface Terminal {
  side: Side;
  port: Point;
  stub: Point;
  cost: number;
}

/**
 * Meilleur trajet orthogonal de A vers B évitant toutes les classes.
 * `portFor(box, side)` fournit le point d'ancrage à utiliser sur chaque côté.
 */
function searchRoute(
  a: Rect,
  b: Rect,
  all: Rect[],
  preferA: Side,
  preferB: Side,
  portFor: (r: Rect, side: Side, which: 'a' | 'b') => Point,
): Point[] | null {
  // Zones interdites : chaque classe agrandie de CLEARANCE - 1 (les lignes de la grille passent juste au-delà).
  const zones = all.map((r) => ({ x0: r.x - CLEARANCE + 1, y0: r.y - CLEARANCE + 1, x1: r.x + r.w + CLEARANCE - 1, y1: r.y + r.h + CLEARANCE - 1 }));
  const blocked = (x: number, y: number) => zones.some((z) => x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1);

  const terminals = (r: Rect, prefer: Side, which: 'a' | 'b'): Terminal[] =>
    SIDES.map((side) => {
      const port = portFor(r, side, which);
      return { side, port, stub: stubOf(r, side, port), cost: CLEARANCE + (side === prefer ? 0 : SIDE_COST) };
    }).filter((t) => !blocked(t.stub.x, t.stub.y));
  const starts = terminals(a, preferA, 'a');
  const goals = terminals(b, preferB, 'b');
  if (starts.length === 0 || goals.length === 0) return null;

  // Coordonnées de la grille : bords des zones, points de sortie, et un cadre extérieur.
  const xsSet = new Set<number>();
  const ysSet = new Set<number>();
  for (const r of all) {
    xsSet.add(r.x - CLEARANCE).add(r.x + r.w + CLEARANCE);
    ysSet.add(r.y - CLEARANCE).add(r.y + r.h + CLEARANCE);
  }
  for (const t of [...starts, ...goals]) {
    xsSet.add(t.stub.x);
    ysSet.add(t.stub.y);
  }
  const minX = Math.min(...xsSet) - 2 * CLEARANCE;
  const maxX = Math.max(...xsSet) + 2 * CLEARANCE;
  const minY = Math.min(...ysSet) - 2 * CLEARANCE;
  const maxY = Math.max(...ysSet) + 2 * CLEARANCE;
  xsSet.add(minX).add(maxX);
  ysSet.add(minY).add(maxY);
  const xs = [...xsSet].sort((p, q) => p - q);
  const ys = [...ysSet].sort((p, q) => p - q);
  const W = xs.length;
  const H = ys.length;
  const xi = new Map(xs.map((v, i) => [v, i]));
  const yi = new Map(ys.map((v, i) => [v, i]));

  // Validité des nœuds, calculée à la demande.
  const nodeOk = new Int8Array(W * H); // 0 inconnu, 1 libre, 2 bloqué
  const free = (i: number, j: number) => {
    const k = j * W + i;
    if (nodeOk[k] === 0) nodeOk[k] = blocked(xs[i], ys[j]) ? 2 : 1;
    return nodeOk[k] === 1;
  };

  const goalAt = new Map<number, Terminal[]>();
  for (const g of goals) {
    const k = (yi.get(g.stub.y) ?? 0) * W + (xi.get(g.stub.x) ?? 0);
    goalAt.set(k, [...(goalAt.get(k) ?? []), g]);
  }
  const h = (i: number, j: number) =>
    Math.min(...goals.map((g) => Math.abs(xs[i] - g.stub.x) + Math.abs(ys[j] - g.stub.y)));

  // État = (nœud, direction d'arrivée). Les états « terminaux » (> W*H*4) représentent l'arrivée sur un côté de B.
  const N = W * H * 4;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new MinHeap<number>();
  const startOf = new Map<number, Terminal>();

  for (const s of starts) {
    const i = xi.get(s.stub.x);
    const j = yi.get(s.stub.y);
    if (i === undefined || j === undefined) continue;
    const st = (j * W + i) * 4 + SIDE_DIR[s.side];
    if (s.cost < dist[st]) {
      dist[st] = s.cost;
      startOf.set(st, s);
      heap.push(s.cost + h(i, j), st);
    }
  }

  let best: { cost: number; state: number; goal: Terminal } | null = null;
  while (heap.size > 0) {
    const st = heap.pop()!;
    const node = st >> 2;
    const dir = st & 3;
    const g = dist[st];
    if (best && g + h(node % W, Math.floor(node / W)) >= best.cost) break;

    // Arrivée possible sur B depuis ce nœud ?
    for (const goal of goalAt.get(node) ?? []) {
      const inward = (SIDE_DIR[goal.side] + 2) % 4;
      const total = g + goal.cost + (dir === inward ? 0 : BEND_COST);
      if (!best || total < best.cost) best = { cost: total, state: st, goal };
    }

    const i = node % W;
    const j = Math.floor(node / W);
    for (let d = 0; d < 4; d++) {
      if (d === (dir + 2) % 4) continue; // pas de demi-tour
      const ni = i + DIRS[d].x;
      const nj = j + DIRS[d].y;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || !free(ni, nj)) continue;
      // Le segment ne doit pas traverser une zone interdite (milieu testé : la grille contient tous les bords).
      if (blocked((xs[i] + xs[ni]) / 2, (ys[j] + ys[nj]) / 2)) continue;
      const ng = g + Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]) + (d === dir ? 0 : BEND_COST);
      const ns = (nj * W + ni) * 4 + d;
      if (ng < dist[ns]) {
        dist[ns] = ng;
        prev[ns] = st;
        heap.push(ng + h(ni, nj), ns);
      }
    }
  }
  if (!best) return null;

  const chain: number[] = [];
  for (let st = best.state; st !== -1; st = prev[st]) chain.unshift(st);
  const start = startOf.get(chain[0]);
  if (!start) return null;
  const pts = chain.map((st) => {
    const node = st >> 2;
    return { x: xs[node % W], y: ys[Math.floor(node / W)] };
  });
  return [start.port, ...pts, best.goal.port];
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

/** Vrai si un segment intermédiaire (hors premier et dernier) entre dans l'une des deux classes reliées. */
function crossesOwn(points: Point[], a: Rect, b: Rect): boolean {
  for (let i = 1; i < points.length - 2; i++) {
    for (const r of [a, b]) {
      const p = points[i];
      const q = points[i + 1];
      if (Math.max(p.x, q.x) > r.x && Math.min(p.x, q.x) < r.x + r.w && Math.max(p.y, q.y) > r.y && Math.min(p.y, q.y) < r.y + r.h) return true;
    }
  }
  // Premier / dernier segment : ils doivent quitter leur classe, pas traverser l'autre.
  const first = [points[0], points[1]];
  const last = [points[points.length - 2], points[points.length - 1]];
  const inside = (p: Point, q: Point, r: Rect) =>
    Math.max(p.x, q.x) > r.x && Math.min(p.x, q.x) < r.x + r.w && Math.max(p.y, q.y) > r.y && Math.min(p.y, q.y) < r.y + r.h;
  return inside(first[0], first[1], b) || inside(last[0], last[1], a);
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

    // Lien réflexif : boucle carrée, du premier côté (droite, gauche, haut, bas) qui ne touche aucune autre classe.
    if (r.from === r.to) {
      const others = Object.entries(boxes)
        .filter(([name]) => name !== r.from)
        .map(([, rect]) => rect);
      const loops: { points: Point[]; label: Point }[] = [
        { points: [{ x: a.x + a.w, y: a.y + 18 }, { x: a.x + a.w + 36, y: a.y + 18 }, { x: a.x + a.w + 36, y: a.y + 48 }, { x: a.x + a.w, y: a.y + 48 }], label: { x: a.x + a.w + 42, y: a.y + 36 } },
        { points: [{ x: a.x, y: a.y + 18 }, { x: a.x - 36, y: a.y + 18 }, { x: a.x - 36, y: a.y + 48 }, { x: a.x, y: a.y + 48 }], label: { x: a.x - 42, y: a.y + 36 } },
        { points: [{ x: a.x + a.w - 48, y: a.y }, { x: a.x + a.w - 48, y: a.y - 30 }, { x: a.x + a.w - 18, y: a.y - 30 }, { x: a.x + a.w - 18, y: a.y }], label: { x: a.x + a.w - 33, y: a.y - 36 } },
        { points: [{ x: a.x + a.w - 48, y: a.y + a.h }, { x: a.x + a.w - 48, y: a.y + a.h + 30 }, { x: a.x + a.w - 18, y: a.y + a.h + 30 }, { x: a.x + a.w - 18, y: a.y + a.h }], label: { x: a.x + a.w - 33, y: a.y + a.h + 44 } },
      ];
      const loop = loops.find((l) => !collides(l.points, others)) ?? loops[0];
      edges.push({ relation: r, d: toPath(loop.points), points: loop.points, label: loop.label });
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
    // Le trajet simple doit rester à l'écart des autres classes ET ne pas recouper les deux classes reliées.
    if (collides(points, obstacles) || crossesOwn(points, a, b)) {
      const portFor = (box: Rect, side: Side, which: 'a' | 'b') => {
        if (which === 'a' && side === p.sideA) return pa;
        if (which === 'b' && side === p.sideB) return pb;
        return sideCenter(box, side);
      };
      const routed = searchRoute(a, b, Object.values(boxes), p.sideA, p.sideB, portFor);
      if (routed) points = routed;
    }

    points = simplify(points);
    edges.push({ relation: r, d: toPath(points), points, label: labelPoint(points) });
  });
  return edges;
}
