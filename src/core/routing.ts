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
/** Écart minimal (px) entre deux points d'ancrage d'un même côté de classe (pointes lisibles). */
const MIN_PORT_GAP = 16;
/** En dessous de cet écart (px) entre les deux extrémités, on redresse le lien en trait droit. */
const MAX_JOG = 32;
/** Distance minimale (px) entre un trajet de contournement et une classe. */
const CLEARANCE = 16;
/** Coût d'un virage (en px équivalents) : on préfère un trajet un peu plus long mais plus simple. */
const BEND_COST = 40;
/** En dessous de cet écart (px), deux traits parallèles semblent n'en faire qu'un. */
const NEAR_GAP = 10;
/** Coût pour emprunter un segment déjà occupé par un autre lien (les deux traits se confondraient). */
const OVERLAP_COST = 400;
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
  occupied: Point[][] = [],
  /** Zones à éviter en plus des classes (pointes de flèche des autres liens). */
  extraZones: Zone[] = [],
): Point[] | null {
  // Segments déjà dessinés par les autres liens : on évite de rouler dessus.
  const used: { horiz: boolean; c: number; lo: number; hi: number }[] = [];
  for (const path of occupied) {
    for (let k = 0; k < path.length - 1; k++) {
      const p = path[k];
      const q = path[k + 1];
      if (Math.abs(p.y - q.y) < 0.01) used.push({ horiz: true, c: p.y, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) });
      else used.push({ horiz: false, c: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) });
    }
  }
  const overlapCost = (x1: number, y1: number, x2: number, y2: number) => {
    const horiz = Math.abs(y1 - y2) < 0.01;
    const c = horiz ? y1 : x1;
    const lo = horiz ? Math.min(x1, x2) : Math.min(y1, y2);
    const hi = horiz ? Math.max(x1, x2) : Math.max(y1, y2);
    // Deux traits parallèles à moins de NEAR_GAP px se lisent comme un seul trait épais : même pénalité.
    for (const u of used) if (u.horiz === horiz && Math.abs(u.c - c) < NEAR_GAP && Math.min(u.hi, hi) - Math.max(u.lo, lo) > 2) return OVERLAP_COST;
    return 0;
  };
  // Zones interdites : chaque classe agrandie de CLEARANCE - 1 (les lignes de la grille passent juste au-delà).
  const zones = [
    ...all.map((r) => ({ x0: r.x - CLEARANCE + 1, y0: r.y - CLEARANCE + 1, x1: r.x + r.w + CLEARANCE - 1, y1: r.y + r.h + CLEARANCE - 1 })),
    ...extraZones,
  ];
  const blocked = (x: number, y: number) => zones.some((z) => x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1);

  const terminals = (r: Rect, prefer: Side, which: 'a' | 'b'): Terminal[] =>
    SIDES.map((side) => {
      const port = portFor(r, side, which);
      return { side, port, stub: stubOf(r, side, port), cost: CLEARANCE + (side === prefer ? 0 : SIDE_COST) };
    }).filter(
      // Ni le point de sortie, ni le petit segment ancrage → sortie ne doivent toucher une zone réservée.
      (t) => !blocked(t.stub.x, t.stub.y) && !extraZones.some((z) => segHitsZone(t.port, t.stub, z)),
    );
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
  for (const z of extraZones) {
    xsSet.add(z.x0).add(z.x1);
    ysSet.add(z.y0).add(z.y1);
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
      const ng =
        g +
        Math.abs(xs[ni] - xs[i]) +
        Math.abs(ys[nj] - ys[j]) +
        (d === dir ? 0 : BEND_COST) +
        overlapCost(xs[i], ys[j], xs[ni], ys[nj]);
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

/**
 * Supprime une petite « marche » juste avant d'arriver sur une classe (ou juste après en être sorti) :
 * le point d'ancrage glisse le long du côté de la classe pour s'aligner sur le trajet.
 */
function removeEndJogs(
  points: Point[],
  a: Rect,
  b: Rect,
  keepEnd: boolean,
  okPort: (which: 'a' | 'b', p: Point) => boolean = () => true,
): Point[] {
  const pts = points.map((p) => ({ ...p }));
  const fix = (port: number, stub: number, jogEnd: number, before: number, box: Rect, which: 'a' | 'b') => {
    const [p0, p1, p2, p3] = [pts[port], pts[stub], pts[jogEnd], pts[before]];
    if (!p0 || !p1 || !p2 || !p3) return;
    const horizontalEnd = Math.abs(p0.y - p1.y) < 0.01 && Math.abs(p2.y - p3.y) < 0.01 && Math.abs(p1.x - p2.x) < 0.01;
    const verticalEnd = Math.abs(p0.x - p1.x) < 0.01 && Math.abs(p2.x - p3.x) < 0.01 && Math.abs(p1.y - p2.y) < 0.01;
    if (horizontalEnd && Math.abs(p1.y - p2.y) < MAX_JOG && p2.y >= box.y + 6 && p2.y <= box.y + box.h - 6 && okPort(which, { x: p0.x, y: p2.y })) {
      p0.y = p2.y;
      p1.y = p2.y;
    } else if (verticalEnd && Math.abs(p1.x - p2.x) < MAX_JOG && p2.x >= box.x + 6 && p2.x <= box.x + box.w - 6 && okPort(which, { x: p2.x, y: p0.y })) {
      p0.x = p2.x;
      p1.x = p2.x;
    }
  };
  const n = pts.length;
  if (n >= 4) {
    fix(0, 1, 2, 3, a, 'a');
    if (!keepEnd) fix(n - 1, n - 2, n - 3, n - 4, b, 'b');
  }
  return simplify(pts);
}

/* ------------------------------------------------------------------ */
/* 5) Lisibilité : pointes de flèche dégagées, libellés bien placés    */
/* ------------------------------------------------------------------ */

export interface Zone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Longueur (px) dégagée devant chaque extrémité de lien : la pointe de flèche y est dessinée. */
const ARROW_ZONE = 26;
/** Demi-largeur de cette zone. */
const ARROW_HALF = 12;

/** Zones des deux extrémités d'un tracé (là où sont dessinées pointes de flèche et losanges). */
function endZones(pts: Point[]): { zone: Zone; port: Point }[] {
  if (pts.length < 2) return [];
  const make = (p0: Point, p1: Point) => {
    const len = Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y);
    const k = Math.min(ARROW_ZONE, len) / (len || 1);
    const far = { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k };
    const horizontal = Math.abs(p0.y - p1.y) < 0.01;
    const zone: Zone = horizontal
      ? { x0: Math.min(p0.x, far.x), x1: Math.max(p0.x, far.x), y0: p0.y - ARROW_HALF, y1: p0.y + ARROW_HALF }
      : { x0: p0.x - ARROW_HALF, x1: p0.x + ARROW_HALF, y0: Math.min(p0.y, far.y), y1: Math.max(p0.y, far.y) };
    return { zone, port: p0 };
  };
  return [make(pts[0], pts[1]), make(pts[pts.length - 1], pts[pts.length - 2])];
}

