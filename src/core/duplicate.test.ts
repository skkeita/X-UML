import { describe, expect, it } from 'vitest';
import { duplicateNodes } from './edit';
import { parse } from './parser';

const SRC = `abstract class Animal {
  # nom: string
}

class Chien extends Animal implements Domestique {
  + aboyer(): void
}

class Chat extends Chien {
}
actor Client "Le client"
Chien "1" --> "0..*" Chat : chasse
Client -- Chien
package Zoo : Chien, Chat`;

describe('dupliquer une sélection', () => {
  it('recopie déclarations, membres et liaisons internes sous de nouveaux noms', () => {
    const { source, renames } = duplicateNodes(SRC, ['Chien', 'Chat']);
    expect(renames).toEqual({ Chien: 'Chien2', Chat: 'Chat2' });
    expect(source).toContain('class Chien2 extends Animal implements Domestique {\n  + aboyer(): void\n}');
    // Le chat copié hérite du chien copié
    expect(source).toContain('class Chat2 extends Chien2');
    expect(source).toContain('Chien2 "1" --> "0..*" Chat2 : chasse');
    // Une liaison vers l'extérieur de la sélection n'est pas recopiée ; le groupe non plus
    expect(source).not.toContain('Client -- Chien2');
    expect(source.match(/package Zoo/g)).toHaveLength(1);
    expect(parse(source).errors ?? []).toHaveLength(0);
  });

  it('garde le libellé d’un élément et choisit un nom libre', () => {
    const { source, renames } = duplicateNodes(`${SRC}\nclass Client2`, ['Client']);
    expect(renames.Client).toBe('Client3');
    expect(source).toContain('actor Client3 "Le client"');
  });

  it('déclare la copie d’un élément implicite', () => {
    const { source } = duplicateNodes('A --> B', ['B']);
    expect(source).toContain('class B2');
  });
});
