import { describe, expect, it } from 'vitest';
import { applyFocusEdit, codeLines, focusLines, focusText } from './focus';
import { parse } from './parser';
import { SAMPLE_SOURCE } from './sample';

const SRC = [
  'class A {', //       0
  '  + x: int', //      1
  '}', //               2
  'class B {', //       3
  '  + y: int', //      4
  '}', //               5
  '', //                6
  'A -- B', //          7
  'B --|> C', //        8
  'C ..> A : utilise', // 9
].join('\n');

describe('vue ciblée sur une classe', () => {
  it('sélectionne le bloc de la classe et ses relations', () => {
    expect(focusLines(SRC, 'A')).toEqual([0, 1, 2, 7, 9]);
    expect(focusLines(SRC, 'B')).toEqual([3, 4, 5, 7, 8]);
    expect(focusLines(SRC, 'C')).toEqual([8, 9]); // classe implicite : seulement ses relations
  });

  it('gère les déclarations sur une ligne et les commentaires', () => {
    const src = 'interface I { }\nclass A // commentaire\nA ..|> I';
    expect(focusLines(src, 'I')).toEqual([0, 2]);
    expect(focusLines(src, 'A')).toEqual([1, 2]);
  });

  it('modifier une ligne la remplace à sa place', () => {
    const lines = focusLines(SRC, 'A');
    const view = focusText(SRC, lines).replace('+ x: int', '- x: string');
    const r = applyFocusEdit(SRC, lines, view);
    expect(r.source.split('\n')[1]).toBe('  - x: string');
    expect(r.source.split('\n')).toHaveLength(10);
    expect(focusText(r.source, r.lines)).toBe(view);
  });

  it('ajouter un attribut l’insère dans le bloc de la classe', () => {
    const lines = focusLines(SRC, 'A');
    const view = focusText(SRC, lines).replace('  + x: int', '  + x: int\n  + z: bool');
    const r = applyFocusEdit(SRC, lines, view);
    expect(r.source.split('\n').slice(0, 4)).toEqual(['class A {', '  + x: int', '  + z: bool', '}']);
    expect(focusText(r.source, r.lines)).toBe(view);
    expect(parse(r.source).errors).toEqual([]);
  });

  it('ajouter une relation à la fin la place après la dernière relation de la classe', () => {
    const lines = focusLines(SRC, 'A');
    const view = `${focusText(SRC, lines)}\nA *-- D`;
    const r = applyFocusEdit(SRC, lines, view);
    expect(r.source.split('\n').at(-1)).toBe('A *-- D');
    expect(focusText(r.source, r.lines)).toBe(view);
  });

  it('une ligne en cours de frappe (invalide) reste dans la vue', () => {
    const lines = focusLines(SRC, 'A');
    const view = `${focusText(SRC, lines)}\nA --`;
    const r = applyFocusEdit(SRC, lines, view);
    expect(focusText(r.source, r.lines)).toBe(view);
  });

  it('supprimer une relation l’enlève du script complet sans toucher au reste', () => {
    const lines = focusLines(SRC, 'A');
    const view = focusText(SRC, lines).replace('A -- B\n', '');
    const r = applyFocusEdit(SRC, lines, view);
    expect(r.source).not.toContain('A -- B');
    expect(r.source).toContain('B --|> C');
    expect(r.source.split('\n')).toHaveLength(9);
  });

  it('fonctionne sur le script d’exemple', () => {
    const lines = focusLines(SAMPLE_SOURCE, 'Chien');
    const text = focusText(SAMPLE_SOURCE, lines);
    expect(text).toContain('class Chien {');
    expect(text).toContain('Chien --|> Animal');
    expect(text).toContain('Chien ..|> Domestique');
    expect(text).not.toContain('Chat');
  });

  it('le code sans liaisons : uniquement les déclarations', () => {
    expect(codeLines(SRC)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(focusLines(SRC, 'A', false)).toEqual([0, 1, 2]);
    expect(focusLines(SRC, 'C', false)).toEqual([]);
  });

  it('modifier le code sans liaisons ne touche pas aux liaisons', () => {
    const lines = codeLines(SRC);
    const view = focusText(SRC, lines).replace('class B {', 'class B {\n  + z: int');
    const r = applyFocusEdit(SRC, lines, view);
    expect(r.source.split('\n').slice(-3)).toEqual(['A -- B', 'B --|> C', 'C ..> A : utilise']);
    expect(parse(r.source).errors).toEqual([]);
  });
});
