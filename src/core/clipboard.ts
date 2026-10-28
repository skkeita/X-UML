import { renameElement } from './modelEdit';
import { matchRelation, parse } from './parser';
import type { Point, Positions } from './types';

/*
 * Copier / coller des éléments, y compris d'un onglet à l'autre.
 *
 * Le presse-papiers contient du script X-UML valide (déclarations, relations internes, notes, couleurs),
 * suivi des positions dans un commentaire : collé dans un éditeur de texte ou dans le mode Code,
 * il reste lisible et utilisable tel quel.
 */

const HEADER = '// X-UML : éléments copiés';
const POS_PREFIX = '// @positions ';

const DECL_HEAD = /^\s*(?:abstract\s+class|class|interface|enum|actor|usecase|object|system|package|note)\s+([\p{L}_][\p{L}\p{N}_]*)/u;
const GROUP_LINE = /^\s*(?:(?:package|system)\s+[\p{L}_][\p{L}\p{N}_]*(?:\s+"[^"]*")?|diagram\s+\w+(?:\s+"[^"]*")?)\s*:/u;
const NOTE_TARGETS = /^(\s*note\s+[\p{L}_][\p{L}\p{N}_]*\s+"(?:[^"\\]|\\.)*")(?:\s*:\s*(.+?))?\s*$/u;
const COLOR_LINE = /^(\s*colou?r\s+)(.+?)(\s+(?:#[0-9a-fA-F]{3,6}|[a-zA-Zé]+)(?:\s+"[^"]*")?\s*)$/u;

/** Script des éléments choisis : leurs déclarations, les relations entre eux, leurs notes et couleurs. */
export function copySnippet(source: string, names: string[], positions: Positions): string {
  const keep = new Set(names);
  const out: string[] = [];
  let depth = 0;
  let copying = false;
  for (const raw of source.split('\n')) {
    const ci = raw.indexOf('//');
    const code = ci < 0 ? raw : raw.slice(0, ci);
    const t = code.trim();
    if (depth > 0) {
      if (copying) out.push(raw);
      if (t === '}') depth--;
      if (depth === 0) copying = false;
      continue;
    }
    if (GROUP_LINE.test(code)) continue; // les groupes ne suivent pas (leurs membres, si)
    const note = NOTE_TARGETS.exec(code);
    if (note) {
      const name = DECL_HEAD.exec(code)?.[1] ?? '';
      if (!keep.has(name)) continue;
      const targets = (note[2] ?? '').split(',').map((s) => s.trim()).filter((s) => keep.has(s));
      out.push(`${note[1].trim()}${targets.length ? ` : ${targets.join(', ')}` : ''}`);
      continue;
    }
    const head = DECL_HEAD.exec(code);
    if (head) {
      const opens = code.includes('{') && !t.endsWith('}');
      if (keep.has(head[1])) {
        out.push(raw.trimStart());
        if (opens) {
          depth = 1;
          copying = true;
        }
      } else if (opens) depth = 1;
      continue;
    }
    const rel = matchRelation(t);
    if (rel && keep.has(rel.from) && keep.has(rel.to)) {
      out.push(t);
      continue;
    }
    const color = COLOR_LINE.exec(code);
    if (color) {
      const kept = color[2].split(',').map((s) => s.trim()).filter((s) => keep.has(s));
      if (kept.length) out.push(`${color[1].trim()} ${kept.join(', ')}${color[3].trimEnd()}`);
    }
  }
  // Éléments cités seulement par une relation (implicites) : on les déclare pour qu'ils existent à l'arrivée.
  const declared = new Set(parse(out.join('\n')).diagram.classes.filter((c) => out.some((l) => DECL_HEAD.exec(l)?.[1] === c.name)).map((c) => c.name));
  const implicit = names.filter((n) => !declared.has(n)).map((n) => `class ${n}`);
  const pos = Object.fromEntries(names.filter((n) => positions[n]).map((n) => [n, positions[n]]));
  return [HEADER, ...implicit, ...out, `${POS_PREFIX}${JSON.stringify(pos)}`].join('\n');
}

/** Vrai si un texte collé ressemble à du script X-UML exploitable (au moins un élément). */
export function isPasteable(text: string): boolean {
  const { diagram, errors } = parse(text);
  return errors.length === 0 && diagram.classes.length > 0;
}

export interface PasteResult {
  source: string;
  /** Noms des éléments collés, après renommage éventuel. */
  names: string[];
  /** Positions des éléments collés (déjà décalées vers `at`). */
  positions: Positions;
}

/**
 * Colle un extrait dans un script. Un nom déjà pris est renommé (« Chien » → « Chien2 ») partout
 * dans l'extrait ; le bloc est posé avec son coin haut-gauche en `at` (sans positions : placement automatique).
 */
export function pasteSnippet(target: string, snippet: string, at: Point | null): PasteResult {
  const lines = snippet.replace(/\r\n/g, '\n').split('\n');
  const posLine = lines.find((l) => l.startsWith(POS_PREFIX));
  let positions: Positions = {};
  try {
    if (posLine) positions = JSON.parse(posLine.slice(POS_PREFIX.length));
  } catch {
    positions = {};
  }
  let text = lines.filter((l) => l !== HEADER && !l.startsWith(POS_PREFIX)).join('\n').trim();
  // Éléments déclarés dans l'extrait (un parent cité par « extends » mais non copié garde son nom :
  // il désigne l'élément existant du tableau d'arrivée).
  const declaredHere = new Set(text.split('\n').map((l) => DECL_HEAD.exec(l.replace(/\/\/.*$/, ''))?.[1]).filter((n): n is string => !!n));
  const pasted = parse(text).diagram.classes.map((c) => c.name).filter((n) => declaredHere.has(n));
  // Noms libres : ni dans le script cible, ni déjà utilisés par l'extrait.
  const used = new Set([...(target.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? []), ...pasted]);
  const targetNames = new Set(parse(target).diagram.classes.map((c) => c.name));
  const renames: Record<string, string> = {};
  for (const n of pasted) {
    if (!targetNames.has(n)) continue;
    const base = n.replace(/\d+$/, '') || n;
    let i = 2;
    while (used.has(`${base}${i}`)) i++;
    renames[n] = `${base}${i}`;
    used.add(renames[n]);
  }
  // Renommage en deux temps (via des noms temporaires) : « A → B » et « B → C » ne se mélangent pas.
  const tmp = (i: number) => `__xuml_tmp_${i}__`;
  const entries = Object.entries(renames);
  entries.forEach(([from], i) => (text = renameElement(text, from, tmp(i))));
  entries.forEach(([, to], i) => (text = renameElement(text, tmp(i), to)));
  const names = pasted.map((n) => renames[n] ?? n);

  // Positions : même disposition relative, bloc posé en `at`.
  const placed: Positions = {};
  const known = pasted.filter((n) => positions[n]);
  if (known.length && at) {
    const minX = Math.min(...known.map((n) => positions[n].x));
    const minY = Math.min(...known.map((n) => positions[n].y));
    for (const n of known) placed[renames[n] ?? n] = { x: Math.round((positions[n].x - minX + at.x) / 10) * 10, y: Math.round((positions[n].y - minY + at.y) / 10) * 10 };
  }
  const base = target.replace(/\s+$/, '');
  return { source: base ? `${base}\n\n${text}\n` : `${text}\n`, names, positions: placed };
}
