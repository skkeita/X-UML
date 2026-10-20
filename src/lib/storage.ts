import { readProject, type Project } from './project';

/*
 * Sauvegarde locale (navigateur). Version 2 : plusieurs tableaux + onglet actif.
 * Les projets enregistrés par les versions précédentes (un seul diagramme) sont repris tels quels.
 */

const KEY = 'x-uml:project:v2';
const OLD_KEY = 'x-uml:project:v1';

export interface StoredProject extends Project {
  activeId: string;
}

export type SaveStatus = 'saved' | 'saving' | 'error';

export function loadProject(): StoredProject | null {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { activeId?: unknown };
    const project = readProject(data);
    if (!project) return null;
    const activeId = typeof data.activeId === 'string' && project.boards.some((b) => b.id === data.activeId) ? data.activeId : project.boards[0].id;
    return { ...project, activeId };
  } catch {
    return null;
  }
}

/** Renvoie false si l'écriture échoue (quota dépassé, navigation privée...). */
export function saveProject(data: StoredProject): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, ...data }));
    return true;
  } catch {
    return false;
  }
}
