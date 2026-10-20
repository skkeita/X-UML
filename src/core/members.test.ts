import { describe, expect, it } from 'vitest';
import { deleteRelation, updateRelation } from './edit';
import { parse } from './parser';
import { SAMPLE_SOURCE } from './sample';

describe('liaisons déduites des attributs et méthodes', () => {
  it('une méthode qui utilise une autre classe crée une dépendance (cas « skyer »)', () => {
    const src = 'abstract class Animal {\n}\nclass skyer {\n  + +\n  + parle (Animal)\n}';
    const { diagram, errors } = parse(src);
    expect(errors).toEqual([]);
    expect(diagram.relations).toEqual([{ from: 'skyer', to: 'Animal', kind: 'dependency', line: 5, auto: true, via: 'member' }]);
  });

  it('un attribut typé par une classe crée une association dirigée (prioritaire sur la méthode)', () => {
    const { diagram } = parse('class Maitre {\n  + aboyer(c: Chien): void\n  - chien: Chien\n}\nclass Chien');
    expect(diagram.relations).toMatchObject([{ from: 'Maitre', to: 'Chien', kind: 'directed', via: 'member' }]);
  });

  it('fonctionne quelle que soit la place de la classe citée (déclarée plus bas)', () => {
    const { diagram } = parse('class A {\n  + b: B\n}\nclass B');
    expect(diagram.relations).toHaveLength(1);
  });

  it('pas de liaison vers un type qui n’est pas une classe, ni vers soi-même', () => {
    const { diagram } = parse('class Noeud {\n  + suivant: Noeud\n  + valeur: int\n  + nom: string\n}');
    expect(diagram.relations).toEqual([]);
  });

  it('pas de doublon : une liaison existante (écrite ou par extends) suffit, dans un sens comme dans l’autre', () => {
    expect(parse('class A {\n  + b: B\n}\nclass B\nB --> A').diagram.relations).toHaveLength(1);
    expect(parse('class A extends B {\n  + f(b: B)\n}\nclass B').diagram.relations).toMatchObject([{ kind: 'inheritance' }]);
    expect(parse('class A {\n  + b: B\n}\nclass B {\n  + a: A\n}').diagram.relations).toHaveLength(1);
  });

  it('l’exemple : Domestique.getProprietaire(): Personne relie Domestique à Personne', () => {
    const rels = parse(SAMPLE_SOURCE).diagram.relations;
    expect(rels).toContainEqual(expect.objectContaining({ from: 'Domestique', to: 'Personne', kind: 'dependency', via: 'member' }));
    // Personne.adopter(a: Animal) ne double pas « Personne --> Animal : adopte »
    expect(rels.filter((r) => [r.from, r.to].sort().join() === 'Animal,Personne')).toHaveLength(1);
  });

  it('modifier une liaison déduite l’écrit comme liaison manuelle ; la supprimer ne fait rien', () => {
    const src = 'class A {\n  + f(b: B)\n}\nclass B';
    const ref = { line: 2, from: 'A', to: 'B', auto: true, via: 'member' as const, kind: 'dependency' as const };
    const out = updateRelation(src, ref, { kind: 'composition' });
    expect(out.trimEnd().split('\n').at(-1)).toBe('A *-- B');
    expect(parse(out).diagram.relations).toMatchObject([{ kind: 'composition' }]);
    expect(updateRelation(src, ref, { label: 'utilise' }).trimEnd().split('\n').at(-1)).toBe('A ..> B : utilise');
    expect(deleteRelation(src, ref)).toBe(src);
  });
});
