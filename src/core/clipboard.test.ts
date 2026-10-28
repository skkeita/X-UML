import { describe, expect, it } from 'vitest';
import { copySnippet, isPasteable, pasteSnippet } from './clipboard';
import { parse } from './parser';

const SRC = `abstract class Animal {
  # nom: string
}
class Chien extends Animal {
  + aboyer(): void
}
class Chat extends Animal
Chien --> Chat : poursuit
Chien -- Os
package Zoo : Chien, Chat
color Chien, Chat jaune "Animaux"
note N1 "Fidèle" : Chien, Animal`;
const POS = { Animal: { x: 100, y: 0 }, Chien: { x: 0, y: 200 }, Chat: { x: 300, y: 200 }, N1: { x: 500, y: 200 } };

describe('copier / coller', () => {
  it('copie : déclarations, relations internes, notes et couleurs ; pas les groupes', () => {
    const snip = copySnippet(SRC, ['Chien', 'Chat', 'N1'], POS);
    expect(snip).toContain('class Chien extends Animal {\n  + aboyer(): void\n}');
    expect(snip).toContain('Chien --> Chat : poursuit');
    expect(snip).not.toContain('Chien -- Os');
    expect(snip).not.toContain('package Zoo');
    expect(snip).toContain('color Chien, Chat jaune "Animaux"');
    expect(snip).toContain('note N1 "Fidèle" : Chien');
    expect(isPasteable(snip)).toBe(true);
  });

  it('coller dans un autre tableau : tout arrive, positions relatives conservées', () => {
    const snip = copySnippet(SRC, ['Chien', 'Chat'], POS);
    const r = pasteSnippet('class Autre', snip, { x: 1000, y: 500 });
    expect(r.names.sort()).toEqual(['Chat', 'Chien']);
    expect(r.positions).toEqual({ Chien: { x: 1000, y: 500 }, Chat: { x: 1300, y: 500 } });
    const d = parse(r.source).diagram;
    expect(d.relations.some((x) => x.from === 'Chien' && x.to === 'Chat')).toBe(true);
    expect(parse(r.source).errors).toHaveLength(0);
  });

  it('coller dans le même tableau : noms en conflit renommés partout dans l’extrait', () => {
    const snip = copySnippet(SRC, ['Chien', 'Chat'], POS);
    const r = pasteSnippet(SRC, snip, { x: 40, y: 240 });
    expect(r.names.sort()).toEqual(['Chat2', 'Chien2']);
    expect(r.source).toContain('class Chien2 extends Animal {');
    expect(r.source).toContain('Chien2 --> Chat2 : poursuit');
    expect(r.source).toContain('color Chien2, Chat2 jaune "Animaux"');
    expect(parse(r.source).errors).toHaveLength(0);
  });

  it('du texte X-UML ordinaire se colle aussi (placement automatique)', () => {
    const r = pasteSnippet('', 'class A\nclass B\nA --> B', null);
    expect(r.names).toEqual(['A', 'B']);
    expect(r.positions).toEqual({});
    expect(isPasteable('bonjour')).toBe(false);
  });
});
