import { formatDecl, parseDecl } from './decl';
import { OPERATORS, matchRelation } from './parser';
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
  via?: 'extends' | 'implements' | 'member';
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
  if (ref.auto && ref.via === 'member') return detachMemberRelation(source, ref, change);
  if (ref.auto) return updateAutoRelation(source, ref, change);
  const p = locate(source, ref);
  if (!p) return source;
  const kind = change.kind ?? p.kind;
  const from = change.from ?? p.from;
  const to = change.to ?? p.to;
  const [a, b] = change.reverse ? [to, from] : [from, to];
  // Inverser le sens échange aussi les multiplicités.
  const [ma, mb] = change.reverse ? [p.multTo, p.multFrom] : [p.multFrom, p.multTo];
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
export function addPackage(source: string, title: string, members: string[]): string {
  const id = toIdent(title || 'Package');
  const label = id === title.trim() ? '' : ` "${title.trim()}"`;
  return appendLine(source, `package ${id}${label} : ${members.join(', ')}`);
}

/** « Type » une sélection : cadre de diagramme UML (uc, ctx, pkg, com, class) autour des éléments. */
export function addDiagramFrame(source: string, type: DiagramType, title: string, members: string[]): string {
  const t = title.trim();
  return appendLine(source, `diagram ${type}${t ? ` "${t}"` : ''} : ${members.join(', ')}`);
}

const DECL_HEAD = /^\s*(?:abstract\s+class|class|interface|enum|actor|usecase|object|system|package)\s+([\p{L}_][\p{L}\p{N}_]*)/u;
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
    out.push(raw);
  }
  return out.join('\n');
}