const segHitsZone = (p: Point, q: Point, z: Zone) =>
  Math.max(p.x, q.x) > z.x0 && Math.min(p.x, q.x) < z.x1 && Math.max(p.y, q.y) > z.y0 && Math.min(p.y, q.y) < z.y1;

const pathHitsZones = (pts: Point[], zones: Zone[]) =>
  pts.some((p, i) => i > 0 && zones.some((z) => segHitsZone(pts[i - 1], p, z)));

/**
 * Vrai si un segment de `pts` longe (à moins de NEAR_GAP px, sur plus de 12 px) un segment d'un autre tracé.
 * Les deux premiers / derniers px autour d'un ancrage partagé (arbre d'héritage) ne comptent pas.
 */
function runsAlong(pts: Point[], others: Point[][]): boolean {
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const q = pts[i];
    const horiz = Math.abs(p.y - q.y) < 0.01;
    const c = horiz ? p.y : p.x;
    const lo = horiz ? Math.min(p.x, q.x) : Math.min(p.y, q.y);
    const hi = horiz ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
    for (const o of others) {
      for (let k = 1; k < o.length; k++) {
        const r = o[k - 1];
        const t = o[k];
        const oh = Math.abs(r.y - t.y) < 0.01;
        if (oh !== horiz) continue;
        const oc = oh ? r.y : r.x;
        if (Math.abs(oc - c) >= NEAR_GAP || Math.abs(oc - c) < 0.01) continue; // confondus = arbre volontaire
        const olo = oh ? Math.min(r.x, t.x) : Math.min(r.y, t.y);
        const ohi = oh ? Math.max(r.x, t.x) : Math.max(r.y, t.y);
        if (Math.min(hi, ohi) - Math.max(lo, olo) > 12) return true;
      }
    }
  }
  return false;
}

