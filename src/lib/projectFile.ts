import { newBoard, readProject, type Board } from './project';

/*
 * Fichier de projet X-UML (.json) : tous les tableaux (onglets), avec le code ET la position
 * de chaque élément. Lisible et modifiable à la main si besoin.
 *
 * À l'import, on accepte aussi les fichiers des versions précédentes (un seul diagramme)
 * et un simple fichier texte contenant le script (.txt, .xuml, .puml).
 */

export interface ProjectFile {
  app: 'x-uml';
  version: 2;
  exportedAt: string;
  boards: Board[];
}

export type ImportResult = { ok: true; boards: Board[] } | { ok: false; error: string };

export function serializeProject(boards: Board[], now = new Date()): string {
  const file: ProjectFile = { app: 'x-uml', version: 2, exportedAt: now.toISOString(), boards };
  return JSON.stringify(file, null, 2);
}

/** Nom proposé au téléchargement : x-uml-AAAA-MM-JJ.json */
export function exportFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `x-uml-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export function parseProjectFile(text: string, fileName = ''): ImportResult {
  if (!text.trim()) return { ok: false, error: 'Le fichier est vide.' };

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }

  if (json !== undefined) {
    const project = readProject(json);
    if (project) return { ok: true, boards: project.boards };
    return { ok: false, error: 'Ce fichier JSON n’est pas un projet X-UML.' };
  }

  if (/\.json$/i.test(fileName)) return { ok: false, error: 'Ce fichier .json est illisible (JSON invalide).' };

  // Script texte : on retire les balises PlantUML éventuelles.
  const source = text
    .split(/\r?\n/)
    .filter((l) => !/^\s*@(start|end)uml\b/i.test(l))
    .join('\n');
  const name = fileName.replace(/\.[^.]+$/, '') || 'Importé';
  return { ok: true, boards: [newBoard(name, source)] };
}
