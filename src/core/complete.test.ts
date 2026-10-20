import { describe, expect, it } from 'vitest';
import { complete } from './complete';
import { parse } from './parser';

const SRC = 'abstract class Animal {\n  # nom: string\n  + manger(): void\n}\nclass Chien extends Animal {\n  + race: string\n}\n';
const D = parse(SRC).diagram;
const at = (text: string) => complete(text, text.length, D);

describe('autocomplétion Ctrl+Espace', () => {
  it('complète un nom de classe existant', () => {
    const c = at(`${SRC}Personne --> Ani`);
    expect(c?.items.map((i) => i.label)).toEqual(['Animal']);
    expect(c?.from).toBe(`${SRC}Personne --> `.length);
  });

  it('dans un bloc, propose d’abord les attributs et méthodes déjà écrits', () => {
    const c = at(`${SRC}class Chat {\n  + `);
    expect(c?.items.slice(0, 3).map((i) => i.label)).toEqual(['nom: string', 'manger(): void', 'race: string']);
    expect(c?.items[0]).toMatchObject({ type: 'attribut', detail: 'dans Animal' });
    expect(at(`${SRC}class Chat {\n  + ma`)?.items.map((i) => i.label)).toEqual(['manger(): void']);
  });

  it('en début de ligne, propose les noms et les mots-clés', () => {
    const labels = at(`${SRC}c`)?.items.map((i) => i.label);
    expect(labels).toContain('class');
    expect(at(`${SRC}C`)?.items[0].label).toBe('Chien');
    expect(at(`${SRC}us`)?.items.map((i) => i.label)).toEqual(['usecase']);
  });

  it('après le nom d’une classe, propose extends / implements', () => {
    expect(at(`${SRC}class Chat ex`)?.items.map((i) => i.label)).toEqual(['extends']);
  });

  it('ignore les accents et la casse ; rien dans un commentaire', () => {
    expect(complete('class Étudiant\ne', 'class Étudiant\ne'.length, parse('class Étudiant').diagram)?.items[0].label).toBe('Étudiant');
    expect(at(`${SRC}// Ani`)).toBeNull();
  });
});
