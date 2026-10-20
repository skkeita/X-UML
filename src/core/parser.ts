import type {
  ClassNode,
  Diagram,
  Member,
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
 * Les classes citées uniquement dans une relation sont créées implicitement.
 * UX : les identifiants acceptent les lettres accentuées (Étudiant, Réservation...).
 */

const IDENT = '[\\p{L}_][\\p{L}\\p{N}_]*';

const CLASS_DECL = new RegExp(
  `^(abstract\\s+class|class|interface|enum)\\s+(${IDENT})\\s*(?:(\\{)\\s*(\\})?)?$`,
  'u',
);

// L'ordre des alternatives compte : les opérateurs les plus longs d'abord.
const RELATION = new RegExp(
  `^(${IDENT})\\s*(\\*--|o--|--\\|>|\\.\\.\\|>|-->|\\.\\.>|--)\\s*(${IDENT})\\s*(?::\\s*(.+))?$`,
  'u',
);

const MEMBER = /^([+\-#~])?\s*(.+)$/;

const OPERATORS: Record<string, RelationKind> = {
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

  const ensureClass = (name: string, line: number): ClassNode => {
    let node = classes.get(name);
    if (!node) {
      node = { name, members: [], line };
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
      else current.members.push(parseMember(line));
      continue;
    }

    // 2) Déclaration de classe / interface / enum
    const decl = CLASS_DECL.exec(line);
    if (decl) {
      const [, keyword, name, open, close] = decl;
      const existing = classes.get(name);
      if (existing && existing.line !== lineNo && existing.members.length > 0) {
        errors.push({ line: lineNo, message: `« ${name} » est déjà déclarée ligne ${existing.line}` });
      }
      const node = ensureClass(name, lineNo);
      const stereotype = stereotypeOf(keyword.replace(/\s+/g, ' '));
      if (stereotype) node.stereotype = stereotype;
      if (open && !close) current = node;
      continue;
    }

    // 3) Relation
    const rel = RELATION.exec(line);
    if (rel) {
      const [, from, op, to, label] = rel;
      ensureClass(from, lineNo);
      ensureClass(to, lineNo);
      relations.push({
        from,
        to,
        kind: OPERATORS[op],
        label: label?.trim() || undefined,
        line: lineNo,
      });
      continue;
    }

    errors.push({
      line: lineNo,
      message: 'Syntaxe non reconnue. Attendu : « class Nom { ... } » ou « A --|> B »',
    });
  }

  if (current) {
    const unclosed: ClassNode = current;
    errors.push({ line: unclosed.line, message: `Accolade fermante « } » manquante pour « ${unclosed.name} »` });
  }

  const diagram: Diagram = { classes: [...classes.values()], relations };
  return { diagram, errors };
}
