import { matchRelation } from './parser';

/*
 * Vues partielles de l'éditeur de code.
 *
 * Les liaisons sont gérées dans un panneau dédié : l'éditeur n'affiche donc que le code
 * des classes (codeLines), ou celui d'une seule classe (focusLines sans ses liaisons).
 *
 * On affiche uniquement les lignes qui concernent une classe : son bloc de déclaration
 * et les relations où elle apparaît. Ces lignes peuvent être éloignées dans le script ;
 * l'éditeur les montre côte à côte, avec leurs numéros de ligne d'origine.
 *
 * Toute modification dans cette vue est réinjectée à sa place dans le script complet,
 * qui reste l'unique source de vérité (sauvegarde, export, annulation).
 */

const DECL = /^(?:abstract\s+class|class|interface|enum|actor|usecase|object|system|package)\s+([\p{L}_][\p{L}\p{N}_]*)/u;

const code = (line: string) => line.replace(/\/\/.*$/, '').trim();

/** Vrai si la ligne (hors bloc de classe) est une liaison. */
const isRelation = (c: string) => matchRelation(c) !== null;

/** Indices (base 0, croissants) de toutes les lignes du script SAUF les liaisons. */
export function codeLines(source: string): number[] {
  const lines = source.split('\n');
  const out: number[] = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const c = code(lines[i]);
    if (inBlock) {
      out.push(i);
      if (c === '}') inBlock = false;
      continue;
    }
    const decl = DECL.exec(c);
    if (decl) {
      inBlock = c.includes('{') && !c.endsWith('}');
      out.push(i);
      continue;
    }
    if (!isRelation(c)) out.push(i);
  }
  return out;
}

/**
 * Indices (base 0, croissants) des lignes du script qui concernent la classe `name` :
 * son bloc de déclaration, et ses liaisons si `withRelations`.
 */
export function focusLines(source: string, name: string, withRelations = true): number[] {
  const lines = source.split('\n');
  const out: number[] = [];
  let inBlock = false;
  let inTarget = false;

  for (let i = 0; i < lines.length; i++) {
    const c = code(lines[i]);
    if (inBlock) {
      if (inTarget) out.push(i);
      if (c === '}') {
        inBlock = false;
        inTarget = false;
      }
      continue;
    }
    const decl = DECL.exec(c);
    if (decl) {
      const opens = c.includes('{') && !c.endsWith('}');
      if (decl[1] === name) {
        out.push(i);
        inTarget = opens;
      }
      inBlock = opens;
      continue;
    }
    if (!withRelations) continue;
    const rel = matchRelation(c);
    if (rel && (rel.from === name || rel.to === name)) out.push(i);
  }
  return out;
}

/** Texte affiché dans la vue ciblée. */
export function focusText(source: string, lines: number[]): string {
  const src = source.split('\n');
  return lines.map((i) => src[i] ?? '').join('\n');
}

/**
 * Réinjecte le texte modifié de la vue dans le script complet.
 * Seule la zone réellement modifiée (diff par lignes) est remplacée ; les autres lignes
 * gardent leur place. Renvoie aussi les nouveaux indices de la vue, pour que les lignes
 * en cours de frappe (pas encore valides) ne disparaissent pas de l'éditeur.
 */
export function applyFocusEdit(source: string, lines: number[], viewText: string): { source: string; lines: number[] } {
  const src = source.split('\n');
  const oldView = lines.map((i) => src[i] ?? '');
  const next = viewText.split('\n');

  let p = 0;
  while (p < oldView.length && p < next.length && oldView[p] === next[p]) p++;
  let s = 0;
  while (s < oldView.length - p && s < next.length - p && oldView[oldView.length - 1 - s] === next[next.length - 1 - s]) s++;

  const removed = new Set(lines.slice(p, lines.length - s));
  const inserted = next.slice(p, next.length - s);
  const kept = new Set(lines.filter((i) => !removed.has(i)));
  const insertAt =
    p < lines.length - s ? lines[p] : p > 0 ? lines[p - 1] + 1 : lines.length > 0 ? lines[0] : src.length;

  const out: string[] = [];
  const outLines: number[] = [];
  for (let i = 0; i <= src.length; i++) {
    if (i === insertAt) {
      for (const l of inserted) {
        outLines.push(out.length);
        out.push(l);
      }
    }
    if (i === src.length) break;
    if (removed.has(i)) continue;
    if (kept.has(i)) outLines.push(out.length);
    out.push(src[i]);
  }
  return { source: out.join('\n'), lines: outLines };
}
