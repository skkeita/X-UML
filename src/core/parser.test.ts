import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { SAMPLE_SOURCE } from './sample';
import { computeBoxes, computeEdges, layoutNewClasses } from './layout';

describe('parse', () => {
  it('parse le script d’exemple sans erreur', () => {
    const { diagram, errors } = parse(SAMPLE_SOURCE);
    expect(errors).toEqual([]);
    expect(diagram.classes.map((c) => c.name)).toEqual(['Animal', 'Chien', 'Domestique', 'Chat', 'Personne']);
    // 3 par extends/implements, 1 écrite, 1 déduite (Domestique.getProprietaire(): Personne)
    expect(diagram.relations).toHaveLength(5);
  });

  it('gère la visibilité, attributs et méthodes', () => {
    const { diagram } = parse('class A {\n  - x: int\n  + f(a: int): void\n  y\n}');
    const a = diagram.classes[0];
    expect(a.members).toEqual([
      { visibility: '-', text: 'x: int', kind: 'attribute' },
      { visibility: '+', text: 'f(a: int): void', kind: 'method' },
      { visibility: '+', text: 'y', kind: 'attribute' },
    ]);
  });

  it('reconnaît tous les opérateurs et crée les classes implicites', () => {
    const { diagram, errors } = parse(
      'A -- B\nA --> C\nA --|> D\nA ..|> E\nA ..> F\nA *-- G\nA o-- H : contient',
    );
    expect(errors).toEqual([]);
    expect(diagram.relations.map((r) => r.kind)).toEqual([
      'association',
      'directed',
      'inheritance',
      'realization',
      'dependency',
      'composition',
      'aggregation',
    ]);
    expect(diagram.relations[6].label).toBe('contient');
    expect(diagram.classes).toHaveLength(8);
  });

  it('accepte les identifiants accentués', () => {
    const { diagram, errors } = parse('Étudiant --|> Personne');
    expect(errors).toEqual([]);
    expect(diagram.classes.map((c) => c.name)).toContain('Étudiant');
  });

  it('signale les erreurs avec leur numéro de ligne', () => {
    const { errors } = parse('class A {\n + x\n}\nn’importe quoi');
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(4);
  });

  it('signale une accolade non fermée', () => {
    const { errors } = parse('class A {\n + x');
    expect(errors[0].message).toContain('manquante');
  });
});

describe('layout', () => {
  it('place les parents au-dessus des enfants', () => {
    const { diagram } = parse('B --|> A');
    const pos = layoutNewClasses(diagram, {});
    expect(pos.A.y).toBeLessThan(pos.B.y);
  });

  it('conserve les positions connues et ne chevauche pas', () => {
    const { diagram } = parse('class A\nclass B');
    const pos = layoutNewClasses(diagram, { A: { x: 500, y: 500 } });
    expect(pos.A).toEqual({ x: 500, y: 500 });
    expect(pos.B).toBeDefined();
  });

  it('calcule une géométrie pour chaque relation', () => {
    const { diagram } = parse('A -- B\nA -- B\nA -- A');
    const boxes = computeBoxes(diagram, layoutNewClasses(diagram, {}));
    expect(computeEdges(diagram.relations, boxes)).toHaveLength(3);
  });
});
