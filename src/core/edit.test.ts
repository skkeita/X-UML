import { describe, expect, it } from 'vitest';
import { addRelation, deleteRelation, SYMBOL, updateRelation } from './edit';
import { parse } from './parser';

const SRC = 'class A\n  Chien --> Animal : adopte // note\nB -- C';
const REF = { line: 2, from: 'Chien', to: 'Animal' };

describe('édition des relations depuis le canevas', () => {
  it('associe un symbole à chaque type', () => {
    expect(SYMBOL.inheritance).toBe('--|>');
    expect(SYMBOL.aggregation).toBe('o--');
  });

  it('change le type en conservant indentation, libellé et commentaire', () => {
    const out = updateRelation(SRC, REF, { kind: 'composition' });
    expect(out.split('\n')[1]).toBe('  Chien *-- Animal : adopte // note');
    expect(parse(out).diagram.relations[0].kind).toBe('composition');
  });

  it('inverse le sens', () => {
    const out = updateRelation(SRC, REF, { reverse: true });
    expect(out.split('\n')[1]).toBe('  Animal --> Chien : adopte // note');
  });

  it('change la source, la cible et le libellé', () => {
    const out = updateRelation(SRC, REF, { from: 'Chat', to: 'Maison', label: 'habite' });
    expect(out.split('\n')[1]).toBe('  Chat --> Maison : habite // note');
    expect(updateRelation(SRC, REF, { label: '' }).split('\n')[1]).toBe('  Chien --> Animal // note');
  });

  it('supprime la ligne', () => {
    expect(deleteRelation(SRC, REF)).toBe('class A\nB -- C');
  });

  it('ne modifie rien si la ligne ne correspond plus', () => {
    expect(updateRelation(SRC, { line: 2, from: 'X', to: 'Y' }, { kind: 'dependency' })).toBe(SRC);
    expect(updateRelation(SRC, { line: 99, from: 'Chien', to: 'Animal' }, { kind: 'dependency' })).toBe(SRC);
  });

  it('ajoute une relation après le bloc de relations existant', () => {
    expect(addRelation('class A\n\nA -- B\n', 'B', 'C', 'inheritance')).toBe('class A\n\nA -- B\nB --|> C\n');
  });

  it('sépare la nouvelle relation des déclarations par une ligne vide', () => {
    const out = addRelation('class A {\n + x\n}', 'A', 'B', 'composition');
    expect(out).toBe('class A {\n + x\n}\n\nA *-- B\n');
    expect(parse(out).errors).toEqual([]);
  });

  it('ajoute dans un script vide', () => {
    expect(addRelation('', 'A', 'B', 'association')).toBe('A -- B\n');
  });

  it('préserve les fins de ligne Windows', () => {
    const out = updateRelation('A -- B\r\nC -- D', { line: 1, from: 'A', to: 'B' }, { kind: 'inheritance' });
    expect(out).toBe('A --|> B\r\nC -- D');
  });
});
