import { describe, expect, it } from 'vitest';
import { addNote, deleteNodes, deleteRelation, setNoteTargets, setNoteText } from './edit';
import { computeBoxes, layoutNewClasses } from './layout';
import { parse } from './parser';
import { renameElement } from './modelEdit';

describe('notes UML', () => {
  it('note rattachée à deux éléments : nœud « note » + liens pointillés', () => {
    const { diagram, errors } = parse('class A\nclass B\nnote N1 "Règle : \\"prix > 0\\"\\nà vérifier" : A, B');
    expect(errors).toHaveLength(0);
    const n = diagram.classes.find((c) => c.name === 'N1');
    expect(n?.kind).toBe('note');
    expect(n?.label).toBe('Règle : "prix > 0"\nà vérifier');
    expect(diagram.relations.filter((r) => r.via === 'note').map((r) => r.to)).toEqual(['A', 'B']);
    const boxes = computeBoxes(diagram, layoutNewClasses(diagram, {}));
    expect(boxes.N1.h).toBeGreaterThanOrEqual(2 * 17);
  });

  it('ajouter, modifier le texte, changer les cibles', () => {
    let { source, name } = addNote('class A\nclass B', 'Première\nligne "deux"', ['A']);
    expect(name).toBe('Note1');
    expect(source).toContain('note Note1 "Première\\nligne \\"deux\\"" : A');
    expect(parse(source).diagram.classes.find((c) => c.name === 'Note1')?.label).toBe('Première\nligne "deux"');
    source = setNoteText(source, 'Note1', 'Texte modifié');
    expect(source).toContain('note Note1 "Texte modifié" : A');
    source = setNoteTargets(source, 'Note1', (t) => [...t, 'B']);
    expect(source).toContain('note Note1 "Texte modifié" : A, B');
    source = deleteRelation(source, { line: 3, from: 'Note1', to: 'A', auto: true, via: 'note' });
    expect(source).toContain('note Note1 "Texte modifié" : B');
  });

  it('supprimer un élément annoté garde la note ; supprimer la note ne touche à rien d’autre', () => {
    const src = 'class A\nclass B\nnote N1 "x" : A, B';
    expect(deleteNodes(src, ['A'])).toContain('note N1 "x" : B');
    const out = deleteNodes(src, ['N1']);
    expect(out).not.toContain('note');
    expect(parse(out).diagram.classes.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('renommer un élément met à jour la note, mais pas son texte', () => {
    expect(renameElement('class A\nnote N1 "A est central" : A', 'A', 'Commande')).toBe('class Commande\nnote N1 "A est central" : Commande');
  });
});
