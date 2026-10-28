import { describe, expect, it } from 'vitest';
import { generateCode } from './codegen';
import { javaToScript } from './javaImport';
import { parse } from './parser';

const SRC = `abstract class Animal {
  # nom: string
  - naissance: Date
  + manger(quantite: double): void
  + crier(): string
}
interface Domestique {
  + getProprietaire(): Personne
}
class Chien extends Animal implements Domestique {
  + race: string
  + aboyer(fois: int): void
}
enum Couleur {
  ROUGE
  VERT
}
class Personne {
  + nom: string
  + {static} compteur: int
}
Personne "1" --> "0..*" Chien : chiens
Personne --> Couleur`;

describe('génération de code', () => {
  const d = parse(SRC).diagram;

  it('Java : un fichier par type, héritage, visibilités, types, associations', () => {
    const files = generateCode(d, 'java');
    expect(files.map((f) => f.name).sort()).toEqual(['Animal.java', 'Chien.java', 'Couleur.java', 'Domestique.java', 'Personne.java']);
    const chien = files.find((f) => f.name === 'Chien.java')!.content;
    expect(chien).toContain('public class Chien extends Animal implements Domestique {');
    expect(chien).toContain('public String race;');
    expect(chien).toContain('public void aboyer(int fois) {');
    const animal = files.find((f) => f.name === 'Animal.java')!.content;
    expect(animal).toContain('import java.time.LocalDate;');
    expect(animal).toContain('public abstract class Animal {');
    expect(animal).toContain('protected String nom;');
    const personne = files.find((f) => f.name === 'Personne.java')!.content;
    expect(personne).toContain('private List<Chien> chiens;');
    expect(personne).toContain('private Couleur couleur;');
    expect(personne).toContain('public static int compteur;');
    expect(files.find((f) => f.name === 'Couleur.java')!.content).toContain('ROUGE,\n    VERT;');
  });

  it('TypeScript et Python : un module, parents déclarés avant les enfants', () => {
    const ts = generateCode(d, 'typescript')[0].content;
    expect(ts.indexOf('class Animal')).toBeLessThan(ts.indexOf('class Chien'));
    expect(ts).toContain('export class Chien extends Animal implements Domestique {');
    expect(ts).toContain('private chiens!: Chien[];');
    const py = generateCode(d, 'python')[0].content;
    expect(py).toContain('class Chien(Animal, Domestique):');
    expect(py).toContain('class Couleur(Enum):');
    expect(py).toContain('def aboyer(self, fois: int) -> None:');
  });

  it('sans classe : rien à générer', () => {
    expect(generateCode(parse('actor A\nusecase U').diagram, 'java')).toEqual([]);
  });
});

describe('import Java', () => {
  it('classes, interfaces, énumérations, records, membres et héritage', () => {
    const script = javaToScript(`
      package zoo;
      import java.util.List;
      /** Un animal. */
      public abstract class Animal implements Comparable<Animal> {
        protected String nom; // nom
        private int age = 3, poids;
        public Animal(String nom) { this.nom = nom; }
        public abstract void crier();
        public static Animal creer(String n, List<String> tags) { if (n == null) { return null; } return null; }
        @Override public int compareTo(Animal o) { return "}".length(); }
        class Interne { int x; }
      }
      interface Domestique extends Vivant { Personne proprietaire(); }
      enum Couleur { ROUGE, VERT("v"), BLEU; private final String code; }
      record Point(int x, int y) {}
    `)!;
    expect(script).toContain('abstract class Animal implements Comparable {');
    expect(script).toContain('  # nom: string');
    expect(script).toContain('  - age: int');
    expect(script).toContain('  - poids: int');
    expect(script).toContain('  + crier(): void');
    expect(script).toContain('  + {static} creer(n: string, tags: List<string>): Animal');
    expect(script).toContain('  + compareTo(o: Animal): int');
    expect(script).not.toContain('Animal(nom');
    expect(script).not.toContain('Interne');
    expect(script).toContain('interface Domestique extends Vivant {\n  + proprietaire(): Personne\n}');
    expect(script).toContain('enum Couleur {\n  ROUGE\n  VERT\n  BLEU\n  - code: string\n}');
    expect(script).toContain('class Point {\n  - x: int\n  - y: int\n}');
    expect(parse(script).errors).toEqual([]);
  });

  it('pas de type Java : null', () => {
    expect(javaToScript('int x = 1;')).toBeNull();
  });
});

describe('aller-retour diagramme → Java → diagramme', () => {
  it('les classes, l’héritage et les membres reviennent', () => {
    const d = parse(SRC).diagram;
    const java = generateCode(d, 'java').map((f) => f.content).join('\n');
    const back = parse(javaToScript(java)!).diagram;
    expect(back.classes.map((c) => c.name).sort()).toEqual(['Animal', 'Chien', 'Couleur', 'Domestique', 'Personne']);
    expect(back.relations.some((r) => r.from === 'Chien' && r.to === 'Animal' && r.kind === 'inheritance')).toBe(true);
    expect(back.relations.some((r) => r.from === 'Chien' && r.to === 'Domestique' && r.kind === 'realization')).toBe(true);
    const chien = back.classes.find((c) => c.name === 'Chien')!;
    expect(chien.members.map((m) => m.text)).toEqual(expect.arrayContaining(['race: string', 'aboyer(fois: int): void', 'getProprietaire(): Personne']));
  });
});
