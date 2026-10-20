import { useCallback, useRef, useState } from 'react';
import { commit, createHistory, redo, undo, type History } from '../core/history';

/** Délai sans frappe au-delà duquel une nouvelle saisie devient une nouvelle étape d'annulation. */
const TYPING_PAUSE_MS = 800;

export interface HistoryApi<T> {
  present: T;
  /** Nouvelle étape annulable (changement de flèche, ajout de lien, début d'un déplacement…). */
  push: (update: (s: T) => T) => void;
  /** Modifie l'état courant sans nouvelle étape (suite d'un glisser en cours). */
  merge: (update: (s: T) => T) => void;
  /** Frappe clavier : les saisies rapprochées sont regroupées en une seule étape (comme VS Code). */
  type: (update: (s: T) => T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: () => T): HistoryApi<T> {
  const [h, setH] = useState<History<T>>(() => createHistory(initial()));
  const lastTyping = useRef(0);

  // NB : les décisions basées sur le temps sont prises HORS des fonctions passées à setH,
  // qui doivent rester pures (React StrictMode les exécute deux fois en développement).
  const push = useCallback((update: (s: T) => T) => {
    lastTyping.current = 0;
    setH((x) => commit(x, update(x.present), 'push'));
  }, []);

  const merge = useCallback((update: (s: T) => T) => {
    setH((x) => commit(x, update(x.present), 'merge'));
  }, []);

  const type = useCallback((update: (s: T) => T) => {
    const now = Date.now();
    const mode = now - lastTyping.current < TYPING_PAUSE_MS ? 'merge' : 'push';
    lastTyping.current = now;
    setH((x) => commit(x, update(x.present), mode));
  }, []);

  const doUndo = useCallback(() => {
    lastTyping.current = 0;
    setH(undo);
  }, []);
  const doRedo = useCallback(() => {
    lastTyping.current = 0;
    setH(redo);
  }, []);

  return {
    present: h.present,
    push,
    merge,
    type,
    undo: doUndo,
    redo: doRedo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  };
}
