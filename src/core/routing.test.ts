import { describe, expect, it } from 'vitest';
import { computeBoxes, layoutNewClasses } from './layout';
import { parse } from './parser';
import { computeEdges } from './routing';
import { SAMPLE_SOURCE } from './sample';
import type { Point, Rect } from './types';

const R = (x: number, y: number, w = 140, h = 80): Rect => ({ x, y, w, h });

/** Vrai si chaque segment est horizontal ou vertical. */
const orthogonal = (pts: Point[]) =>
  pts.every((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) < 0.01 || Math.abs(p.y - pts[i - 1].y) < 0.01);

const hits = (pts: Point[], r: Rect) =>
  pts.some((p, i) => {
    if (i === 0) return false;
    const q = pts[i - 1];
    return Math.max(p.x, q.x) > r.x && Math.min(p.x, q.x) < r.x + r.w && Math.max(p.y, q.y) > r.y && Math.min(p.y, q.y) < r.y + r.h;
  });

const rel = (from: string, to: string, kind: 'association' | 'inheritance' = 'association', line = 1) => ({ from, to, kind, line });

describe('routage orthogonal', () => {
  it('trait droit vertical entre deux classes alignées', () => {
    const [e] = computeEdges([rel('A', 'B')], { A: R(0, 0), B: R(20, 200) });
    expect(e.points).toHaveLength(2);
    expect(e.points[0].x).toBe(e.points[1].x);
    expect(e.d).not.toMatch(/NaN/);
  });

  it('trait droit horizontal entre deux classes sur la même ligne', () => {
    const [e] = computeEdges([rel('A', 'B')], { A: R(0, 0), B: R(300, 10) });
    expect(e.points).toHaveLength(2);
    expect(e.points[0].y).toBe(e.points[1].y);
  });

  it('coude automatique quand les classes sont décalées', () => {
    const [e] = computeEdges([rel('A', 'B')], { A: R(0, 0), B: R(400, 300) });
    expect(e.points.length).toBeGreaterThan(2);
    expect(orthogonal(e.points)).toBe(true);
  });

  it('contourne une classe placée entre les deux', () => {
    const boxes = { A: R(0, 0), M: R(250, 0), B: R(500, 0) };
    const [e] = computeEdges([rel('A', 'B')], boxes);
    expect(orthogonal(e.points)).toBe(true);
    expect(hits(e.points, boxes.M)).toBe(false);
  });

  it('les héritages vers une même classe partagent le point d’arrivée (arbre)', () => {
    const boxes = { P: R(200, 0), C1: R(0, 250), C2: R(400, 250) };
    const [e1, e2] = computeEdges([rel('C1', 'P', 'inheritance', 1), rel('C2', 'P', 'inheritance', 2)], boxes);
    expect(e1.points[e1.points.length - 1]).toEqual(e2.points[e2.points.length - 1]);
  });

  it('deux liens entre les mêmes classes ne se superposent pas', () => {
    const [e1, e2] = computeEdges([rel('A', 'B', 'association', 1), rel('A', 'B', 'association', 2)], { A: R(0, 0), B: R(0, 300) });
    expect(e1.d).not.toBe(e2.d);
  });

  it('un héritage décalé passe au-dessus d’une classe voisine au lieu d’un grand détour', () => {
    // Parent en haut à gauche, enfant décalé à droite, une autre classe entre les deux en bas.
    const boxes = { P: R(0, 0, 180, 150), M: R(230, 230, 180, 100), C: R(470, 230, 180, 80) };
    const [e] = computeEdges([rel('C', 'P', 'inheritance')], boxes);
    expect(orthogonal(e.points)).toBe(true);
    expect(hits(e.points, boxes.M)).toBe(false);
    // L'arrivée se fait par le bas du parent (hiérarchie verticale) et sans descendre sous les classes.
    expect(e.points[e.points.length - 1].y).toBe(150);
    expect(Math.max(...e.points.map((p) => p.y))).toBeLessThanOrEqual(230);
  });

  it('tous les liens de l’exemple sont orthogonaux', () => {
    const { diagram } = parse(SAMPLE_SOURCE);
    const boxes = computeBoxes(diagram, layoutNewClasses(diagram, {}));
    const edges = computeEdges(diagram.relations, boxes);
    expect(edges).toHaveLength(diagram.relations.length);
    for (const e of edges) expect(orthogonal(e.points)).toBe(true);
  });
});

