import { IDENT, parseDecl } from './decl';

const IDENT_G = new RegExp(IDENT, 'gu');
import type {
  ClassNode,
  Diagram,
  DiagramStyle,
  DiagramType,
  Group,
  Member,
  NodeKind,
  ParseError,
  ParseResult,
  Relation,
  RelationKind,
  Stereotype,
  Visibility,
} from './types';

/*
 * Syntaxe supportée (volontairement minimale, proche de PlantUML) :
 *
 *   // commentaire
 *   abstract class Animal {
 *     # nom: string
 *     + manger(): void
 *   }
 *   interface Domestique { + getProprietaire(): Personne }
 *   Chien --|> Animal            (héritage)
 *   Chien ..|> Domestique        (réalisation)
 *   Personne --> Animal : adopte (association dirigée + libellé)
 *   Personne -- Adresse          (association)   *-- composition   o-- agrégation   ..> dépendance
 *
 *   class Chien extends Animal implements Domestique {   (liaisons créées automatiquement)
 *   Client "1" -- "0..*" Commande : passe                 (multiplicités)
 *
 * Tableau blanc — autres éléments UML :
 *   actor Client "Client fidèle"         acteur (bonhomme)
 *   usecase Payer "Payer la commande"    cas d'utilisation (ellipse)
 *   object c1 : Client                   objet (diagramme de communication)
 *   system Boutique                      système (diagramme de contexte statique)
 *   package Ventes                       paquetage (diagramme de paquetages)
 * Groupes (cadres autour d'éléments existants) :
 *   package Animaux : Chien, Chat        package qui regroupe des classes
 *   system Boutique : Payer, Commander   frontière du système (cas d'utilisation)
 *   diagram usecase "Commandes" : …      cadre de diagramme typé (class, usecase, context, package, communication)
 *
 * Les classes citées uniquement dans une relation sont créées implicitement.
 * UX : les identifiants acceptent les lettres accentuées (Étudiant, Réservation...).
 */


// L'ordre des alternatives compte : les opérateurs les plus longs d'abord.
// Multiplicités facultatives entre guillemets : A "1" -- "0..*" B
export const RELATION = new RegExp(
  `^(${IDENT})\\s*(?:"([^"]*)"\\s*)?(\\*--|o--|--\\|>|\\.\\.\\|>|-->|\\.\\.>|--)\\s*(?:"([^"]*)"\\s*)?(${IDENT})\\s*(?::\\s*(.+))?$`,
  'u',
);

export interface RelationLine {
  from: string;
  op: string;
  to: string;
  label?: string;
  multFrom?: string;
  multTo?: string;
}

/** Reconnaît une ligne de liaison (code sans commentaire, « trimé »). */
export function matchRelation(code: string): RelationLine | null {
  const m = RELATION.exec(code);
  if (!m) return null;
  const [, from, multFrom, op, multTo, to, label] = m;
  return {
    from,
    op,
    to,
    label: label?.trim() || undefined,
    multFrom: multFrom?.trim() || undefined,
    multTo: multTo?.trim() || undefined,
  };
}

const LIST = `${IDENT}(?:\\s*,\\s*${IDENT})*`;
/** actor / usecase / object / system / package (élément simple, libellé facultatif). */
const ELEMENT = new RegExp(`^(actor|usecase|object|system|package)\\s+(${IDENT})(?:\\s*:\\s*(${IDENT}))?(?:\\s+"([^"]*)")?$`, 'u');
/** package / system avec membres : un groupe dessiné autour d'eux. */
const GROUP = new RegExp(`^(package|system)\\s+(${IDENT})(?:\\s+"([^"]*)")?\\s*:\\s*(${LIST})$`, 'u');
/** Cadre de diagramme typé. */
const FRAME = new RegExp(`^diagram\\s+(class|usecase|context|package|communication)(?:\\s+"([^"]*)")?\\s*:\\s*(${LIST})$`, 'u');

/** Couleurs nommées (teintes claires : le texte reste lisible dessus). */
export const NAMED_COLORS: Record<string, string> = {
  rouge: '#fecaca',
  orange: '#fed7aa',
  jaune: '#fef08a',
  vert: '#bbf7d0',
  cyan: '#a5f3fc',
  bleu: '#bfdbfe',
  violet: '#ddd6fe',
  rose: '#fbcfe8',
  gris: '#e2e8f0',
};
const COLOR_VALUE = `#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|${Object.keys(NAMED_COLORS).join('|')}`;
/** color A, B #fca5a5 "Libellé de légende" */
const COLOR = new RegExp(`^colou?r\\s+(${LIST})\\s+(${COLOR_VALUE})(?:\\s+"([^"]*)")?$`, 'iu');
const STYLE = /^style\s+(rounded|square|arrondi|carr[ée])$/iu;
const LEGEND = /^legend(?:e)?(?:\s+"([^"]*)"|\s+(off|aucune))?$/iu;

