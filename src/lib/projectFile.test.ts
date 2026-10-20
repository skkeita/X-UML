import { describe, expect, it } from 'vitest';
import { exportFileName, parseProjectFile, serializeProject } from './projectFile';

const B = (id: string, name: string, source: string, positions = {}) => ({ id, name, source, positions });

describe('fichier de projet (plusieurs tableaux)', () => {
  it('export puis import redonne exactement le même projet', () => {
    const boards = [B('a', 'Classes', 'class A extends B {\n}', { A: { x: 10, y: 20 } }), B('b', 'Cas d’utilisation', 'actor C\nusecase P\nC -- P')];
    const text = serializeProject(boards, new Date('2026-10-20T12:00:00Z'));
    expect(JSON.parse(text)).toMatchObject({ app: 'x-uml', version: 2, exportedAt: '2026-10-20T12:00:00.000Z' });
    expect(parseProjectFile(text, 'projet.json')).toEqual({ ok: true, boards });
  });

  it('reprend un fichier de l’ancienne version (un seul diagramme)', () => {
    const old = JSON.stringify({ app: 'x-uml', version: 1, source: 'class A', positions: { A: { x: 1, y: 2 }, B: { x: 'oops' } } });
    const r = parseProjectFile(old, 'ancien.json');
    expect(r).toMatchObject({ ok: true, boards: [{ name: 'Diagramme', source: 'class A', positions: { A: { x: 1, y: 2 } } }] });
  });

  it('refuse un JSON qui n’est pas un projet, un JSON invalide, un fichier vide', () => {
    expect(parseProjectFile('{"name":"autre"}', 'x.json')).toMatchObject({ ok: false });
    expect(parseProjectFile('{ pas du json', 'x.json')).toMatchObject({ ok: false });
    expect(parseProjectFile('   ', 'x.txt')).toMatchObject({ ok: false });
    expect(parseProjectFile('{"boards":[{"name":"x"}]}', 'x.json')).toMatchObject({ ok: false });
  });

  it('accepte un script texte (PlantUML compris) : un tableau nommé d’après le fichier', () => {
    const r = parseProjectFile('@startuml\nclass A\nA --|> B\n@enduml', 'diagramme.puml');
    expect(r).toMatchObject({ ok: true, boards: [{ name: 'diagramme', source: 'class A\nA --|> B', positions: {} }] });
  });

  it('nom de fichier daté', () => {
    expect(exportFileName(new Date(2026, 9, 5))).toBe('x-uml-2026-10-05.json');
  });
});
