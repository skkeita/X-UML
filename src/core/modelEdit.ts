import { formatDecl, parseDecl } from './decl';
import { toIdent } from './edit';
import type { Visibility } from './types';
import type { ElementKind } from './vocabulary';

/*
 * Modifications du modèle faites depuis le panneau Visuel (sans écrire de code).
 * Chacune réécrit le script : il reste l'unique source de vérité, et le mode Code
 * montre toujours exactement ce que l'on a construit à la souris.
 */

const IDENT_CHARS = /[\p{L}\p{N}_]/u;
const CLASS_KW: Partial<Record<ElementKind, string>> = { class: 'class', abstract: 'abstract class', interface: 'interface', enum: 'enum' };
const ELEMENT_KW = ['actor', 'usecase', 'object', 'system', 'package'] as const;
const isClassFamily = (k: ElementKind) => k in CLASS_KW;

const DECL_HEAD = /^(\s*)(abstract\s+class|class|interface|enum|actor|usecase|object|system|package)\s+([\p{L}_][\p{L}\p{N}_]*)/u;
/** Ligne d'élément simple : actor / usecase / object / system / package (sans liste de membres). */
const ELEMENT_LINE = /^(\s*)(actor|usecase|object|system|package)\s+([\p{L}_][\p{L}\p{N}_]*)(?:\s*:\s*([\p{L}_][\p{L}\p{N}_]*))?(?:\s+"([^"]*)")?\s*$/u;
/** Groupe : package / system avec une liste de membres. */
const GROUP_LINE = /^(\s*)(package|system)\s+([\p{L}_][\p{L}\p{N}_]*)(?:\s+"([^"]*)")?\s*:\s*(.+?)\s*$/u;

const splitComment = (raw: string): [string, string] => {
  const i = raw.indexOf('//');
  return i < 0 ? [raw, ''] : [raw.slice(0, i), raw.slice(i)];
};
const withComment = (code: string, comment: string) => (comment ? `${code.trimEnd()} ${comment}` : code);

/** Tous les identifiants utilisés dans le script (pour garantir un nom libre). */
function usedNames(source: string): Set<string> {
  return new Set(source.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? []);
}
function freeName(source: string, base: string): string {
  const used = usedNames(source);
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

interface DeclInfo {
  lines: string[];
  /** Ligne de la déclaration. */
  idx: number;
  /** Dernière ligne du bloc { … } (= idx sans bloc). */
  end: number;
  keyword: string;
}

/** Retrouve la déclaration d'un élément (hors groupes) et l'étendue de son bloc. */
function findDecl(source: string, name: string): DeclInfo | null {
  const lines = source.split('\n');
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const [code] = splitComment(lines[i]);
    const t = code.trim();
    if (depth > 0) {
      if (t === '}') depth--;
      continue;
    }
    const m = DECL_HEAD.exec(code);
    if (!m) continue;
    const opens = code.includes('{') && !t.endsWith('}');
    if (m[3] === name && !GROUP_LINE.test(code)) {
      let end = i;
      if (opens) {
        let d = 1;
        while (end + 1 < lines.length && d > 0) {
          end++;
          if (splitComment(lines[end])[0].trim() === '}') d--;
        }
      }
      return { lines, idx: i, end, keyword: m[2].replace(/\s+/g, ' ') };
    }
    if (opens) depth = 1;
  }
  return null;
}

/** Dernière ligne (fin de bloc comprise) de la dernière déclaration : les nouveaux éléments s'y ajoutent. */
function lastDeclEnd(lines: string[]): number {
  let last = -1;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const [code] = splitComment(lines[i]);
    const t = code.trim();
    if (depth > 0) {
      if (t === '}') {
        depth--;
        if (depth === 0) last = i;
      }
      continue;
    }
    if (DECL_HEAD.test(code)) {
      last = i;
      if (code.includes('{') && !t.endsWith('}')) depth = 1;
    }
  }
  return last;
}

/** Insère des lignes après les déclarations existantes (avant les relations), séparées par une ligne vide. */
export function insertDecl(source: string, block: string[]): string {
  const trimmed = source.replace(/\s+$/, '');
  if (!trimmed) return `${block.join('\n')}\n`;
  const lines = trimmed.split('\n');
  const at = lastDeclEnd(lines);
  if (at < 0) return `${block.join('\n')}\n\n${trimmed}\n`;
  lines.splice(at + 1, 0, '', ...block);
  return `${lines.join('\n')}\n`;
}

