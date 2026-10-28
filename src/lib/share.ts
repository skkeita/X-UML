import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { cleanBoard, newBoardId, type Board } from './project';

/*
 * Partage par lien : le tableau (script, positions, type, ancres) est compressé et placé
 * dans le fragment de l'adresse (#d=…). Le fragment n'est jamais envoyé au serveur :
 * aucun compte, aucun stockage distant, le diagramme voyage dans le lien lui-même.
 */

export const SHARE_PREFIX = '#d=';
/** Au-delà, certaines messageries tronquent les liens : on prévient l'utilisateur. */
export const LONG_LINK = 8000;

const toB64Url = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Tableau → fragment « #d=… » (positions arrondies : le lien reste court). */
export function encodeBoard(board: Board): string {
  const positions = Object.fromEntries(Object.entries(board.positions).map(([k, p]) => [k, { x: Math.round(p.x), y: Math.round(p.y) }]));
  const payload = { v: 1, name: board.name, source: board.source, positions, ...(board.type ? { type: board.type } : {}), ...(board.anchors ? { anchors: board.anchors } : {}) };
  return SHARE_PREFIX + toB64Url(deflateSync(strToU8(JSON.stringify(payload)), { level: 9 }));
}

/** Fragment « #d=… » → tableau (nouvel identifiant). null si le lien est abîmé. */
export function decodeBoard(hash: string): Board | null {
  if (!hash.startsWith(SHARE_PREFIX)) return null;
  try {
    const raw = JSON.parse(strFromU8(inflateSync(fromB64Url(hash.slice(SHARE_PREFIX.length)))));
    const b = cleanBoard({ ...raw, id: newBoardId() }, 'Diagramme partagé');
    return b ? { ...b, id: newBoardId() } : null;
  } catch {
    return null;
  }
}

/** Lien complet vers l'application, avec le tableau. */
export const shareUrl = (board: Board, base = `${window.location.origin}${window.location.pathname}`) => base + encodeBoard(board);
