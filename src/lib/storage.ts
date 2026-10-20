import type { Positions } from '../core/types';

const KEY = 'x-uml:project:v1';

export interface ProjectData {
  version: 1;
  source: string;
  positions: Positions;
}

export type SaveStatus = 'saved' | 'saving' | 'error';

export function loadProject(): ProjectData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<ProjectData>;
    if (typeof data.source !== 'string') return null;
    return { version: 1, source: data.source, positions: data.positions ?? {} };
  } catch {
    return null;
  }
}

/** Renvoie false si l'écriture échoue (quota dépassé, navigation privée...). */
export function saveProject(data: ProjectData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