/** #abc → #aabbcc, nom → hex, en minuscules. */
export function normalizeColor(v: string): string {
  const named = NAMED_COLORS[v.toLowerCase()];
  if (named) return named;
  const h = v.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

const FRAME_TITLE: Record<DiagramType, string> = {
  class: 'Diagramme de classes',
  usecase: 'Cas d’utilisation',
  context: 'Contexte statique',
  package: 'Paquetages',
  communication: 'Communication',
};

const MEMBER = /^([+\-#~])?\s*(.+)$/;

export const OPERATORS: Record<string, RelationKind> = {
  '--': 'association',
  '-->': 'directed',
  '--|>': 'inheritance',
  '..|>': 'realization',
  '..>': 'dependency',
  '*--': 'composition',
  'o--': 'aggregation',
};

function parseMember(text: string): Member {
  const m = MEMBER.exec(text);
  const visibility = ((m?.[1] as Visibility | undefined) ?? '+') as Visibility;
  const body = (m?.[2] ?? text).trim();
  return { visibility, text: body, kind: body.includes('(') ? 'method' : 'attribute' };
}

function stereotypeOf(keyword: string): Stereotype | undefined {
  if (keyword === 'interface') return 'interface';
  if (keyword === 'enum') return 'enum';
  if (keyword.startsWith('abstract')) return 'abstract';
  return undefined;
}

/**
 * Parse le script. Ne lève jamais d'exception : renvoie le diagramme partiel
 * + la liste d'erreurs. C'est à l'appelant de décider de conserver le dernier
 * rendu valide (cf. App.tsx).
 */
export function parse(source: string): ParseResult {
  const classes = new Map<string, ClassNode>();
  const relations: Relation[] = [];
  const errors: ParseError[] = [];
  let current: ClassNode | null = null;
  /** Membres à analyser une fois toutes les classes connues (elles peuvent être déclarées plus bas). */
  const memberRefs: { cls: string; member: Member; line: number }[] = [];

  const groups: Group[] = [];
  const style: DiagramStyle = { colors: {}, legend: [], corners: 'rounded' };
  let styled = false;
  const ensureClass = (name: string, line: number, implicit = false): ClassNode => {
    let node = classes.get(name);
    if (!node) {
      node = { name, members: [], line, ...(implicit ? { implicit: true } : {}) };
      classes.set(name, node);
    }
    return node;
  };

  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].replace(/\/\/.*$/, '').trim();
    if (!line) continue;

    // 1) À l'intérieur d'un bloc { ... }
    if (current) {
      if (line === '}') current = null;
      else {
        const member = parseMember(line);
        current.members.push(member);
        memberRefs.push({ cls: current.name, member, line: lineNo });
      }
      continue;
    }

    // 2) Apparence : couleurs (et légende), coins, légende
    const color = COLOR.exec(line);
    if (color) {
      const [, list, value, label] = color;
      const hex = normalizeColor(value);
      for (const n of list.split(',').map((m) => m.trim())) style.colors[n] = hex;
      const l = label?.trim();
      if (l && !style.legend.some((e) => e.color === hex && e.label === l)) style.legend.push({ color: hex, label: l });
      styled = true;
      continue;
    }
    const st = STYLE.exec(line);
    if (st) {
      style.corners = /^(rounded|arrondi)$/i.test(st[1]) ? 'rounded' : 'square';
      styled = true;
      continue;
    }
    const lg = LEGEND.exec(line);
    if (lg) {
      if (lg[2]) style.legendHidden = true;
      else if (lg[1] !== undefined) style.legendTitle = lg[1];
      styled = true;
      continue;
    }

    // 2a) Groupes : package / système avec membres, cadres de diagramme typés
    const group = GROUP.exec(line);
    if (group) {
      const [, kw, name, title, list] = group;
      const members = list.split(',').map((m) => m.trim());
      for (const m of members) ensureClass(m, lineNo, true);
      groups.push({ name, kind: kw === 'package' ? 'package' : 'system', title: title ?? name, members, line: lineNo });
      continue;
    }
    const frame = FRAME.exec(line);
    if (frame) {
      const [, type, title, list] = frame;
      const members = list.split(',').map((m) => m.trim());
      for (const m of members) ensureClass(m, lineNo, true);
      const diagramType = type as DiagramType;
      groups.push({
        name: `diagram${lineNo}`,
        kind: 'frame',
        diagramType,
        title: title ?? FRAME_TITLE[diagramType],
        members,
        line: lineNo,
      });
      continue;
    }

    // 2b) Éléments du tableau blanc : acteur, cas d'utilisation, objet, système, paquetage
    const el = ELEMENT.exec(line);
    if (el) {
      const [, kw, name, type, label] = el;
      if (type && kw !== 'object') {
        errors.push({ line: lineNo, message: `« ${kw} ${name} : ${type} » : seul un objet a un type (object c1 : Client)` });
        continue;
      }
      const node = ensureClass(name, lineNo);
      node.kind = kw as NodeKind;
      node.implicit = false;
      node.line = lineNo;
      node.label = kw === 'object' ? `${name}${type ? ` : ${type}` : ''}` : label;
      if (kw === 'object' && label) node.label = label;
      continue;
    }

    // 2c) Déclaration de classe / interface / enum
    const decl = parseDecl(line);
    if (decl) {
      const { keyword, name } = decl;
      const existing = classes.get(name);
      if (existing && existing.line !== lineNo && existing.members.length > 0) {
        errors.push({ line: lineNo, message: `« ${name} » est déjà déclarée ligne ${existing.line}` });
      }
      const node = ensureClass(name, lineNo);
      node.implicit = false;
      node.line = lineNo;
      const stereotype = stereotypeOf(keyword);
      if (stereotype) node.stereotype = stereotype;
      // Héritage écrit dans le code → liaisons créées automatiquement.
      for (const parent of decl.extends) {
        ensureClass(parent, lineNo);
        relations.push({ from: name, to: parent, kind: 'inheritance', line: lineNo, auto: true, via: 'extends' });
      }
      for (const parent of decl.implements) {
        ensureClass(parent, lineNo);
        relations.push({ from: name, to: parent, kind: 'realization', line: lineNo, auto: true, via: 'implements' });
      }
      if (decl.opens) current = node;
      continue;
    }

    // 3) Relation
    const rel = matchRelation(line);
    if (rel) {
      ensureClass(rel.from, lineNo, true);
      ensureClass(rel.to, lineNo, true);
      relations.push({
        from: rel.from,
        to: rel.to,
        kind: OPERATORS[rel.op],
        label: rel.label,
        line: lineNo,
        ...(rel.multFrom ? { multFrom: rel.multFrom } : {}),
        ...(rel.multTo ? { multTo: rel.multTo } : {}),
      });
      continue;
    }

    errors.push({
      line: lineNo,
      message: 'Syntaxe non reconnue. Attendu : « class Nom { … } », « class A extends B { » ou « A --|> B »',
    });
  }

  if (current) {
    const unclosed: ClassNode = current;
    errors.push({ line: unclosed.line, message: `Accolade fermante « } » manquante pour « ${unclosed.name} »` });
  }

  // Une liaison écrite à la fois avec « extends » et à la main n'est dessinée qu'une fois.
  const explicit = new Set(relations.filter((r) => !r.auto).map((r) => `${r.from}|${r.to}|${r.kind}`));
  const unique = relations.filter((r) => !r.auto || !explicit.has(`${r.from}|${r.to}|${r.kind}`));

  // Un attribut ou une méthode qui cite une autre classe la relie automatiquement :
  //   + animal: Animal        → association dirigée (la classe « connaît » Animal)
  //   + parle(a: Animal)      → dépendance (elle s'en sert ponctuellement)
  // Seulement si ces deux classes ne sont pas déjà reliées (dans un sens ou dans l'autre).
  const pair = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const linked = new Set(unique.map((r) => pair(r.from, r.to)));
  const fromMembers = new Map<string, Relation>();
  for (const { cls, member, line } of memberRefs) {
    for (const tok of member.text.matchAll(IDENT_G)) {
      const target = tok[0];
      if (target === cls || !classes.has(target) || linked.has(pair(cls, target))) continue;
      const kind = member.kind === 'attribute' ? 'directed' : 'dependency';
      const key = `${cls}|${target}`;
      const prev = fromMembers.get(key);
      // Un attribut (lien durable) l'emporte sur une simple utilisation dans une méthode.
      if (!prev || (prev.kind === 'dependency' && kind === 'directed')) {
        fromMembers.set(key, { from: cls, to: target, kind, line, auto: true, via: 'member' });
      }
    }
  }
  // Deux classes qui se citent mutuellement : une seule liaison.
  const memberRelations: Relation[] = [];
  const seen = new Set<string>();
  for (const r of fromMembers.values()) {
    if (seen.has(pair(r.from, r.to))) continue;
    seen.add(pair(r.from, r.to));
    memberRelations.push(r);
  }

  // Un nom de groupe cité dans une liaison désigne le groupe (package → package), pas une classe.
  const groupNames = new Set(groups.map((g) => g.name));
  for (const [name, node] of classes) if (node.implicit && groupNames.has(name)) classes.delete(name);
  // Les éléments implicites restent des classes ; on retire le marqueur pour garder un modèle simple.
  for (const node of classes.values()) delete node.implicit;

  const diagram: Diagram = { classes: [...classes.values()], relations: [...unique, ...memberRelations] };
  if (groups.length) diagram.groups = groups;
  if (styled) diagram.style = style;
  return { diagram, errors };
}
