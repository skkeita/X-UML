import { describe, expect, it } from 'vitest';
import { updateRelation } from './edit';
import { parse } from './parser';

describe('tableau blanc : éléments UML', () => {
  it('acteurs, cas d’utilisation, objets, systèmes, paquetages', () => {
    const { diagram, errors } = parse(
      [
        'actor Client "Client fidèle"',
        'usecase Payer "Payer la commande"',
        'object c1 : Client',
        'system Boutique',
        'package Ventes',
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(diagram.classes.map((c) => [c.name, c.kind, c.label])).toEqual([
      ['Client', 'actor', 'Client fidèle'],
      ['Payer', 'usecase', 'Payer la commande'],
      ['c1', 'object', 'c1 : Client'],
      ['Boutique', 'system', undefined],
      ['Ventes', 'package', undefined],
    ]);
  });

  it('seul un objet peut avoir un type', () => {
    expect(parse('actor Client : Personne').errors).toHaveLength(1);
  });

  it('multiplicités et stéréotypes sur les liaisons', () => {
    const { diagram, errors } = parse('Client "1" -- "0..*" Commande : passe\nPayer ..> Identifier : <<include>>');
    expect(errors).toEqual([]);
    expect(diagram.relations[0]).toMatchObject({ from: 'Client', to: 'Commande', kind: 'association', multFrom: '1', multTo: '0..*', label: 'passe' });
    expect(diagram.relations[1]).toMatchObject({ kind: 'dependency', label: '<<include>>' });
  });

  it('inverser une liaison échange aussi ses multiplicités', () => {
    const out = updateRelation('A "1" -- "0..*" B : x', { line: 1, from: 'A', to: 'B' }, { reverse: true });
    expect(out).toBe('B "0..*" -- "1" A : x');
  });

  it('groupes : package, frontière de système, cadre de diagramme typé', () => {
    const { diagram, errors } = parse(
      [
        'usecase Payer',
        'usecase Commander',
        'actor Client',
        'system Boutique "Boutique en ligne" : Payer, Commander',
        'package Animaux : Chien, Chat',
        'diagram usecase "Gestion des commandes" : Client, Payer, Commander',
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(diagram.groups).toEqual([
      { name: 'Boutique', kind: 'system', title: 'Boutique en ligne', members: ['Payer', 'Commander'], line: 4 },
      { name: 'Animaux', kind: 'package', title: 'Animaux', members: ['Chien', 'Chat'], line: 5 },
      { name: 'diagram6', kind: 'frame', diagramType: 'usecase', title: 'Gestion des commandes', members: ['Client', 'Payer', 'Commander'], line: 6 },
    ]);
    // Les membres cités mais non déclarés deviennent des classes.
    expect(diagram.classes.map((c) => c.name)).toEqual(['Payer', 'Commander', 'Client', 'Chien', 'Chat']);
  });

  it('une liaison peut relier deux packages (diagramme de paquetages)', () => {
    const { diagram } = parse('package Ventes : Commande\npackage Stock : Article\nVentes ..> Stock');
    expect(diagram.relations).toMatchObject([{ from: 'Ventes', to: 'Stock', kind: 'dependency' }]);
    // « Ventes » et « Stock » restent des groupes : aucune classe homonyme n'est créée.
    expect(diagram.classes.map((c) => c.name)).toEqual(['Commande', 'Article']);
  });

  it('cadre sans titre : titre par défaut selon le type', () => {
    expect(parse('diagram context : A').diagram.groups?.[0].title).toBe('Contexte statique');
  });
});

describe('actions sur une sélection', () => {
  it('mettre dans un package : identifiant valide + titre conservé', async () => {
    const { addPackage, toIdent } = await import('./edit');
    expect(toIdent('Gestion des ventes')).toBe('GestionDesVentes');
    const out = addPackage('class A\nclass B', 'Gestion des ventes', ['A', 'B']);
    expect(out).toBe('class A\nclass B\n\npackage GestionDesVentes "Gestion des ventes" : A, B\n');
    expect(parse(out).diagram.groups?.[0]).toMatchObject({ kind: 'package', title: 'Gestion des ventes', members: ['A', 'B'] });
    expect(addPackage('class A', 'Animaux', ['A']).trim().split('\n').at(-1)).toBe('package Animaux : A');
  });

  it('typer une sélection : cadre de diagramme', async () => {
    const { addDiagramFrame } = await import('./edit');
    const out = addDiagramFrame('actor C\nusecase P', 'usecase', 'Commandes', ['C', 'P']);
    expect(parse(out).diagram.groups?.[0]).toMatchObject({ kind: 'frame', diagramType: 'usecase', title: 'Commandes', members: ['C', 'P'] });
  });

  it('supprimer des éléments nettoie déclarations, liaisons, extends et groupes', async () => {
    const { deleteNodes } = await import('./edit');
    const src = [
      'class Animal {',
      '  + nom: string',
      '}',
      'class Chien extends Animal implements Gardien { // note',
      '}',
      'actor Client',
      'Client -- Chien : promène',
      'Chien --> Animal',
      'package Zoo : Animal, Chien',
      'package Vide : Animal',
    ].join('\n');
    const out = deleteNodes(src, ['Animal', 'Client']);
    expect(out).toBe(['class Chien implements Gardien { // note', '}', 'package Zoo : Chien'].join('\n'));
    expect(parse(out).errors).toEqual([]);
  });
});

describe('modèles d’exemple', () => {
  it('chaque modèle se lit sans erreur et produit un diagramme', async () => {
    const { TEMPLATES } = await import('./templates');
    const { computeScene, layoutNewClasses } = await import('./layout');
    for (const t of TEMPLATES) {
      const { diagram, errors } = parse(t.source);
      expect(errors, t.id).toEqual([]);
      if (t.id === 'empty') continue;
      expect(diagram.classes.length, t.id).toBeGreaterThan(2);
      const scene = computeScene(diagram, layoutNewClasses(diagram, {}));
      expect(scene.edges.length, t.id).toBe(diagram.relations.length);
    }
  });

  it('cas d’utilisation : les acteurs sont placés hors de la frontière du système', async () => {
    const { TEMPLATES } = await import('./templates');
    const { computeScene, layoutNewClasses } = await import('./layout');
    const { diagram } = parse(TEMPLATES.find((t) => t.id === 'usecase')!.source);
    const scene = computeScene(diagram, layoutNewClasses(diagram, {}));
    const sys = scene.frames.Boutique;
    for (const actor of ['Client', 'Admin']) {
      const b = scene.boxes[actor];
      const inside = b.x < sys.x + sys.w && b.x + b.w > sys.x && b.y < sys.y + sys.h && b.y + b.h > sys.y;
      expect(inside, actor).toBe(false);
    }
  });
});
