import { describe, expect, it } from 'vitest';
import { formatDecl, parseDecl } from './decl';
import { deleteRelation, updateRelation } from './edit';
import { parse } from './parser';

describe('liaisons automatiques (extends / implements)', () => {
  it('« extends » crée un héritage, « implements » une réalisation', () => {
    const { diagram, errors } = parse('class Chien extends Animal implements Domestique, Gardien {\n  + race: string\n}');
    expect(errors).toEqual([]);
    expect(diagram.relations).toEqual([
      { from: 'Chien', to: 'Animal', kind: 'inheritance', line: 1, auto: true, via: 'extends' },
      { from: 'Chien', to: 'Domestique', kind: 'realization', line: 1, auto: true, via: 'implements' },
      { from: 'Chien', to: 'Gardien', kind: 'realization', line: 1, auto: true, via: 'implements' },
    ]);
    expect(diagram.classes.map((c) => c.name)).toEqual(['Chien', 'Animal', 'Domestique', 'Gardien']);
    expect(diagram.classes[0].members).toHaveLength(1);
  });

  it('fonctionne pour les interfaces, les classes abstraites et sans bloc', () => {
    const { diagram, errors } = parse('interface A extends B { }\nabstract class C extends D\nclass E implements A');
    expect(errors).toEqual([]);
    expect(diagram.relations.map((r) => `${r.from}>${r.to}:${r.kind}`)).toEqual([
      'A>B:inheritance',
      'C>D:inheritance',
      'E>A:realization',
    ]);
    expect(diagram.classes.find((c) => c.name === 'C')?.stereotype).toBe('abstract');
  });

  it('une liaison écrite deux fois (extends + à la main) n’est dessinée qu’une fois', () => {
    const { diagram } = parse('class Chien extends Animal\nChien --|> Animal');
    expect(diagram.relations).toHaveLength(1);
    expect(diagram.relations[0].auto).toBeUndefined();
  });

  it('« extends » sans parent est une erreur', () => {
    expect(parse('class Chien extends {').errors).toHaveLength(1);
  });

  it('lecture / écriture d’une déclaration', () => {
    const d = parseDecl('  class Chien extends Animal implements X, Y {');
    expect(d).toMatchObject({ indent: '  ', name: 'Chien', extends: ['Animal'], implements: ['X', 'Y'], opens: true });
    expect(formatDecl(d!)).toBe('  class Chien extends Animal implements X, Y {');
  });
});

describe('modifier une liaison automatique', () => {
  const SRC = 'class Chien extends Animal implements Domestique { // note\n  + race: string\n}';
  const REF = { line: 1, from: 'Chien', to: 'Animal', auto: true };

  it('changer de parent réécrit « extends »', () => {
    expect(updateRelation(SRC, REF, { to: 'Mammifere' }).split('\n')[0]).toBe('class Chien extends Mammifere implements Domestique { // note');
  });

  it('héritage → réalisation déplace le parent dans « implements »', () => {
    expect(updateRelation(SRC, REF, { kind: 'realization' }).split('\n')[0]).toBe('class Chien implements Domestique, Animal { // note');
  });

  it('un autre type détache la liaison : elle devient une liaison manuelle', () => {
    const out = updateRelation(SRC, REF, { kind: 'composition' });
    expect(out.split('\n')[0]).toBe('class Chien implements Domestique { // note');
    expect(out.trimEnd().split('\n').at(-1)).toBe('Chien *-- Animal');
    expect(parse(out).diagram.relations.map((r) => r.kind)).toEqual(['realization', 'composition']);
  });

  it('inverser détache aussi la liaison', () => {
    expect(updateRelation(SRC, REF, { reverse: true }).trimEnd().split('\n').at(-1)).toBe('Animal --|> Chien');
  });

  it('supprimer retire le parent de la déclaration', () => {
    const out = deleteRelation(SRC, REF);
    expect(out.split('\n')[0]).toBe('class Chien implements Domestique { // note');
    expect(parse(out).diagram.relations).toHaveLength(1);
    const out2 = deleteRelation(out, { line: 1, from: 'Chien', to: 'Domestique', auto: true });
    expect(out2.split('\n')[0]).toBe('class Chien { // note');
  });
});
