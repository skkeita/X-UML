import { describe, expect, it } from 'vitest';
import { commit, createHistory, HISTORY_LIMIT, redo, undo } from './history';

describe('historique', () => {
  it('annule puis rétablit', () => {
    let h = createHistory('a');
    h = commit(h, 'b', 'push');
    h = commit(h, 'c', 'push');
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    h = redo(h);
    expect(h.present).toBe('b');
  });

  it('merge ne crée pas d’étape', () => {
    let h = createHistory('a');
    h = commit(h, 'ab', 'push');
    h = commit(h, 'abc', 'merge');
    expect(undo(h).present).toBe('a');
  });

  it('une nouvelle action efface le « rétablir »', () => {
    let h = commit(createHistory('a'), 'b', 'push');
    h = undo(h);
    h = commit(h, 'x', 'push');
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
  });

  it('ignore les états identiques et borne la taille', () => {
    const h0 = createHistory(0);
    expect(commit(h0, 0, 'push')).toBe(h0);
    let h = h0;
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = commit(h, i, 'push');
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });

  it('undo / redo sans historique ne fait rien', () => {
    const h = createHistory('a');
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});
