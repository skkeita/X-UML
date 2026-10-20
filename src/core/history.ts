/*
 * Historique annuler / rétablir, sous forme de fonctions pures (testables sans React).
 *
 * Un « instantané » contient TOUT ce que l'utilisateur peut modifier : le script ET la position
 * des boîtes. Ainsi Ctrl+Z annule indifféremment une frappe, un déplacement ou un changement de flèche,
 * dans l'ordre exact où ils ont été faits — c'est le comportement attendu d'un éditeur hybride.
 */

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * - 'push'    : nouvelle étape annulable.
 * - 'merge'   : remplace l'état courant sans créer d'étape (frappe continue, glisser en cours).
 */
export type CommitMode = 'push' | 'merge';

export const HISTORY_LIMIT = 200;

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export function commit<T>(h: History<T>, next: T, mode: CommitMode): History<T> {
  if (Object.is(next, h.present)) return h;
  if (mode === 'merge') return { ...h, present: next, future: [] };
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
