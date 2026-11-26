import { beforeEach, describe, expect, it } from 'vitest';
import { loadAi, saveAi } from './settings';

/** Stockage en mémoire (l'environnement de test n'a pas de navigateur). */
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

beforeEach(() => {
  Object.assign(globalThis, { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() });
});

describe('réglages de l’assistant', () => {
  it('par défaut : OpenRouter gratuit, mode tuteur, clé non mémorisée', () => {
    const s = loadAi();
    expect(s.settings.provider).toBe('openrouter');
    expect(s.settings.model).toBe('openrouter/free');
    expect(s.mode).toBe('tutor');
    expect(s.remember).toBe(false);
  });

  it('clé non mémorisée : seulement dans la session de l’onglet', () => {
    const s = loadAi();
    saveAi({ ...s, settings: { ...s.settings, apiKey: 'secret' } });
    expect(localStorage.getItem('x-uml:ai-key')).toBeNull();
    expect(sessionStorage.getItem('x-uml:ai-key')).toBe('secret');
    expect(localStorage.getItem('x-uml:ai')).not.toContain('secret');
    expect(loadAi().settings.apiKey).toBe('secret');
  });

  it('mémoriser puis ne plus mémoriser : la clé ne reste jamais aux deux endroits', () => {
    const s = loadAi();
    saveAi({ ...s, remember: true, settings: { ...s.settings, apiKey: 'k' } });
    expect(localStorage.getItem('x-uml:ai-key')).toBe('k');
    expect(sessionStorage.getItem('x-uml:ai-key')).toBeNull();
    saveAi({ ...loadAi(), remember: false });
    expect(localStorage.getItem('x-uml:ai-key')).toBeNull();
    expect(sessionStorage.getItem('x-uml:ai-key')).toBe('k');
  });
});
