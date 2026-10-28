import { describe, expect, it } from 'vitest';
import { alignBoxes, type AlignMode } from './align';
import type { Rect } from './types';

const B = {
  A: { x: 0, y: 0, w: 100, h: 50 },
  B: { x: 150, y: 200, w: 60, h: 80 },
  C: { x: 400, y: 400, w: 120, h: 40 },
};
const apply = (boxes: Record<string, Rect>, mode: AlignMode) => {
  const moves = alignBoxes(boxes, mode);
  return Object.fromEntries(Object.entries(boxes).map(([n, r]) => [n, { ...r, ...(moves[n] ?? {}) }]));
};
const overlaps = (bs: Record<string, Rect>) => {
  const v = Object.values(bs);
  return v.some((a, i) => v.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
};

describe('aligner et répartir', () => {
  it('aligner à gauche, à droite, en haut, en bas', () => {
    expect(alignBoxes(B, 'left')).toEqual({ B: { x: 0, y: 200 }, C: { x: 0, y: 400 } });
    expect(alignBoxes(B, 'right')).toEqual({ A: { x: 420, y: 0 }, B: { x: 460, y: 200 } });
    expect(alignBoxes(B, 'top')).toEqual({ B: { x: 150, y: 0 }, C: { x: 400, y: 0 } });
    expect(alignBoxes(B, 'bottom')).toEqual({ A: { x: 0, y: 390 }, B: { x: 150, y: 360 } });
  });

  it('centrer sur un axe commun', () => {
    const r = apply(B, 'hcenter'); // axe x = 260
    expect(r.A.x + 50).toBe(260);
    expect(r.B.x + 30).toBe(260);
    const v = apply(B, 'vcenter'); // axe y = 220
    expect(v.A.y + 25).toBe(220);
  });

  it('aligner n’empile jamais deux éléments', () => {
    const row = { A: { x: 0, y: 0, w: 100, h: 50 }, B: { x: 200, y: 10, w: 100, h: 50 }, C: { x: 400, y: 5, w: 100, h: 60 } };
    for (const m of ['left', 'right', 'hcenter'] as const) expect(overlaps(apply(row, m))).toBe(false);
    const col = { A: { x: 0, y: 0, w: 100, h: 50 }, B: { x: 10, y: 200, w: 120, h: 50 }, C: { x: 5, y: 400, w: 90, h: 50 } };
    for (const m of ['top', 'bottom', 'vcenter'] as const) expect(overlaps(apply(col, m))).toBe(false);
    // l'ordre est conservé
    const l = apply(row, 'left');
    expect(l.A.y).toBeLessThan(l.C.y);
  });

  it('répartir : espaces égaux, extrémités fixes, ordre conservé', () => {
    const r = alignBoxes(B, 'hspace');
    // A [0..100], C [400..520] fixes ; B (60 de large) : espaces de (520 - 280) / 2 = 120
    expect(r).toEqual({ B: { x: 220, y: 200 } });
    expect(alignBoxes({ A: B.A, B: B.B }, 'hspace')).toEqual({});
  });
});
