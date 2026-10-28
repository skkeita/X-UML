import { cleanBoard, type Board } from './project';

/*
 * Historique des versions locales : instantanés du projet pris automatiquement
 * (à l'ouverture, toutes les 10 minutes s'il a changé, avant un import, avant de fermer un onglet).
 * Tout reste dans ce navigateur ; on garde les MAX derniers, les plus anciens sont oubliés.
 */

export const VERSIONS_KEY = 'x-uml:versions:v1';
export const MAX_VERSIONS = 30;
export const SNAPSHOT_EVERY = 10 * 60 * 1000;

export type VersionReason = 'open' | 'auto' | 'import' | 'close' | 'restore' | 'manual';
export const REASON_LABEL: Record<VersionReason, string> = {
  open: 'À l’ouverture',
  auto: 'Sauvegarde automatique',
  import: 'Avant un import',
  close: 'Avant la fermeture d’un tableau',
  restore: 'Avant une restauration',
  manual: 'Version enregistrée',
};

export interface Version {
  id: string;
  /** Date (ms). */
  at: number;
  reason: VersionReason;
  boards: Board[];
}

/** Empreinte du contenu : deux instantanés identiques ne sont pas gardés en double. */
export const fingerprint = (boards: Board[]) =>
  JSON.stringify(boards.map((b) => [b.name, b.source, b.type ?? '', b.positions, b.anchors ?? null]));

export function loadVersions(): Version[] {
  try {
    const raw = JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((v): Version | null => {
        if (typeof v !== 'object' || !v || !Number.isFinite(v.at) || !Array.isArray(v.boards)) return null;
        const boards = v.boards.map((b: unknown, i: number) => cleanBoard(b, `Tableau ${i + 1}`)).filter((b: Board | null): b is Board => !!b);
        if (boards.length === 0) return null;
        return { id: String(v.id ?? v.at), at: v.at, reason: (v.reason in REASON_LABEL ? v.reason : 'auto') as VersionReason, boards };
      })
      .filter((v): v is Version => !!v)
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** Écrit la liste ; si le quota est dépassé, oublie les plus anciennes jusqu'à ce que ça passe. */
function store(list: Version[]): Version[] {
  let keep = list.slice(0, MAX_VERSIONS);
  while (keep.length > 0) {
    try {
      localStorage.setItem(VERSIONS_KEY, JSON.stringify(keep));
      return keep;
    } catch {
      keep = keep.slice(0, -1);
    }
  }
  try {
    localStorage.removeItem(VERSIONS_KEY);
  } catch {
    /* stockage indisponible */
  }
  return [];
}

/**
 * Ajoute un instantané (sauf s'il est identique au plus récent, ou au contenu vide de départ).
 * Renvoie la liste à jour.
 */
export function addVersion(boards: Board[], reason: VersionReason, now = Date.now()): Version[] {
  const list = loadVersions();
  if (boards.every((b) => !b.source.trim())) return list;
  if (list[0] && fingerprint(list[0].boards) === fingerprint(boards)) return list;
  return store([{ id: `v${now.toString(36)}`, at: now, reason, boards }, ...list]);
}

export function deleteVersion(id: string): Version[] {
  return store(loadVersions().filter((v) => v.id !== id));
}
