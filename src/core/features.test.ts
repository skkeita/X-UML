import { describe, expect, it } from 'vitest';
import { FEATURE_SECTIONS, searchFeatures } from './features';

describe('catalogue des fonctionnalités', () => {
  it('chaque entrée a un titre et une description, sans doublon', () => {
    const titles = FEATURE_SECTIONS.flatMap((s) => s.items.map((f) => `${s.id}/${f.title}`));
    expect(new Set(titles).size).toBe(titles.length);
    for (const s of FEATURE_SECTIONS) for (const f of s.items) expect(f.text.length).toBeGreaterThan(10);
  });

  it('recherche insensible aux accents et sur plusieurs mots', () => {
    const r = searchFeatures('dupliquer');
    expect(r.flatMap((s) => s.items.map((f) => f.title))).toContain('Dupliquer');
    expect(searchFeatures('legende').flatMap((s) => s.items).length).toBeGreaterThan(0);
    expect(searchFeatures('pdf ctrl').flatMap((s) => s.items.map((f) => f.title))).toContain('Document PDF');
    expect(searchFeatures('zzzz')).toHaveLength(0);
  });
});