/** Deux liens fusionnés volontairement en arbre : héritages (ou réalisations) vers la même classe. */
const treeMates = (x: Relation, y: Relation) => TREE_KINDS.includes(x.kind) && x.kind === y.kind && x.to === y.to;

/**
 * Zones des pointes des AUTRES liens. Seul un « arbre » (même type d'héritage vers la même classe)
 * peut partager un point d'arrivée ; deux liens de nature différente ne se touchent jamais au bout.
 */
function foreignZones(edges: EdgeGeometry[], self: number): Zone[] {
  const me = edges[self];
  const out: Zone[] = [];
  edges.forEach((e, j) => {
    if (j === self) return;
    const mate = treeMates(me.relation, e.relation);
    const pts = e.points;
    endZones(pts).forEach(({ zone }, k) => {
      // L'arrivée d'un « frère » d'héritage peut être partagée (tronc commun) ; son départ, jamais.
      if (mate && k === 1) return;
      out.push(zone);
    });
  });
  return out;
}

/** Position d'une multiplicité près d'une extrémité (à côté du trait, jamais dessus). */
export function multPosition(pts: Point[], end: 'start' | 'end'): Point {
  const [p, q] = end === 'start' ? [pts[0], pts[1]] : [pts[pts.length - 1], pts[pts.length - 2]];
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const dx = (q.x - p.x) / len;
  const dy = (q.y - p.y) / len;
  return { x: p.x + dx * 18 - dy * 11, y: p.y + dy * 18 + dx * 11 + 4 };
}

/** Zone occupée par le texte d'une multiplicité (ligne de base en `at.y`). */
function multZone(at: Point, text: string): Zone {
  const w = text.length * 6.7 + 4;
  return { x0: at.x - w / 2, x1: at.x + w / 2, y0: at.y - 11, y1: at.y + 3 };
}

/** Largeur approximative d'un libellé (police monospace 11 px). */
const labelWidth = (text: string) => text.length * 6.7 + 8;

/**
 * Place le libellé d'un lien là où il ne masque rien : on essaie le long de chaque segment
 * (du plus long au plus court), au-dessus / en dessous ou à droite / à gauche du trait,
 * et l'on garde la première position qui ne touche ni classe, ni autre trait, ni pointe de flèche.
 */
