import { describe, expect, it } from 'vitest';
import { pdfLayout } from './exportPdf';

describe('mise en page PDF (A4)', () => {
  it('diagramme large → paysage, centré dans les marges', () => {
    const l = pdfLayout(1600, 700);
    expect(l.orientation).toBe('landscape');
    expect(l.x).toBeGreaterThanOrEqual(12);
    expect(l.x + l.w).toBeLessThanOrEqual(297 - 12 + 0.001);
    expect(l.y + l.h).toBeLessThanOrEqual(210 - 12 - 8 + 0.001);
    expect(l.w / l.h).toBeCloseTo(1600 / 700, 5);
  });

  it('diagramme haut → portrait', () => {
    expect(pdfLayout(500, 1400).orientation).toBe('portrait');
  });

  it('petit diagramme : pas agrandi au point de devenir flou', () => {
    const l = pdfLayout(300, 200);
    expect(l.w).toBeCloseTo(300 * 0.35, 5);
  });
});
