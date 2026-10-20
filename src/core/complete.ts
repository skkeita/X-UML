import { NAMED_COLORS } from './parser';
import type { Diagram } from './types';

/*
 * Autocomplétion à la demande (Ctrl+Espace) — logique pure, sans DOM.
 *
 * On complète le mot en cours avec ce qui EXISTE déjà dans le projet :
 *   - noms des classes / acteurs / cas d'utilisation / objets ;
 *   - attributs et méthodes déjà écrits (dans un bloc { … }, on les propose en premier) ;
 *   - mots-clés du langage (class, interface, actor, usecase, package, diagram, extends…).
 * Rien ne s'ouvre tout seul : l'utilisateur garde la main sur sa frappe.
 */

export type SuggestionType = 'classe' | 'élément' | 'attribut' | 'méthode' | 'mot-clé';

export interface Suggestion {
  type: SuggestionType;
  label: string;
  insert: string;
  /** Information secondaire (ex. « dans Animal »). */
  detail?: string;
}

export interface Completion {
  from: number;
  to: number;
  items: Suggestion[];
}

export const KEYWORDS = [
  'class',
  'abstract class',
  'interface',
  'enum',
  'extends',
  'implements',
  'actor',
  'usecase',
  'object',
  'system',
  'package',
  'diagram class',
  'diagram usecase',
  'diagram context',
  'diagram package',
  'diagram communication',
  'color',
  'style square',
  'style rounded',
  'legend',
  'legend off',
];

const MAX = 10;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** Vrai si la position est dans un bloc { … } (déclaration de classe). */
function insideBlock(text: string, pos: number): boolean {
  let depth = 0;
  for (const raw of text.slice(0, pos).split('\n')) {
    const line = raw.replace(/\/\/.*$/, '');
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
    }
  }
  return depth > 0;
}

export function complete(text: string, caret: number, diagram: Diagram): Completion | null {
  // Mot en cours (lettres, chiffres, _) juste avant le curseur.
  let from = caret;
  while (from > 0 && /[\p{L}\p{N}_]/u.test(text[from - 1])) from--;
  const typed = text.slice(from, caret);
  const t = norm(typed);
  const lineStart = text.lastIndexOf('\n', from - 1) + 1;
  const before = text.slice(lineStart, from);
  if (before.includes('//')) return null;

  const inBlock = insideBlock(text, lineStart);
  const startOfLine = before.trim() === '';
  const matches = (s: string) => norm(s).startsWith(t) && s !== typed;

  const names: Suggestion[] = diagram.classes
    .filter((c) => matches(c.name))
    .map((c) => ({
      type: (c.kind ?? 'class') === 'class' ? ('classe' as const) : ('élément' as const),
      label: c.name,
      insert: c.name,
      detail: c.kind && c.kind !== 'class' ? c.kind : c.stereotype,
    }));

  // Membres existants, dédoublonnés (même texte dans plusieurs classes = une seule proposition).
  const seen = new Set<string>();
  const members: Suggestion[] = [];
  for (const c of diagram.classes) {
    for (const m of c.members) {
      if (seen.has(m.text) || !matches(m.text)) continue;
      seen.add(m.text);
      members.push({ type: m.kind === 'method' ? 'méthode' : 'attribut', label: m.text, insert: m.text, detail: `dans ${c.name}` });
    }
  }

  // « color A, B ▮ » : on propose les couleurs nommées.
  if (/^\s*colou?r\s+\S/.test(before) && !inBlock) {
    const colors = Object.keys(NAMED_COLORS)
      .filter((c) => matches(c))
      .map((c) => ({ type: 'mot-clé' as const, label: c, insert: `${c} `, detail: NAMED_COLORS[c] }));
    if (colors.length) return { from, to: caret, items: [...colors, ...names].slice(0, MAX) };
  }

  const keywords: Suggestion[] = KEYWORDS.filter((k) => matches(k)).map((k) => ({ type: 'mot-clé', label: k, insert: `${k} ` }));

  // Ordre selon le contexte : dans un bloc → membres puis types ; en début de ligne → mots-clés et noms.
  const items = inBlock
    ? [...members, ...names]
    : startOfLine
      ? [...names, ...keywords]
      : [...names, ...keywords.filter((k) => k.label === 'extends' || k.label === 'implements')];
  if (items.length === 0) return null;
  return { from, to: caret, items: items.slice(0, MAX) };
}