function placeLabel(e: EdgeGeometry, edges: EdgeGeometry[], boxes: Rect[], taken: Zone[]): Point {
  const text = e.relation.label;
  if (!text) return e.label;
  const w = labelWidth(text);
  const pts = e.points;
  const segs = pts
    .slice(1)
    .map((q, i) => ({ p: pts[i], q, len: Math.abs(q.x - pts[i].x) + Math.abs(q.y - pts[i].y) }))
    .sort((s1, s2) => s2.len - s1.len);
  const others = edges.filter((o) => o !== e);
  const zones = edges.flatMap((o) => endZones(o.points).map((z) => z.zone));
  const free = (r: Zone) =>
    !boxes.some((b) => r.x1 > b.x - 2 && r.x0 < b.x + b.w + 2 && r.y1 > b.y - 2 && r.y0 < b.y + b.h + 2) &&
    !others.some((o) => o.points.some((q, i) => i > 0 && segHitsZone(o.points[i - 1], q, r))) &&
    !zones.some((z) => r.x1 > z.x0 && r.x0 < z.x1 && r.y1 > z.y0 && r.y0 < z.y1) &&
    !taken.some((z) => r.x1 > z.x0 && r.x0 < z.x1 && r.y1 > z.y0 && r.y0 < z.y1);

  // 1er passage : le libellé tient le long d'un segment ; 2e passage : il peut déborder (segment trop court).
  for (const overflow of [false, true]) {
  for (const { p, q, len } of segs) {
    const horizontal = Math.abs(p.y - q.y) < 0.01;
    if (!overflow && horizontal && len < w + 8) continue;
    if (!overflow && !horizontal && len < 24) continue;
    if (overflow && len < 16) continue;
    // Plusieurs positions le long du segment : milieu d'abord, puis vers chaque extrémité.
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const mx = p.x + (q.x - p.x) * t;
      const my = p.y + (q.y - p.y) * t;
      const candidates: { at: Point; box: Zone }[] = horizontal
        ? [
            { at: { x: mx, y: my - 6 }, box: { x0: mx - w / 2, x1: mx + w / 2, y0: my - 18, y1: my - 3 } },
            { at: { x: mx, y: my + 15 }, box: { x0: mx - w / 2, x1: mx + w / 2, y0: my + 3, y1: my + 18 } },
          ]
        : [
            { at: { x: mx + 6 + w / 2, y: my + 4 }, box: { x0: mx + 4, x1: mx + 8 + w, y0: my - 8, y1: my + 8 } },
            { at: { x: mx - 6 - w / 2, y: my + 4 }, box: { x0: mx - 8 - w, x1: mx - 4, y0: my - 8, y1: my + 8 } },
          ];
      for (const c of candidates) {
        // Le libellé doit rester le long du segment (pas au-delà de ses extrémités)… sauf en dernier recours.
        const inside = horizontal
          ? c.box.x0 >= Math.min(p.x, q.x) - 2 && c.box.x1 <= Math.max(p.x, q.x) + 2
          : c.box.y0 >= Math.min(p.y, q.y) - 2 && c.box.y1 <= Math.max(p.y, q.y) + 2;
        if ((inside || overflow) && free(c.box)) {
          taken.push(c.box);
          return c.at;
        }
      }
    }
  }
  }
  return e.label;
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

export interface RouteOptions {
  /** Cadres de groupes : extrémités possibles d'un lien, mais jamais des obstacles (ils sont « transparents »). */
  frames?: Set<string>;
  /** Formes non rectangulaires : l'extrémité du lien est ramenée sur la forme réelle. */
  shapes?: Record<string, 'ellipse' | 'actor'>;
}

