import { formatDecl, parseDecl } from './decl';
import { insertDecl } from './modelEdit';
import { OPERATORS, matchRelation, parse } from './parser';
import type { DiagramType, RelationKind } from './types';

/*
 * Édition « inverse » : une action faite sur le canevas réécrit la ligne correspondante
 * du script. Le texte reste l'unique source de vérité → pas de désynchronisation
 * entre ce que l'on voit et ce qui est enregistré / exporté.
 */

/** Symbole textuel de chaque type de relation (inverse de OPERATORS). */
export const SYMBOL: Record<RelationKind, string> = Object.fromEntries(
  Object.entries(OPERATORS).map(([op, kind]) => [kind, op]),
) as Record<RelationKind, string>;

/** Ordre et libellés affichés dans le sélecteur (raccourcis clavier 1 → 7). */
export const RELATION_CHOICES: { kind: RelationKind; label: string; hint: string }[] = [
  { kind: 'association', label: 'Association', hint: 'Lien simple entre deux classes' },
  { kind: 'directed', label: 'Association dirigée', hint: 'A connaît B (navigable)' },
  { kind: 'inheritance', label: 'Héritage', hint: 'A est une sorte de B' },
  { kind: 'realization', label: 'Réalisation', hint: 'A implémente l’interface B' },
  { kind: 'dependency', label: 'Dépendance', hint: 'A utilise B ponctuellement' },
  { kind: 'composition', label: 'Composition', hint: 'A possède B (cycle de vie lié)' },
  { kind: 'aggregation', label: 'Agrégation', hint: 'A regroupe des B (indépendants)' },
];

export interface RelationRef {
  line: number;
  from: string;
  to: string;
  /** Liaison créée automatiquement à partir du code. */
  auto?: boolean;
  via?: 'extends' | 'implements' | 'member' | 'note';
  /** Type actuel (utile pour une liaison déduite, qu'on réécrit à l'identique sauf changement). */
  kind?: RelationKind;
}

export interface RelationChange {
  kind?: RelationKind;
  reverse?: boolean;
  /** Nouvelle classe source / cible (panneau Liaisons). */
  from?: string;
  to?: string;
  /** Nouveau libellé ; chaîne vide = supprimer le libellé. */
  label?: string;
  /** Multiplicités (« 1 », « 0..* ») ; chaîne vide = la retirer. */
  multFrom?: string;
  multTo?: string;
}

interface ParsedLine {
  lines: string[];
  idx: number;
  indent: string;
  comment: string;
  eol: string;
  from: string;
  to: string;
  kind: RelationKind;
  label?: string;
  multFrom?: string;
  multTo?: string;
}

/** Retrouve la ligne de la relation et vérifie qu'elle correspond toujours (from/to). */
function locate(source: string, ref: RelationRef): ParsedLine | null {
  const lines = source.split('\n');
  const idx = ref.line - 1;
  const raw = lines[idx];
  if (raw === undefined) return null;

  const eol = raw.endsWith('\r') ? '\r' : '';
  const body = eol ? raw.slice(0, -1) : raw;
  const cut = body.indexOf('//');
  const code = cut >= 0 ? body.slice(0, cut) : body;
  const comment = cut >= 0 ? body.slice(cut) : '';

  const m = matchRelation(code.trim());
  if (!m) return null;
  const { from, op, to, label } = m;
  // Garde-fou : si le texte a changé entre-temps, on ne touche à rien.
  if (from !== ref.from || to !== ref.to) return null;

  return {
    lines,
    idx,
    indent: /^\s*/.exec(code)?.[0] ?? '',
    comment,
    eol,
    from,
    to,
    kind: OPERATORS[op],
    label,
    multFrom: m.multFrom,
    multTo: m.multTo,
  };
}

/** « A "1" -- "0..*" B » : multiplicités écrites seulement si présentes. */
const relationText = (a: string, ma: string | undefined, op: string, mb: string | undefined, b: string) =>
  `${a}${ma ? ` "${ma}"` : ''} ${op} ${mb ? `"${mb}" ` : ''}${b}`;

