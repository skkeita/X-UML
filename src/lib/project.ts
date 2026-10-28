import type { EdgeAnchors } from '../core/routing';
import type { DiagramType, Point, Positions } from '../core/types';

/*
 * Projet X-UML : plusieurs tableaux blancs (onglets). Chaque tableau a son propre script
 * et la position de ses éléments ; on peut y mélanger classes, acteurs, cas d'utilisation,
 * objets, paquetages… et « typer » des zones en diagrammes.
 */

export interface Board {
  id: string;
  name: string;
  source: string;
  positions: Positions;
  /** Type de diagramme choisi pour ce tableau (vocabulaire, éléments proposés). Absent : déduit du contenu. */
  type?: DiagramType;
  /** Extrémités de flèches placées à la main (clé : relationKey). Comme les positions, hors du script. */
  anchors?: Record<string, EdgeAnchors>;
}

export interface Project {
  boards: Board[];
}

let counter = 0;
export const newBoardId = (): string => `b${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newBoard(name: string, source = '', positions: Positions = {}, type?: DiagramType): Board {
  return { id: newBoardId(), name, source, positions, ...(type ? { type } : {}) };
}

const TYPES: DiagramType[] = ['class', 'usecase', 'context', 'package', 'communication'];

const isPoint = (v: unknown): v is Point =>
  typeof v === 'object' && v !== null && Number.isFinite((v as Point).x) && Number.isFinite((v as Point).y);

/** Ne garde que les positions valides : un fichier abîmé ne doit pas casser l'affichage. */
export function cleanPositions(raw: unknown): Positions {
  const out: Positions = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [name, p] of Object.entries(raw)) if (isPoint(p)) out[name] = { x: p.x, y: p.y };
  return out;
}

const SIDES = ['top', 'right', 'bottom', 'left'];
const isAnchor = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && SIDES.includes((v as { side: string }).side) && Number.isFinite((v as { t: number }).t);

/** Ne garde que les ancrages valides (fichier modifié à la main, ancienne version…). */
export function cleanAnchors(raw: unknown): Record<string, EdgeAnchors> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Record<string, EdgeAnchors> = {};
  for (const [k, v] of Object.entries(raw as Record<string, { start?: unknown; end?: unknown }>)) {
    if (typeof v !== 'object' || v === null) continue;
    const e: EdgeAnchors = {};
    if (isAnchor(v.start)) e.start = v.start as EdgeAnchors['start'];
    if (isAnchor(v.end)) e.end = v.end as EdgeAnchors['end'];
    if (e.start || e.end) out[k] = e;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Lit un tableau venant d'un fichier ou du stockage (null s'il est inutilisable). */
export function cleanBoard(raw: unknown, fallbackName: string): Board | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Partial<Board>;
  if (typeof b.source !== 'string') return null;
  return {
    id: typeof b.id === 'string' && b.id ? b.id : newBoardId(),
    name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : fallbackName,
    source: b.source,
    positions: cleanPositions(b.positions),
    ...(TYPES.includes(b.type as DiagramType) ? { type: b.type } : {}),
    ...(cleanAnchors(b.anchors) ? { anchors: cleanAnchors(b.anchors) } : {}),
  };
}

/**
 * Accepte les deux formats :
 *  - v2 : { boards: [...] } (plusieurs tableaux) ;
 *  - v1 : { source, positions } (un seul diagramme, anciennes versions) → un tableau.
 */
export function readProject(raw: unknown): Project | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as { boards?: unknown; source?: unknown; positions?: unknown };
  if (Array.isArray(obj.boards)) {
    const boards = obj.boards.map((b, i) => cleanBoard(b, `Tableau ${i + 1}`)).filter((b): b is Board => b !== null);
    // Identifiants uniques garantis (un fichier modifié à la main peut en dupliquer).
    const seen = new Set<string>();
    for (const b of boards) {
      if (seen.has(b.id)) b.id = newBoardId();
      seen.add(b.id);
    }
    return boards.length ? { boards } : null;
  }
  if (typeof obj.source === 'string') return { boards: [newBoard('Diagramme', obj.source, cleanPositions(obj.positions))] };
  return null;
}
