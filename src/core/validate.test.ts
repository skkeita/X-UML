import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { SAMPLE_SOURCE } from './sample';
import { TEMPLATES } from './templates';
import { validate } from './validate';

const ids = (src: string) => validate(parse(src).diagram).map((i) => i.id.split(':')[0]);

describe('vérification du modèle', () => {
  it('les exemples fournis ne déclenchent aucun avertissement', () => {
    for (const t of TEMPLATES.filter((x) => x.source)) {
      const w = validate(parse(t.source).diagram).filter((i) => i.level === 'warning');
      expect(w, t.name).toEqual([]);
    }
    expect(validate(parse(SAMPLE_SOURCE).diagram).filter((i) => i.level === 'warning')).toEqual([]);
  });

  it('héritage circulaire', () => {
    const issues = validate(parse('class A extends B\nclass B extends C\nclass C extends A').diagram);
    expect(issues.filter((i) => i.id.startsWith('cycle'))).toHaveLength(1);
    expect(issues[0].message).toMatch(/A → B → C → A|B → C → A → B|C → A → B → C/);
  });

  it('extends / implements mal employés, héritage multiple', () => {
    expect(ids('interface I {\n  + f(): void\n}\nclass A extends I')).toContain('ext-iface');
    expect(ids('class B\nclass A implements B\nA -- B')).toContain('impl-class');
    expect(ids('class B\nclass C\nclass A extends B, C')).toContain('multi');
  });

  it('interface vide, énumération vide, abstraite seule, membre en double', () => {
    expect(ids('interface I\nclass A implements I')).toContain('iface-empty');
    expect(ids('enum E {\n}\nclass A\nA -- E')).toContain('enum-empty');
    expect(ids('abstract class X\nclass Y\nX -- Y')).toContain('abstract-alone');
    expect(ids('class A {\n  + x: int\n  - x: string\n}\nclass B\nA -- B')).toContain('dup-member');
  });

  it('éléments isolés et noms en double', () => {
    expect(ids('actor Client\nusecase Payer\nactor Admin\nClient -- Payer')).toContain('alone');
    expect(ids('actor A "Client"\nactor B "Client"\nusecase U\nA -- U\nB -- U')).toContain('same-name');
    // une note ou un seul élément : rien à signaler
    expect(ids('class A')).toEqual([]);
    expect(ids('class A\nnote N "x" : A')).not.toContain('alone');
  });
});