const quote = (s: string) => s.replace(/"/g, '’');

/**
 * Ajoute un élément nommé librement (« Gestion des commandes ») : l'identifiant du script est
 * dérivé du nom, le nom exact est conservé comme libellé quand il diffère (acteurs, cas…).
 */
export function addElement(source: string, kind: ElementKind, display: string): { source: string; name: string } {
  const label = display.trim();
  const name = freeName(source, toIdent(label || (isClassFamily(kind) ? 'Classe' : 'Element')));
  let line: string;
  if (isClassFamily(kind)) line = `${CLASS_KW[kind]} ${name}`;
  else line = `${kind} ${name}${label && label !== name ? ` "${quote(label)}"` : ''}`;
  return { source: insertDecl(source, [line]), name };
}

/** Remplace un identifiant partout (hors chaînes "…" et commentaires) : déclarations, relations, groupes, types. */
export function renameElement(source: string, from: string, to: string): string {
  const target = toIdent(to);
  if (!target || target === from) return source;
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${from}(?![\\p{L}\\p{N}_])`, 'gu');
  return source
    .split('\n')
    .map((raw) => {
      const [code, comment] = splitComment(raw);
      const parts = code.split(/("[^"]*")/);
      return parts.map((p, i) => (i % 2 === 1 ? p : p.replace(re, target))).join('') + comment;
    })
    .join('\n');
}

/** Vrai si `name` est déjà utilisé par un autre élément du script. */
export const nameTaken = (source: string, name: string, except?: string): boolean => {
  const id = toIdent(name);
  return id !== except && usedNames(source).has(id);
};

/** Libellé affiché d'un acteur, cas d'utilisation, objet, système ou paquetage. */
export function setElementLabel(source: string, name: string, label: string): string {
  const d = findDecl(source, name);
  if (!d) return source;
  const [code, comment] = splitComment(d.lines[d.idx]);
  const m = ELEMENT_LINE.exec(code);
  if (!m) return source;
  const [, indent, kw, id, type] = m;
  const l = label.trim();
  d.lines[d.idx] = withComment(`${indent}${kw} ${id}${type ? ` : ${type}` : ''}${l && l !== id ? ` "${quote(l)}"` : ''}`, comment);
  return d.lines.join('\n');
}

/** Classe d'un objet (« ihm : EcranCommande »). */
export function setObjectType(source: string, name: string, type: string): string {
  const d = findDecl(source, name);
  if (!d) return source;
  const [code, comment] = splitComment(d.lines[d.idx]);
  const m = ELEMENT_LINE.exec(code);
  if (!m || m[2] !== 'object') return source;
  const t = type.trim() ? toIdent(type) : '';
  d.lines[d.idx] = withComment(`${m[1]}object ${m[3]}${t ? ` : ${t}` : ''}${m[5] ? ` "${m[5]}"` : ''}`, comment);
  return d.lines.join('\n');
}

/** Ajoute la déclaration d'un élément cité seulement dans des relations. */
function ensureDecl(source: string, name: string): string {
  return findDecl(source, name) ? source : insertDecl(source, [`class ${name}`]);
}

/**
 * Change la nature d'un élément. Entre variantes de classe (classe, abstraite, interface, énumération)
 * les membres sont conservés ; entre éléments simples (acteur, cas…) le libellé aussi. Passer d'une
 * famille à l'autre n'est possible que sans membres (sinon on perdrait du contenu sans prévenir).
 */
export function setElementKind(source: string, name: string, kind: ElementKind): string {
  const src = ensureDecl(source, name);
  const d = findDecl(src, name);
  if (!d) return source;
  const [code, comment] = splitComment(d.lines[d.idx]);
  const decl = parseDecl(code.trimEnd());
  if (decl) {
    if (isClassFamily(kind)) {
      decl.keyword = CLASS_KW[kind] ?? 'class';
      d.lines[d.idx] = withComment(formatDecl(decl), comment);
      return d.lines.join('\n');
    }
    if (d.end > d.idx) return source; // classe avec membres : on ne les jette pas
    d.lines[d.idx] = withComment(`${decl.indent}${kind} ${name}`, comment);
    return d.lines.join('\n');
  }
  const m = ELEMENT_LINE.exec(code);
  if (!m) return source;
  const [, indent, , id, type, label] = m;
  if (isClassFamily(kind)) d.lines[d.idx] = withComment(`${indent}${CLASS_KW[kind]} ${id}`, comment);
  else d.lines[d.idx] = withComment(`${indent}${kind} ${id}${kind === 'object' && type ? ` : ${type}` : ''}${label ? ` "${label}"` : ''}`, comment);
  return d.lines.join('\n');
}

/** Généralisations (« extends ») et interfaces réalisées (« implements ») d'une classe. */
export function setParents(source: string, name: string, parents: string[], interfaces: string[]): string {
  const src = ensureDecl(source, name);
  const d = findDecl(src, name);
  if (!d) return source;
  const [code, comment] = splitComment(d.lines[d.idx]);
  const decl = parseDecl(code.trimEnd());
  if (!decl) return source;
  decl.extends = parents.filter((p) => p && p !== name);
  decl.implements = interfaces.filter((p) => p && p !== name);
  d.lines[d.idx] = withComment(formatDecl(decl), comment);
  return d.lines.join('\n');
}

export interface MemberDraft {
  visibility: Visibility;
  text: string;
}

/** Réécrit les attributs et opérations d'une classe (le bloc { … } est créé ou retiré au besoin). */
export function setMembers(source: string, name: string, members: MemberDraft[]): string {
  const src = ensureDecl(source, name);
  const d = findDecl(src, name);
  if (!d) return source;
  const [code, comment] = splitComment(d.lines[d.idx]);
  const decl = parseDecl(code.trimEnd());
  if (!decl) return source;
  const body = members.filter((m) => m.text.trim()).map((m) => `${decl.indent}  ${m.visibility} ${m.text.trim()}`);
  decl.opens = body.length > 0;
  decl.closes = false;
  const head = withComment(formatDecl(decl), comment);
  const block = body.length ? [head, ...body, `${decl.indent}}`] : [head];
  d.lines.splice(d.idx, d.end - d.idx + 1, ...block);
  return d.lines.join('\n');
}

/**
 * Place un élément dans un groupe (paquetage, système), ou l'en sort (`group` = null).
 * Un système / paquetage simple devient un groupe dès qu'il reçoit un membre ; un groupe vidé
 * redevient un élément simple (il reste visible, rien n'est perdu).
 */
export function setGroupOf(source: string, name: string, group: string | null): string {
  const lines = source.split('\n').map((raw) => {
    const [code, comment] = splitComment(raw);
    const g = GROUP_LINE.exec(code);
    if (!g) return raw;
    const [, indent, kw, id, title, list] = g;
    const members = list.split(',').map((s) => s.trim()).filter((s) => s && s !== name);
    if (id === group) members.push(name);
    const t = title !== undefined ? ` "${title}"` : '';
    return withComment(members.length ? `${indent}${kw} ${id}${t} : ${members.join(', ')}` : `${indent}${kw} ${id}${t}`, comment);
  });
  let out = lines.join('\n');
  if (group && !lines.some((raw) => GROUP_LINE.exec(splitComment(raw)[0])?.[3] === group)) {
    // Le groupe visé est encore un élément simple : sa ligne reçoit la liste de membres.
    const d = findDecl(out, group);
    if (d) {
      const [code, comment] = splitComment(d.lines[d.idx]);
      const m = ELEMENT_LINE.exec(code);
      if (m && (m[2] === 'system' || m[2] === 'package')) {
        d.lines[d.idx] = withComment(`${m[1]}${m[2]} ${m[3]}${m[5] ? ` "${m[5]}"` : ''} : ${name}`, comment);
        out = d.lines.join('\n');
      }
    }
  }
  return out;
}

/** Caractère valide dans un identifiant (pour filtrer la saisie d'un nom de classe). */
export const isIdentChar = (ch: string) => IDENT_CHARS.test(ch);
export { ELEMENT_KW };

/** Groupe tel que le décrit le modèle (paquetage, système, cadre de diagramme). */
export interface GroupRef {
  name: string;
  kind: 'package' | 'system' | 'frame';
  /** Ligne (1-based) de sa déclaration. */
  line: number;
}

/** Renomme le titre affiché d'un groupe (l'identifiant du script ne change pas). */
export function setGroupTitle(source: string, group: GroupRef, title: string): string {
  const lines = source.split('\n');
  const i = group.line - 1;
  if (i < 0 || i >= lines.length) return source;
  const [code, comment] = splitComment(lines[i]);
  const t = title.trim().replace(/"/g, '’');
  if (group.kind === 'frame') {
    const m = /^(\s*diagram\s+\w+)(?:\s+"[^"]*")?(\s*:\s*.+?)\s*$/u.exec(code);
    if (!m) return source;
    lines[i] = withComment(`${m[1]}${t ? ` "${t}"` : ''}${m[2]}`, comment);
  } else {
    const m = GROUP_LINE.exec(code);
    if (!m || m[3] !== group.name) return source;
    const [, indent, kw, id, , list] = m;
    lines[i] = withComment(`${indent}${kw} ${id}${t && t !== id ? ` "${t}"` : ''} : ${list}`, comment);
  }
  return lines.join('\n');
}
