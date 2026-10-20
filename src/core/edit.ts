import { formatDecl, parseDecl } from './decl';
import { OPERATORS, RELATION } from './parser';
import type { RelationKind } from './types';

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

  const m = RELATION.exec(code.trim());
  if (!m) return null;
  const [, from, op, to, label] = m;
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
    label: label?.trim() || undefined,
  };
}

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
  const text = change.label !== undefined ? change.label.trim() : p.label;
  const label = text ? ` : ${text}` : '';
  const comment = p.comment ? ` ${p.comment}` : '';
  p.lines[p.idx] = `${p.indent}${a} ${SYMBOL[kind]} ${b}${label}${comment}${p.eol}`;
  return p.lines.join('\n');
}

/**
 * Ajoute une relation en fin de script. Si le script se termine par un bloc de relations,
 * la nouvelle ligne s'y colle ; sinon une ligne vide la sépare des déclarations.
 */
export function addRelation(source: string, from: string, to: string, kind: RelationKind, label?: string): string {
  const line = `${from} ${SYMBOL[kind]} ${to}${label?.trim() ? ` : ${label.trim()}` : ''}`;
  const trimmed = source.replace(/\s+$/, '');
  if (!trimmed) return `${line}\n`;
  const lastLine = trimmed.slice(trimmed.lastIndexOf('\n') + 1).trim();
  const sep = RELATION.test(lastLine.replace(/\/\/.*$/, '').trim()) ? '\n' : '\n\n';
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
