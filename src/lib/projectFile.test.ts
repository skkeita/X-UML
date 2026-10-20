import { describe, expect, it } from 'vitest';
import { exportFileName, parseProjectFile, serializeProject } from './projectFile';

describe('fichier de projet', () => {
  it('export puis import redonne exactement le même projet', () => {
    const source = 'class A extends B {\n  + x: int\n}\nA --> C : voit';
    const positions = { A: { x: 10, y: 20 }, B: { x: 300, y: -40 } };
    const text = serializeProject(source, positions, new Date('2026-10-20T12:00:00Z'));
    expect(JSON.parse(text)).toMatchObject({ app: 'x-uml', version: 1, exportedAt: '2026-10-20T12:00:00.000Z' });
    expect(parseProjectFile(text, 'projet.json')).toEqual({ ok: true, source, positions });
  });

  it('ignore les positions abîmées sans refuser le fichier', () => {
    const text = JSON.stringify({ source: 'class A', positions: { A: { x: 1, y: 2 }, B: { x: 'oops' }, C: null } });
    expect(parseProjectFile(text)).toEqual({ ok: true, source: 'class A', positions: { A: { x: 1, y: 2 } } });
  });

  it('refuse un JSON qui n’est pas un projet, un JSON invalide, un fichier vide', () => {
    expect(parseProjectFile('{"name":"autre"}', 'x.json')).toMatchObject({ ok: false });
    expect(parseProjectFile('{ pas du json', 'x.json')).toMatchObject({ ok: false });
    expect(parseProjectFile('   ', 'x.txt')).toMatchObject({ ok: false });
  });

  it('accepte un script texte, y compris au format PlantUML', () => {
    expect(parseProjectFile('@startuml\nclass A\nA --|> B\n@enduml', 'diagramme.puml')).toEqual({
      ok: true,
      source: 'class A\nA --|> B',
      positions: {},
    });
  });

  it('nom de fichier daté', () => {
    expect(exportFileName(new Date(2026, 9, 5))).toBe('x-uml-2026-10-05.json');
  });
});
