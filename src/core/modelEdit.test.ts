import { describe, expect, it } from 'vitest';
import { updateRelation } from './edit';
import { addElement, renameElement, setElementKind, setElementLabel, setGroupOf, setMembers, setObjectType, setParents } from './modelEdit';
import { parse } from './parser';

const names = (s: string) => parse(s).diagram.classes.map((c) => c.name);

describe('édition sans code', () => {
  it('ajoute des éléments nommés librement, avant les relations', () => {
    let s = 'class A\n\nA --> B\n';
    const r1 = addElement(s, 'actor', 'Client fidèle');
    expect(r1.name).toBe('ClientFidèle');
    s = r1.source;
    expect(s).toContain('actor ClientFidèle "Client fidèle"');
    expect(s.indexOf('actor')).toBeLessThan(s.indexOf('A -->'));
    const r2 = addElement(s, 'class', 'A');
    expect(r2.name).toBe('A2');
    const r3 = addElement('', 'interface', 'Payable');
    expect(r3.source).toBe('interface Payable\n');
    expect(parse(r1.source).errors).toHaveLength(0);
  });

  it('renomme partout, sauf dans les libellés et commentaires', () => {
    const s = 'class Chat extends Animal {\n  + ami: Chat\n}\nChat --> Souris : "Chat" // Chat\npackage P : Chat\ncolor Chat bleu';
    const out = renameElement(s, 'Chat', 'Felin');
    expect(out).toContain('class Felin extends Animal');
    expect(out).toContain('+ ami: Felin');
    expect(out).toContain('Felin --> Souris : "Chat" // Chat');
    expect(out).toContain('package P : Felin');
    expect(out).toContain('color Felin bleu');
  });

  it('libellé, type d’objet, nature', () => {
    let s = 'actor Client\nobject ihm';
    s = setElementLabel(s, 'Client', 'Client web');
    expect(s).toContain('actor Client "Client web"');
    s = setElementLabel(s, 'Client', '');
    expect(s).toContain('actor Client\n');
    s = setObjectType(s, 'ihm', 'Ecran Commande');
    expect(s).toContain('object ihm : EcranCommande');
    s = setElementKind(s, 'Client', 'usecase');
    expect(s).toContain('usecase Client');
    const c = setElementKind('class A {\n  + x: int\n}', 'A', 'interface');
    expect(c).toBe('interface A {\n  + x: int\n}');
    // une classe avec membres ne devient pas un acteur (contenu perdu)
    expect(setElementKind('class A {\n  + x: int\n}', 'A', 'actor')).toBe('class A {\n  + x: int\n}');
    expect(setElementKind('class A', 'A', 'actor')).toBe('actor A');
  });

  it('parents et membres', () => {
    let s = 'class Chien\nclass Animal';
    s = setParents(s, 'Chien', ['Animal'], ['Domestique']);
    expect(s).toContain('class Chien extends Animal implements Domestique');
    s = setMembers(s, 'Chien', [
      { visibility: '-', text: 'nom: string' },
      { visibility: '+', text: 'aboyer(): void' },
    ]);
    expect(s).toContain('class Chien extends Animal implements Domestique {\n  - nom: string\n  + aboyer(): void\n}\nclass Animal');
    s = setMembers(s, 'Chien', [{ visibility: '+', text: 'aboyer(): void' }]);
    expect(s).toContain('{\n  + aboyer(): void\n}');
    s = setMembers(s, 'Chien', []);
    expect(s.split('\n')[0]).toBe('class Chien extends Animal implements Domestique');
    expect(names(s)).toEqual(expect.arrayContaining(['Chien', 'Animal', 'Domestique']));
    // classe implicite : la déclaration est créée
    expect(setMembers('A --> B', 'B', [{ visibility: '+', text: 'x: int' }])).toContain('class B {\n  + x: int\n}');
  });

  it('appartenance à un système (frontière)', () => {
    let s = 'system Boutique "Boutique en ligne"\nusecase Payer\nusecase Commander';
    s = setGroupOf(s, 'Payer', 'Boutique');
    expect(s).toContain('system Boutique "Boutique en ligne" : Payer');
    s = setGroupOf(s, 'Commander', 'Boutique');
    expect(s).toContain('system Boutique "Boutique en ligne" : Payer, Commander');
    expect(parse(s).diagram.groups?.[0].members).toEqual(['Payer', 'Commander']);
    s = setGroupOf(s, 'Payer', null);
    s = setGroupOf(s, 'Commander', null);
    expect(s).toContain('system Boutique "Boutique en ligne"\n');
    expect(parse(s).diagram.classes.find((c) => c.name === 'Boutique')?.kind).toBe('system');
  });

  it('multiplicités d’une relation', () => {
    const s = 'A -- B';
    const out = updateRelation(s, { line: 1, from: 'A', to: 'B' }, { multFrom: '1', multTo: '0..*' });
    expect(out).toBe('A "1" -- "0..*" B');
    expect(updateRelation(out, { line: 1, from: 'A', to: 'B' }, { multFrom: '' })).toBe('A -- "0..*" B');
  });
});
