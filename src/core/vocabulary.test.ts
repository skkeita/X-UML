import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { TEMPLATES } from './templates';
import { VOCABULARIES, changeForChoice, inferDiagramType, relationChoiceOf, summarize } from './vocabulary';

describe('vocabulaire selon le type de diagramme', () => {
  it('déduit le type de chaque modèle à partir de son contenu', () => {
    for (const t of TEMPLATES.filter((x) => x.type)) expect(inferDiagramType(parse(t.source).diagram)).toBe(t.type);
    expect(inferDiagramType(parse('actor A\nusecase B').diagram)).toBe('usecase');
    expect(inferDiagramType(parse('object a : A').diagram)).toBe('communication');
    expect(inferDiagramType(parse('class A').diagram, 'package')).toBe('package');
  });

  it('jamais « classe » hors du diagramme de classes', () => {
    for (const t of ['usecase', 'context', 'package', 'communication'] as const) {
      const v = VOCABULARIES[t];
      expect(v.create.map((c) => c.kind)).not.toContain('class');
      expect(v.element).not.toBe('classe');
      expect(v.relations.map((r) => r.label).join(' ')).not.toMatch(/Composition|Agrégation/);
    }
  });

  it('les stéréotypes font partie de la relation', () => {
    const uc = VOCABULARIES.usecase;
    expect(relationChoiceOf(uc, { kind: 'dependency', label: '<<include>>' })?.id).toBe('include');
    expect(relationChoiceOf(uc, { kind: 'dependency', label: '<<extend>>' })?.id).toBe('extend');
    const include = uc.relations.find((r) => r.id === 'include')!;
    const assoc = uc.relations.find((r) => r.id === 'association')!;
    expect(changeForChoice(include)).toEqual({ kind: 'dependency', label: '<<include>>' });
    expect(changeForChoice(assoc, '<<include>>')).toEqual({ kind: 'association', label: '' });
    expect(changeForChoice(assoc, 'gère')).toEqual({ kind: 'association' });
  });

  it('résumé avec les bons mots et les bons pluriels', () => {
    const d = parse('actor A\nactor B\nusecase C\nA -- C\nB -- C').diagram;
    expect(summarize(VOCABULARIES.usecase, d)).toBe('2 acteurs, 1 cas d’utilisation, 2 relations');
    const c = parse('abstract class A\nclass B extends A').diagram;
    expect(summarize(VOCABULARIES.class, c)).toBe('2 classes, 1 relation');
    const m = parse('object a\nobject b\na --> b : 1: x()').diagram;
    expect(summarize(VOCABULARIES.communication, m)).toBe('2 objets, 1 message');
  });
});
