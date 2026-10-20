import { describe, expect, it } from 'vitest';
import { deleteRelation, SYMBOL, updateRelation } from './edit';
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

  it('supprime la ligne', () => {
    expect(deleteRelation(SRC, REF)).toBe('class A\nB -- C');
  });

  it('ne modifie rien si la ligne ne correspond plus', () => {
    expect(updateRelation(SRC, { line: 2, from: 'X', to: 'Y' }, { kind: 'dependency' })).toBe(SRC);
    expect(updateRelation(SRC, { line: 99, from: 'Chien', to: 'Animal' }, { kind: 'dependency' })).toBe(SRC);
  });

  it('préserve les fins de ligne Windows', () => {
    const out = updateRelation('A -- B\r\nC -- D', { line: 1, from: 'A', to: 'B' }, { kind: 'inheritance' });
    expect(out).toBe('A --|> B\r\nC -- D');
  });
});
