import { describe, expect, it } from 'vitest';
import { computeBoxes, layoutNewClasses } from './layout';
import { parse } from './parser';
import { anchorAt, anchorPoint, relationKey, routeEdges } from './routing';

const setup = (src: string, pos: Record<string, { x: number; y: number }>) => {
  const d = parse(src).diagram;
  const boxes = computeBoxes(d, layoutNewClasses(d, pos));
  return { d, boxes };
};
const insideAny = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
  Math.max(p.x, q.x) > r.x + 1 && Math.min(p.x, q.x) < r.x + r.w - 1 && Math.max(p.y, q.y) > r.y + 1 && Math.min(p.y, q.y) < r.y + r.h - 1;

describe('extrémités de flèche placées à la main', () => {
  it('clé stable par paire, numérotée pour les doublons', () => {
    const rels = [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'A', to: 'B' }];
    expect([0, 1, 2].map((i) => relationKey(rels, i))).toEqual(['A>B', 'A>C', 'A>B#2']);
  });

  it('ancrage ↔ point du bord', () => {
    const r = { x: 100, y: 100, w: 200, h: 100 };
    expect(anchorAt(r, { x: 150, y: 98 })).toEqual({ side: 'top', t: 0.25 });
    expect(anchorAt(r, { x: 303, y: 180 })).toEqual({ side: 'right', t: 0.8 });
    expect(anchorPoint(r, { side: 'bottom', t: 0.5 })).toEqual({ x: 200, y: 200 });
  });

  it('la pointe arrive exactement au point choisi, même sur un côté inhabituel', () => {
    const { d, boxes } = setup('class A\nclass B\nA --> B', { A: { x: 0, y: 0 }, B: { x: 400, y: 0 } });
    // Automatique : de la droite de A vers la gauche de B. Imposé : arrivée par le haut de B, au quart.
    const [e] = routeEdges(d.relations, boxes, { anchors: { 'A>B': { end: { side: 'top', t: 0.25 } } } });
    const end = e.points[e.points.length - 1];
    expect(end).toEqual(anchorPoint(boxes.B, { side: 'top', t: 0.25 }));
    // Le dernier segment arrive verticalement par le haut, et aucun segment ne traverse A ou B.
    expect(e.points[e.points.length - 2].x).toBeCloseTo(end.x);
    expect(e.points[e.points.length - 2].y).toBeLessThan(end.y);
    for (let i = 1; i < e.points.length - 2; i++) {
      expect(insideAny(e.points[i], e.points[i + 1], boxes.A)).toBe(false);
      expect(insideAny(e.points[i], e.points[i + 1], boxes.B)).toBe(false);
    }
  });

  it('départ et arrivée imposés, les autres relations restent automatiques', () => {
    const { d, boxes } = setup('class A\nclass B\nclass C\nA --> B\nA --> C', { A: { x: 0, y: 0 }, B: { x: 400, y: 0 }, C: { x: 0, y: 300 } });
    const edges = routeEdges(d.relations, boxes, { anchors: { 'A>B': { start: { side: 'bottom', t: 0.8 }, end: { side: 'bottom', t: 0.5 } } } });
    expect(edges[0].points[0]).toEqual(anchorPoint(boxes.A, { side: 'bottom', t: 0.8 }));
    expect(edges[0].points.at(-1)).toEqual(anchorPoint(boxes.B, { side: 'bottom', t: 0.5 }));
    expect(edges[1].points.length).toBeGreaterThanOrEqual(2);
  });
});