export function computeEdges(relations: Relation[], boxes: Record<string, Rect>, opts: RouteOptions = {}): EdgeGeometry[] {
  const frames = opts.frames ?? new Set<string>();
  /** Seuls les éléments (pas les cadres) bloquent le passage des liens. */
  const solid = Object.entries(boxes)
    .filter(([name]) => !frames.has(name))
    .map(([, rect]) => rect);
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

  // Nombre de liens qui arrivent sur un même point partagé (arbre d'héritage).
  const treeUse = new Map<string, number>();
  for (const p of plans) {
    if (!TREE_KINDS.includes(p.relation.kind)) continue;
    const k = `${p.relation.to}|${p.sideB}|${p.relation.kind}`;
    treeUse.set(k, (treeUse.get(k) ?? 0) + 1);
  }

  const edges: EdgeGeometry[] = [];
  /** Position réelle de chaque point d'ancrage déjà décidé (clé « classe|côté|lien »). */
  const finalPorts = new Map<string, Point>(ports);
  /** Vrai si `pt` reste à MIN_PORT_GAP des autres ancrages de ce côté de la classe. */
  const spaced = (box: string, side: Side, key: string, pt: Point) => {
    const prefix = `${box}|${side}|`;
    for (const [k, o] of finalPorts) {
      if (!k.startsWith(prefix) || k === prefix + key) continue;
      if (Math.abs(o.x - pt.x) + Math.abs(o.y - pt.y) < MIN_PORT_GAP) return false;
    }
    return true;
  };
  /** Contexte de routage de chaque lien (pour pouvoir le recalculer dans les passes de lisibilité). */
  const contexts = new Map<number, { a: Rect; b: Rect; plan: Plan; pa: Point; pb: Point; obstacles: Rect[]; sharedEnd: boolean }>();
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
    const keyA = `e${index}`;
    const keyB = shared ? `tree-${r.kind}` : `e${index}`;
    const okA = (pt: Point) => spaced(r.from, p.sideA, keyA, pt);
    const okB = (pt: Point) => spaced(r.to, p.sideB, keyB, pt);
    let pa = ports.get(`${r.from}|${p.sideA}|e${index}`) ?? sideCenter(a, p.sideA);
    let pb = ports.get(`${r.to}|${p.sideB}|${shared ? `tree-${r.kind}` : `e${index}`}`) ?? sideCenter(b, p.sideB);

    // Classes alignées (chevauchement suffisant sur l'axe transversal) → trait parfaitement droit.
    const alone = sideUse.get(`${r.from}|${p.sideA}`) === 1 && sideUse.get(`${r.to}|${p.sideB}`) === 1;
    if (alone) {
      const lo = p.vertical ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
      const hi = p.vertical ? Math.min(a.x + a.w, b.x + b.w) : Math.min(a.y + a.h, b.y + b.h);
      if (hi - lo >= MIN_STRAIGHT_OVERLAP) {
        const m = (lo + hi) / 2;
        const na = p.vertical ? { x: m, y: pa.y } : { x: pa.x, y: m };
        const nb = p.vertical ? { x: m, y: pb.y } : { x: pb.x, y: m };
        if (okA(na) && okB(nb)) {
          pa = na;
          pb = nb;
        }
      }
    }

    // Petit décrochement (quelques px) entre deux classes presque alignées → trait droit.
    // On aligne les deux extrémités sur une même coordonnée prise dans la zone commune aux deux côtés,
    // sauf si l'arrivée est un point partagé (arbre d'héritage) : le bouger casserait l'arbre.
    const sharedEnd = shared && (treeUse.get(`${r.to}|${p.sideB}|${r.kind}`) ?? 0) > 1;
    const jog = p.vertical ? pb.x - pa.x : pb.y - pa.y;
    if (jog !== 0 && Math.abs(jog) < MAX_JOG) {
      const lo = (p.vertical ? Math.max(a.x, b.x) : Math.max(a.y, b.y)) + 6;
      const hi = (p.vertical ? Math.min(a.x + a.w, b.x + b.w) : Math.min(a.y + a.h, b.y + b.h)) - 6;
      if (hi >= lo) {
        const from = p.vertical ? pa.x : pa.y;
        const to = p.vertical ? pb.x : pb.y;
        // Arrivée partagée : c'est le départ qui s'aligne dessus ; sinon on se retrouve au milieu.
        const target = Math.min(Math.max(sharedEnd ? to : (from + to) / 2, lo), hi);
        const na = p.vertical ? { x: target, y: pa.y } : { x: pa.x, y: target };
        const nb = p.vertical ? { x: target, y: pb.y } : { x: pb.x, y: target };
        if ((!sharedEnd || target === to) && okA(na) && okB(nb)) {
          pa = na;
          pb = nb;
        }
      }
    }

    const obstacles = Object.entries(boxes)
      .filter(([name]) => name !== r.from && name !== r.to && !frames.has(name))
      .map(([, rect]) => rect);

    let points = zRoute(pa, pb, p.vertical);
    // Le trajet simple doit rester à l'écart des autres classes ET ne pas recouper les deux classes reliées.
    if (collides(points, obstacles) || crossesOwn(points, a, b)) {
      const portFor = (box: Rect, side: Side, which: 'a' | 'b') => {
        if (which === 'a' && side === p.sideA) return pa;
        if (which === 'b' && side === p.sideB) return pb;
        return sideCenter(box, side);
      };
      const routed = searchRoute(a, b, solid, p.sideA, p.sideB, portFor, edges.map((e) => e.points));
      if (routed) points = routed;
    }

    points = simplify(points);
    // Dernier ajustement : pas de petite marche aux extrémités (l'arrivée d'un arbre d'héritage reste fixe).
    const smoothed = removeEndJogs(points, a, b, sharedEnd, (which, pt) => (which === 'a' ? okA(pt) : okB(pt)));
    if (!collides(smoothed, obstacles) && !crossesOwn(smoothed, a, b)) points = smoothed;
    // Mémorise les ancrages réels (s'ils sont toujours sur le côté prévu) pour les liens suivants.
    finalPorts.set(`${r.from}|${p.sideA}|${keyA}`, points[0]);
    finalPorts.set(`${r.to}|${p.sideB}|${keyB}`, points[points.length - 1]);
    edges.push({ relation: r, d: toPath(points), points, label: labelPoint(points) });
    contexts.set(edges.length - 1, { a, b, plan: p, pa, pb, obstacles, sharedEnd });
  });

  // Passe de lisibilité n° 1 : un lien ne doit pas passer sur la pointe de flèche d'un autre.
  const allBoxes = solid;
  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    edges.forEach((e, i) => {
      const c = contexts.get(i);
      if (!c) return;
      const zones = foreignZones(edges, i);
      const others = edges.filter((_, j) => j !== i).map((o) => o.points);
      const crowded = runsAlong(e.points, others);
      if (!pathHitsZones(e.points, zones) && !crowded) return;
      const portFor = (box: Rect, side: Side, which: 'a' | 'b') => {
        if (which === 'a' && side === c.plan.sideA) return c.pa;
        if (which === 'b' && side === c.plan.sideB) return c.pb;
        return sideCenter(box, side);
      };
      const occupied = edges.filter((_, j) => j !== i).map((o) => o.points);
      const routed = searchRoute(c.a, c.b, allBoxes, c.plan.sideA, c.plan.sideB, portFor, occupied, zones);
      if (!routed) return;
      let pts = simplify(routed);
      const smoothed = removeEndJogs(pts, c.a, c.b, c.sharedEnd);
      if (!collides(smoothed, c.obstacles) && !crossesOwn(smoothed, c.a, c.b) && !pathHitsZones(smoothed, zones)) pts = smoothed;
      if (pathHitsZones(pts, zones)) return;
      // On ne remplace un trajet « trop proche » que par un trajet qui ne l'est plus.
      if (crowded && runsAlong(pts, others)) return;
      edges[i] = { ...e, points: pts, d: toPath(pts), label: labelPoint(pts) };
      changed = true;
    });
    if (!changed) break;
  }

  // Passe n° 2 : chaque libellé trouve une place où il ne masque rien (ni les multiplicités).
  const taken: Zone[] = [];
  for (const e of edges) {
    if (e.points.length < 2) continue;
    if (e.relation.multFrom) taken.push(multZone(multPosition(e.points, 'start'), e.relation.multFrom));
    if (e.relation.multTo) taken.push(multZone(multPosition(e.points, 'end'), e.relation.multTo));
  }
  edges.forEach((e, i) => {
    if (e.relation.label) edges[i] = { ...e, label: placeLabel(e, edges, allBoxes, taken) };
  });

  // Passe n° 3 (esthétique) : sur une ellipse ou un acteur, le trait touche la forme elle-même.
  const shapes = opts.shapes ?? {};
  edges.forEach((e, i) => {
    const pts = e.points.map((p) => ({ ...p }));
    const fit = (end: 0 | 1, name: string) => {
      const shape = shapes[name];
      const r = boxes[name];
      if (!shape || !r || pts.length < 2) return;
      const k = end === 0 ? 0 : pts.length - 1;
      const n = end === 0 ? 1 : pts.length - 2;
      const p = pts[k];
      const vertical = Math.abs(p.x - pts[n].x) < 0.01;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      if (shape === 'ellipse') {
        const rx = r.w / 2;
        const ry = r.h / 2;
        if (vertical && Math.abs(p.x - cx) < rx - 2) {
          const dy = ry * Math.sqrt(1 - ((p.x - cx) / rx) ** 2);
          p.y = p.y < cy ? cy - dy : cy + dy;
        } else if (!vertical && Math.abs(p.y - cy) < ry - 2) {
          const dx = rx * Math.sqrt(1 - ((p.y - cy) / ry) ** 2);
          p.x = p.x < cx ? cx - dx : cx + dx;
        }
      } else if (!vertical && p.y > r.y + 18 && p.y < r.y + 70) {
        // Acteur : le trait s'arrête au bout des bras / du corps, pas au bord de la zone du nom.
        p.x = p.x < cx ? cx - 18 : cx + 18;
      } else if (vertical && p.y < cy) {
        p.y = r.y + 2;
      }
    };
    fit(0, e.relation.from);
    fit(1, e.relation.to);
    if (pts.some((p, j) => p.x !== e.points[j].x || p.y !== e.points[j].y)) edges[i] = { ...e, points: pts, d: toPath(pts) };
  });
  return edges;
}
