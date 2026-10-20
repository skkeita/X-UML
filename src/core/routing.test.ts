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
