import type { Point, Positions } from '../core/types';

/*
 * Fichier de projet X-UML (.json) : tout ce qu'il faut pour retrouver son travail à l'identique
 * — le code ET la position de chaque classe. Lisible et modifiable à la main si besoin.
 *
 * À l'import, on accepte aussi un simple fichier texte contenant le script (.txt, .xuml, .puml),
 * pour récupérer un diagramme écrit ailleurs.
 */

export interface ProjectFile {
  app: 'x-uml';
  version: 1;
  exportedAt: string;
  source: string;
  positions: Positions;
}

export type ImportResult = { ok: true; source: string; positions: Positions } | { ok: false; error: string };

export function serializeProject(source: string, positions: Positions, now = new Date()): string {
  const file: ProjectFile = { app: 'x-uml', version: 1, exportedAt: now.toISOString(), source, positions };
  return JSON.stringify(file, null, 2);
}

/** Nom proposé au téléchargement : x-uml-AAAA-MM-JJ.json */
export function exportFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `x-uml-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

const isPoint = (v: unknown): v is Point =>
  typeof v === 'object' && v !== null && Number.isFinite((v as Point).x) && Number.isFinite((v as Point).y);

/** Ne garde que les positions valides : un fichier abîmé ne doit pas casser l'affichage. */
function cleanPositions(raw: unknown): Positions {
  const out: Positions = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [name, p] of Object.entries(raw)) if (isPoint(p)) out[name] = { x: p.x, y: p.y };
  return out;
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
    const obj = json as Partial<ProjectFile>;
    if (typeof obj === 'object' && obj !== null && typeof obj.source === 'string') {
      return { ok: true, source: obj.source, positions: cleanPositions(obj.positions) };
    }
    return { ok: false, error: 'Ce fichier JSON n’est pas un projet X-UML.' };
  }

  if (/\.json$/i.test(fileName)) return { ok: false, error: 'Ce fichier .json est illisible (JSON invalide).' };

  // Script texte : on retire les balises PlantUML éventuelles.
  const source = text
    .split(/\r?\n/)
    .filter((l) => !/^\s*@(start|end)uml\b/i.test(l))
    .join('\n');
  return { ok: true, source, positions: {} };
}
