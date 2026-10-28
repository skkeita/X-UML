import { describe, expect, it } from 'vitest';
import { decodeBoard, encodeBoard } from './share';
import { addVersion, loadVersions, MAX_VERSIONS, VERSIONS_KEY } from './versions';
import { SAMPLE_SOURCE } from '../core/sample';

describe('lien de partage', () => {
  it('aller-retour : script, positions, type et ancres', () => {
    const b = { id: 'b1', name: 'Bibliothèque', source: SAMPLE_SOURCE, positions: { A: { x: 10.4, y: 20.6 } }, type: 'class' as const, anchors: { 'A>B#0': { start: { side: 'right' as const, t: 0.5 } } } };
    const hash = encodeBoard(b);
    expect(hash.startsWith('#d=')).toBe(true);
    expect(hash).toMatch(/^#d=[\w-]+$/);
    const back = decodeBoard(hash)!;
    expect(back.name).toBe('Bibliothèque');
    expect(back.source).toBe(SAMPLE_SOURCE);
    expect(back.positions.A).toEqual({ x: 10, y: 21 });
    expect(back.type).toBe('class');
    expect(back.anchors?.['A>B#0']?.start?.side).toBe('right');
    expect(back.id).not.toBe('b1');
    expect(hash.length).toBeLessThan(SAMPLE_SOURCE.length);
  });
  it('lien abîmé : null', () => {
    expect(decodeBoard('#d=abc')).toBeNull();
    expect(decodeBoard('#autre')).toBeNull();
  });
});

describe('historique des versions', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage ??= {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const board = (src: string) => [{ id: 'b', name: 'T', source: src, positions: {} }];
  it('ignore les doublons et le vide, garde les plus récentes', () => {
    localStorage.removeItem(VERSIONS_KEY);
    expect(addVersion(board(''), 'auto')).toHaveLength(0);
    addVersion(board('class A'), 'open', 1000);
    expect(addVersion(board('class A'), 'auto', 2000)).toHaveLength(1);
    for (let i = 0; i < MAX_VERSIONS + 5; i++) addVersion(board(`class A${i}`), 'auto', 3000 + i);
    const list = loadVersions();
    expect(list).toHaveLength(MAX_VERSIONS);
    expect(list[0].boards[0].source).toBe(`class A${MAX_VERSIONS + 4}`);
  });
});