/** Change le type et/ou le sens d'une relation. Renvoie le source inchangé si la ligne ne correspond plus. */
export function updateRelation(source: string, ref: RelationRef, change: RelationChange): string {
  // Lien d'une note : seule la cible peut changer (glisser l'extrémité sur un autre élément).
  if (ref.via === 'note') {
    if (change.to && change.to !== ref.to) return setNoteTargets(source, ref.from, (ts) => [...ts.filter((t) => t !== ref.to && t !== change.to), change.to!]);
    return source;
  }
  if (ref.auto && ref.via === 'member') return detachMemberRelation(source, ref, change);
  if (ref.auto) return updateAutoRelation(source, ref, change);
  const p = locate(source, ref);
  if (!p) return source;
  const kind = change.kind ?? p.kind;
  const from = change.from ?? p.from;
  const to = change.to ?? p.to;
  const [a, b] = change.reverse ? [to, from] : [from, to];
  // Inverser le sens échange aussi les multiplicités.
  const mf = change.multFrom !== undefined ? change.multFrom.trim().replace(/"/g, '') || undefined : p.multFrom;
  const mt = change.multTo !== undefined ? change.multTo.trim().replace(/"/g, '') || undefined : p.multTo;
  const [ma, mb] = change.reverse ? [mt, mf] : [mf, mt];
  const text = change.label !== undefined ? change.label.trim() : p.label;
  // Devenue un héritage / une réalisation (sans libellé) : elle rejoint la déclaration de la classe.
  if ((kind === 'inheritance' || kind === 'realization') && !text && !ma && !mb && a !== b) {
    const withoutLine = [...p.lines.slice(0, p.idx), ...p.lines.slice(p.idx + 1)].join('\n');
    const inCode = addToDeclaration(withoutLine, a, b, kind);
    if (inCode !== null) return inCode;
  }
  const label = text ? ` : ${text}` : '';
  const comment = p.comment ? ` ${p.comment}` : '';
  p.lines[p.idx] = `${p.indent}${relationText(a, ma, SYMBOL[kind], mb, b)}${label}${comment}${p.eol}`;
  return p.lines.join('\n');
}

/**
 * Ajoute une relation en fin de script. Si le script se termine par un bloc de relations,
 * la nouvelle ligne s'y colle ; sinon une ligne vide la sépare des déclarations.
 */
export function addRelation(source: string, from: string, to: string, kind: RelationKind, label?: string): string {
  // Héritage / réalisation d'une classe déclarée : on l'écrit dans son code (« extends » / « implements »),
  // pour que le code et le diagramme disent toujours la même chose.
  if ((kind === 'inheritance' || kind === 'realization') && !label?.trim() && from !== to) {
    const inCode = addToDeclaration(source, from, to, kind);
    if (inCode !== null) return inCode;
  }
  const line = `${from} ${SYMBOL[kind]} ${to}${label?.trim() ? ` : ${label.trim()}` : ''}`;
  const trimmed = source.replace(/\s+$/, '');
  if (!trimmed) return `${line}\n`;
  const lastLine = trimmed.slice(trimmed.lastIndexOf('\n') + 1).trim();
  const sep = matchRelation(lastLine.replace(/\/\/.*$/, '').trim()) ? '\n' : '\n\n';
  return `${trimmed}${sep}${line}\n`;
}

/** Supprime la ligne de la relation (ou retire le parent de « extends » / « implements »). */
export function deleteRelation(source: string, ref: RelationRef): string {
  // Lien d'une note : on retire la cible de la ligne « note » (la note reste).
  if (ref.via === 'note') return setNoteTargets(source, ref.from, (ts) => ts.filter((t) => t !== ref.to));
  // Liaison déduite d'un attribut / d'une méthode : elle disparaît en retirant la référence du code.
  if (ref.auto && ref.via === 'member') return source;
  if (ref.auto) {
    const d = locateDecl(source, ref);
    if (!d) return source;
    d.decl[d.list] = d.decl[d.list].filter((n) => n !== ref.to);
    return d.write();
  }
  const p = locate(source, ref);
  if (!p) return source;
  p.lines.splice(p.idx, 1);
  return p.lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Liaisons automatiques (extends / implements)                        */
/* ------------------------------------------------------------------ */

function locateDecl(source: string, ref: RelationRef) {
  const lines = source.split('\n');
  const idx = ref.line - 1;
  const raw = lines[idx];
  if (raw === undefined) return null;
  const eol = raw.endsWith('\r') ? '\r' : '';
  const body = eol ? raw.slice(0, -1) : raw;
  const cut = body.indexOf('//');
  const code = cut >= 0 ? body.slice(0, cut) : body;
  const comment = cut >= 0 ? ` ${body.slice(cut)}` : '';
  const decl = parseDecl(code.trimEnd());
  if (!decl || decl.name !== ref.from) return null;
  const list: 'extends' | 'implements' | null = decl.extends.includes(ref.to)
    ? 'extends'
    : decl.implements.includes(ref.to)
      ? 'implements'
      : null;
  if (!list) return null;
  const write = () => {
    lines[idx] = `${formatDecl(decl)}${comment}${eol}`;
    return lines.join('\n');
  };
  return { decl, list, write };
}

/**
 * Modifier une liaison automatique :
 *  - rester un héritage / une réalisation depuis la même classe → on réécrit la déclaration
 *    (« extends Animal » devient « implements Animal » ou « extends Mammifere ») ;
 *  - sinon (autre type, autre source, sens inversé, libellé) → la liaison est « détachée » :
 *    retirée de la déclaration et écrite comme une liaison manuelle.
 */
function updateAutoRelation(source: string, ref: RelationRef, change: RelationChange): string {
  const d = locateDecl(source, ref);
  if (!d) return source;
  const currentKind: RelationKind = d.list === 'extends' ? 'inheritance' : 'realization';
  const kind = change.kind ?? currentKind;
  const from = change.from ?? ref.from;
  const to = change.to ?? ref.to;

  d.decl[d.list] = d.decl[d.list].filter((n) => n !== ref.to);
  const staysInCode = !change.reverse && from === ref.from && !change.label?.trim() && (kind === 'inheritance' || kind === 'realization');
  if (staysInCode) {
    const target = kind === 'inheritance' ? 'extends' : 'implements';
    if (!d.decl[target].includes(to)) d.decl[target].push(to);
    return d.write();
  }
  const [a, b] = change.reverse ? [to, from] : [from, to];
  return addRelation(d.write(), a, b, kind, change.label);
}

/**
 * Modifier une liaison déduite d'un attribut / d'une méthode : on écrit la version voulue comme
 * liaison manuelle (une liaison manuelle entre deux classes remplace toujours celle déduite).
 */
function detachMemberRelation(source: string, ref: RelationRef, change: RelationChange): string {
  const kind = change.kind ?? ref.kind ?? 'dependency';
  const from = change.from ?? ref.from;
  const to = change.to ?? ref.to;
  const [a, b] = change.reverse ? [to, from] : [from, to];
  return addRelation(source, a, b, kind, change.label);
}

/**
 * Ajoute `parent` à « extends » (héritage) ou « implements » (réalisation) dans la déclaration
 * de `name`. Renvoie null si la classe n'a pas de déclaration (elle n'existe que par ses liaisons).
 */
function addToDeclaration(source: string, name: string, parent: string, kind: RelationKind): string | null {
  const lines = source.split('\n');
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const eol = raw.endsWith('\r') ? '\r' : '';
    const body = eol ? raw.slice(0, -1) : raw;
    const cut = body.indexOf('//');
    const code = (cut >= 0 ? body.slice(0, cut) : body).trimEnd();
    if (depth > 0) {
      if (code.trim() === '}') depth--;
      continue;
    }
    const decl = parseDecl(code);
    if (!decl) continue;
    if (decl.opens) depth++;
    if (decl.name !== name) continue;
    const list = kind === 'inheritance' ? decl.extends : decl.implements;
    if (!list.includes(parent)) list.push(parent);
    // Un parent ne peut pas être à la fois « extends » et « implements ».
    if (kind === 'inheritance') decl.implements = decl.implements.filter((n) => n !== parent);
    else decl.extends = decl.extends.filter((n) => n !== parent);
    lines[i] = `${formatDecl(decl)}${cut >= 0 ? ` ${body.slice(cut)}` : ''}${eol}`;
    return lines.join('\n');
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Sélection multiple : package, cadre de diagramme, suppression       */
/* ------------------------------------------------------------------ */

/** Identifiant valide tiré d'un titre libre (« Gestion des ventes » → GestionDesVentes). */
export function toIdent(title: string): string {
  const words = title
    .trim()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean);
  const id = words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
  return /^[\p{L}_]/u.test(id) ? id : `P${id}`;
}

function appendLine(source: string, line: string): string {
  const trimmed = source.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n\n${line}\n` : `${line}\n`;
}

/** Regroupe des éléments dans un package (dessiné comme un dossier autour d'eux). */
export function addPackage(source: string, title: string, members: string[], kind: 'package' | 'system' = 'package'): string {
  const id = toIdent(title || (kind === 'system' ? 'Systeme' : 'Paquetage'));
  const label = id === title.trim() ? '' : ` "${title.trim()}"`;
  return appendLine(source, `${kind} ${id}${label} : ${members.join(', ')}`);
}

/** « Type » une sélection : cadre de diagramme UML (uc, ctx, pkg, com, class) autour des éléments. */
export function addDiagramFrame(source: string, type: DiagramType, title: string, members: string[]): string {
  const t = title.trim();
  return appendLine(source, `diagram ${type}${t ? ` "${t}"` : ''} : ${members.join(', ')}`);
}

const DECL_HEAD = /^\s*(?:abstract\s+class|class|interface|enum|actor|usecase|object|system|package|note)\s+([\p{L}_][\p{L}\p{N}_]*)/u;
const GROUP_LINE = /^(\s*(?:package|system)\s+[\p{L}_][\p{L}\p{N}_]*(?:\s+"[^"]*")?\s*:\s*|\s*diagram\s+\w+(?:\s+"[^"]*")?\s*:\s*)(.+)$/u;

/**
 * Supprime des éléments du script : leurs déclarations (bloc compris), les liaisons qui les citent,
 * et leurs mentions dans « extends / implements » et dans les groupes (un groupe vidé disparaît).
 */
export function deleteNodes(source: string, names: string[]): string {
  const gone = new Set(names);
  const lines = source.split('\n');
  const out: string[] = [];
  let skipBlock = false;
  let depth = 0;
  for (const raw of lines) {
    const code = raw.replace(/\/\/.*$/, '');
    const trimmed = code.trim();
    if (depth > 0) {
      if (trimmed === '}') depth--;
      if (!skipBlock) out.push(raw);
      if (depth === 0) skipBlock = false;
      continue;
    }
    // Groupe : on retire les membres supprimés (et le groupe s'il devient vide ou s'il est lui-même supprimé).
    const g = GROUP_LINE.exec(code);
    if (g) {
      const head = DECL_HEAD.exec(code);
      if (head && gone.has(head[1])) continue;
      const members = g[2].split(',').map((m) => m.trim()).filter((m) => m && !gone.has(m));
      if (members.length === 0) continue;
      out.push(`${g[1]}${members.join(', ')}`);
      continue;
    }
    // Note : on retire de sa liste les éléments supprimés (la note reste, sauf si c'est elle qu'on supprime).
    const noteLine = NOTE_LINE_RE.exec(code);
    if (noteLine && !gone.has(noteLine[2])) {
      const targets = (noteLine[3] ?? '').split(',').map((t) => t.trim()).filter((t) => t && !gone.has(t));
      out.push(`${noteLine[1]}${targets.length ? ` : ${targets.join(', ')}` : ''}`);
      continue;
    }
    const head = DECL_HEAD.exec(code);
    if (head) {
      const opens = code.includes('{') && !trimmed.endsWith('}');
      if (gone.has(head[1])) {
        if (opens) {
          depth = 1;
          skipBlock = true;
        }
        continue;
      }
      // Classe conservée : on retire les parents supprimés de extends / implements.
      const decl = parseDecl(code.trimEnd());
      if (decl && (decl.extends.some((n) => gone.has(n)) || decl.implements.some((n) => gone.has(n)))) {
        decl.extends = decl.extends.filter((n) => !gone.has(n));
        decl.implements = decl.implements.filter((n) => !gone.has(n));
        const comment = raw.slice(code.length);
        out.push(`${formatDecl(decl)}${comment ? ` ${comment.trim()}` : ''}`);
      } else out.push(raw);
      if (opens) depth = 1;
      continue;
    }
    const rel = matchRelation(trimmed);
    if (rel && (gone.has(rel.from) || gone.has(rel.to))) continue;
    // Couleurs : on retire seulement les éléments supprimés de la ligne.
    const color = /^(\s*colou?r\s+)(.+?)(\s+(?:#[0-9a-fA-F]{3,6}|[a-zA-Zé]+)(?:\s+"[^"]*")?\s*)$/u.exec(code);
    if (color) {
      const kept = color[2].split(',').map((n) => n.trim()).filter((n) => n && !gone.has(n));
      if (kept.length) out.push(`${color[1]}${kept.join(', ')}${color[3].trimEnd()}`);
      continue;
    }
    out.push(raw);
  }
  // Seul l'élément visé disparaît : un voisin qui n'existait qu'à travers une relation ou un groupe
  // supprimés reçoit sa propre déclaration (il reste à sa place, avec ses autres relations).
  const before = parse(source).diagram.classes;
  let result = out.join('\n');
  const after = new Set(parse(result).diagram.classes.map((c) => c.name));
  const orphans = before.filter((c) => !gone.has(c.name) && !after.has(c.name)).map((c) => `class ${c.name}`);
  if (orphans.length) result = insertDecl(result, orphans);
  return result;
}

/**
 * Duplique des éléments : leurs déclarations (bloc et membres compris) sont recopiées sous un nouveau nom
 * (« Chien » → « Chien2 »), ainsi que les liaisons internes à la sélection. Une copie qui hérite d'un
 * élément copié hérite de sa copie : le sous-ensemble dupliqué reste cohérent.
 * Renvoie le nouveau script et la correspondance ancien nom → nouveau nom.
 */
export function duplicateNodes(source: string, names: string[]): { source: string; renames: Record<string, string> } {
  const used = new Set(source.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? []);
  const renames: Record<string, string> = {};
  for (const n of names) {
    const base = n.replace(/\d+$/, '') || n;
    let i = 2;
    while (used.has(`${base}${i}`)) i++;
    renames[n] = `${base}${i}`;
    used.add(renames[n]);
  }
  const rn = (n: string) => renames[n] ?? n;
  const lines = source.split('\n');
  const copies: string[] = [];
  const declared = new Set<string>();
  let depth = 0;
  let copying = false;
  for (const raw of lines) {
    const code = raw.replace(/\/\/.*$/, '');
    const trimmed = code.trim();
    if (depth > 0) {
      if (copying) copies.push(raw);
      if (trimmed === '}') depth--;
      if (depth === 0) copying = false;
      continue;
    }
    if (GROUP_LINE.test(code)) continue; // un groupe n'est pas dupliqué (ses membres le sont)
    const head = DECL_HEAD.exec(code);
    if (head) {
      const opens = code.includes('{') && !trimmed.endsWith('}');
      if (head[1] in renames) {
        declared.add(head[1]);
        const decl = parseDecl(code.trimEnd());
        let line: string;
        if (decl) {
          decl.name = rn(decl.name);
          decl.extends = decl.extends.map(rn);
          decl.implements = decl.implements.map(rn);
          // parseDecl ne garde pas ce qui suit le nom d'un élément (libellé, type) : on recopie la ligne.
          line = /\b(?:class|interface|enum)\s/.test(code) ? formatDecl(decl) : code.trimEnd().replace(head[0], head[0].replace(new RegExp(`${head[1]}$`, 'u'), rn(head[1])));
        } else line = code.trimEnd().replace(head[0], head[0].replace(new RegExp(`${head[1]}$`, 'u'), rn(head[1])));
        copies.push(line.trimStart());
        if (opens) {
          depth = 1;
          copying = true;
        }
      } else if (opens) depth = 1;
      continue;
    }
    const rel = matchRelation(trimmed);
    if (rel && rel.from in renames && rel.to in renames) {
      copies.push(`${relationText(rn(rel.from), rel.multFrom, rel.op, rel.multTo, rn(rel.to))}${rel.label ? ` : ${rel.label}` : ''}`);
    }
  }
  // Éléments implicites (cités seulement dans une liaison) : on déclare leur copie.
  const implicit = names.filter((n) => !declared.has(n)).map((n) => `class ${rn(n)}`);
  const block = [...implicit, ...copies].join('\n');
  const trimmed = source.replace(/\s+$/, '');
  return { source: trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`, renames };
}

const COLOR_LINE = /^(\s*)colou?r\s+(.+?)\s+(#[0-9a-fA-F]{3,6}|[a-zA-Zé]+)((?:\s+"[^"]*")?)\s*$/u;

/**
 * Colore des éléments (ou retire leur couleur si `color` est null). Le libellé devient une entrée de la
 * légende. Les éléments sont d'abord retirés des lignes « color » existantes (une ligne vidée disparaît),
 * puis ajoutés à la ligne de même couleur et même libellé si elle existe : le script reste court.
 */
export function setColor(source: string, names: string[], color: string | null, label = ''): string {
  const gone = new Set(names);
  const lab = label.trim().replace(/"/g, '');
  const lines = source.split('\n');
  const out: string[] = [];
  let target = -1;
  for (const raw of lines) {
    const m = COLOR_LINE.exec(raw.replace(/\/\/.*$/, ''));
    if (!m) {
      out.push(raw);
      continue;
    }
    const [, indent, list, value, lbl] = m;
    const kept = list.split(',').map((s) => s.trim()).filter((s) => s && !gone.has(s));
    const sameTarget = color && value.toLowerCase() === color.toLowerCase() && lbl.trim() === (lab ? `"${lab}"` : '');
    if (sameTarget) {
      target = out.length;
      out.push(`${indent}color ${[...kept, ...names].join(', ')} ${value}${lbl}`);
    } else if (kept.length) out.push(`${indent}color ${kept.join(', ')} ${value}${lbl}`);
  }
  if (color && target < 0) return appendLine(out.join('\n'), `color ${names.join(', ')} ${color}${lab ? ` "${lab}"` : ''}`);
  return out.join('\n');
}

/** Coins carrés ou arrondis (arrondis = valeur par défaut : la ligne « style » est alors retirée). */
export function setCorners(source: string, corners: 'rounded' | 'square'): string {
  const kept = source.split('\n').filter((l) => !/^\s*style\s+(rounded|square|arrondi|carr[ée])\s*(\/\/.*)?$/iu.test(l));
  const s = kept.join('\n');
  return corners === 'square' ? appendLine(s, 'style square') : s;
}

/** Affiche ou masque la légende (« legend off »). */
export function setLegendVisible(source: string, visible: boolean): string {
  const kept = source.split('\n').filter((l) => !/^\s*legende?\s+(off|aucune)\s*(\/\/.*)?$/iu.test(l));
  const s = kept.join('\n');
  return visible ? s : appendLine(s, 'legend off');
}

/**
 * Dégroupe : le cadre (paquetage, système, cadre de diagramme) disparaît, ses membres restent
 * tels quels, à leur place. Les relations qui visaient le groupe lui-même sont retirées.
 */
export function ungroup(source: string, group: { name: string; kind: 'package' | 'system' | 'frame'; line: number }): string {
  if (group.kind !== 'frame') return deleteNodes(source, [group.name]);
  const lines = source.split('\n');
  const i = group.line - 1;
  if (i < 0 || i >= lines.length || !/^\s*diagram\s/.test(lines[i])) return source;
  lines.splice(i, 1);
  return lines.join('\n');
}


/* ------------------------------------------------------------------ */
/* Notes UML                                                           */
/* ------------------------------------------------------------------ */

const NOTE_LINE_RE = /^(\s*note\s+([\p{L}_][\p{L}\p{N}_]*)\s+"(?:[^"\\]|\\.)*")(?:\s*:\s*(.+?))?\s*$/u;

/** Modifie la liste des éléments auxquels une note est rattachée. */
export function setNoteTargets(source: string, note: string, fn: (targets: string[]) => string[]): string {
  return source
    .split('\n')
    .map((raw) => {
      const ci = raw.indexOf('//');
      const code = ci < 0 ? raw : raw.slice(0, ci);
      const m = NOTE_LINE_RE.exec(code);
      if (!m || m[2] !== note) return raw;
      const targets = fn((m[3] ?? '').split(',').map((t) => t.trim()).filter(Boolean));
      return `${m[1]}${targets.length ? ` : ${targets.join(', ')}` : ''}${ci < 0 ? '' : ` ${raw.slice(ci)}`}`;
    })
    .join('\n');
}

/** Ajoute une note (rattachée aux éléments donnés) ; renvoie le script et le nom de la note. */
export function addNote(source: string, text: string, targets: string[]): { source: string; name: string } {
  const used = new Set(source.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? []);
  let i = 1;
  while (used.has(`Note${i}`)) i++;
  const name = `Note${i}`;
  const body = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
  return { source: appendLine(source, `note ${name} "${body}"${targets.length ? ` : ${targets.join(', ')}` : ''}`), name };
}

/** Change le texte d'une note. */
export function setNoteText(source: string, note: string, text: string): string {
  const body = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
  return source
    .split('\n')
    .map((raw) => raw.replace(new RegExp(`^(\\s*note\\s+${note}\\s+)"(?:[^"\\\\]|\\\\.)*"`, 'u'), (_, head) => `${head}"${body}"`))
    .join('\n');
}