describe('aucun trait ne traverse une classe', () => {
  /** Générateur pseudo-aléatoire reproductible. */
  const rng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const interiorHit = (pts: Point[], r: Rect) =>
    pts.some((p, i) => {
      if (i === 0) return false;
      const q = pts[i - 1];
      return Math.max(p.x, q.x) > r.x + 0.5 && Math.min(p.x, q.x) < r.x + r.w - 0.5 && Math.max(p.y, q.y) > r.y + 0.5 && Math.min(p.y, q.y) < r.y + r.h - 0.5;
    });

  it('300 dispositions aléatoires : chaque segment évite l’intérieur de toutes les classes', () => {
    let failures = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const rand = rng(seed);
      // Classes posées sur une grille irrégulière, jamais superposées (écart ≥ 12 px).
      const boxes: Record<string, Rect> = {};
      const names: string[] = [];
      const n = 3 + Math.floor(rand() * 6);
      for (let k = 0; k < n; k++) {
        const col = k % 3;
        const row = Math.floor(k / 3);
        const w = 100 + rand() * 120;
        const h = 50 + rand() * 90;
        boxes[`C${k}`] = { x: col * 260 + rand() * 30, y: row * 200 + rand() * 40, w, h };
        names.push(`C${k}`);
      }
      const kinds = ['association', 'inheritance', 'directed', 'composition'] as const;
      const relations = Array.from({ length: n + 2 }, (_, i) => {
        const from = names[Math.floor(rand() * n)];
        let to = names[Math.floor(rand() * n)];
        if (to === from) to = names[(names.indexOf(from) + 1) % n];
        return { from, to, kind: kinds[i % kinds.length], line: i + 1 };
      });
      for (const e of computeEdges(relations, boxes)) {
        expect(orthogonal(e.points)).toBe(true);
        for (const r of Object.values(boxes)) if (interiorHit(e.points, r)) failures++;
      }
    }
    expect(failures).toBe(0);
  });

  it('une classe posée au milieu d’un lien droit est contournée', () => {
    const boxes = { A: R(0, 0), B: R(0, 400), M: R(-20, 180, 180, 60) };
    const [e] = computeEdges([rel('A', 'B')], boxes);
    expect(interiorHit(e.points, boxes.M)).toBe(false);
    expect(orthogonal(e.points)).toBe(true);
  });
});

describe('classes jamais superposées', () => {
  it('une classe lâchée sur une autre est décalée vers la place libre la plus proche', async () => {
    const { resolveOverlap, MIN_GAP } = await import('./layout');
    const other = R(100, 100, 200, 100);
    const p = resolveOverlap({ x: 150, y: 120 }, { w: 140, h: 80 }, [other]);
    const clash = p.x < other.x + other.w + MIN_GAP && p.x + 140 + MIN_GAP > other.x && p.y < other.y + other.h + MIN_GAP && p.y + 80 + MIN_GAP > other.y;
    expect(clash).toBe(false);
    // Position déjà libre : inchangée
    expect(resolveOverlap({ x: 600, y: 600 }, { w: 140, h: 80 }, [other])).toEqual({ x: 600, y: 600 });
  });
});

describe('pas de petit décrochement', () => {
  it('deux classes presque alignées sont reliées par un trait parfaitement droit', () => {
    // A et B côte à côte, décalées de 4 px en hauteur, avec un autre lien qui partage le côté droit de A.
    const boxes = { A: R(0, 0, 140, 120), B: R(400, 4, 140, 120), C: R(400, 300, 140, 80) };
    const edges = computeEdges([rel('A', 'B', 'association', 1), rel('A', 'C', 'association', 2)], boxes);
    const e = edges[0];
    expect(e.points).toHaveLength(2);
    expect(e.points[0].y).toBe(e.points[1].y);
  });

  it('un vrai décalage garde son coude', () => {
    const [e] = computeEdges([rel('A', 'B')], { A: R(0, 0, 140, 80), B: R(400, 200, 140, 80) });
    expect(e.points.length).toBeGreaterThan(2);
  });
});

describe('pas de marche aux extrémités d’un contournement', () => {
  it('le point d’arrivée glisse le long du côté pour s’aligner sur le trajet', () => {
    // Cas réel : le lien contourne une classe et arrivait avec une marche de ~11 px.
    const boxes = { A: R(0, 40, 180, 160), M: R(260, 0, 300, 120), S: R(640, 60, 180, 120) };
    for (const e of computeEdges([rel('S', 'A', 'dependency' as never)], boxes)) {
      const p = e.points;
      for (let i = 1; i < p.length - 2; i++) {
        const len = Math.abs(p[i + 1].x - p[i].x) + Math.abs(p[i + 1].y - p[i].y);
        const isEndStep = i === 1 || i === p.length - 3;
        if (isEndStep) expect(len >= 32 || p.length <= 3).toBe(true);
      }
    }
  });
});
