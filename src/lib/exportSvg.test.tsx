import { describe, expect, it } from 'vitest';
import { computeBoxes, layoutNewClasses } from '../core/layout';
import { parse } from '../core/parser';
import { SAMPLE_SOURCE } from '../core/sample';
import { LIGHT } from '../core/theme';
import { buildSvgString } from './exportSvg';

describe('buildSvgString', () => {
  it('produit un SVG autonome contenant toutes les classes', () => {
    const { diagram } = parse(SAMPLE_SOURCE);
    const boxes = computeBoxes(diagram, layoutNewClasses(diagram, {}));
    const svg = buildSvgString(diagram, boxes, LIGHT);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox=');
    for (const c of diagram.classes) expect(svg).toContain(c.name);
    expect(svg).toContain('«interface»');
  });
});

describe('export sans éléments d’interface', () => {
  it('n’inclut ni poignées ni zones de clic', () => {
    const { diagram } = parse(SAMPLE_SOURCE);
    const svg = buildSvgString(diagram, computeBoxes(diagram, layoutNewClasses(diagram, {})), LIGHT);
    expect(svg).not.toContain('data-handle');
    expect(svg).not.toContain('stroke="transparent"');
  });
});
