/*
 * Déclarations de classes, avec héritage écrit directement dans le code (style Java) :
 *
 *   class Chien extends Animal implements Domestique, Gardien {
 *   interface Gardien extends Vivant {
 *
 * Chaque parent cité crée automatiquement la liaison correspondante dans le diagramme :
 *   extends    → héritage   (flèche pleine, triangle vide)
 *   implements → réalisation (flèche pointillée, triangle vide)
 */

export const IDENT = '[\\p{L}_][\\p{L}\\p{N}_]*';
const LIST = `${IDENT}(?:\\s*,\\s*${IDENT})*`;

const DECL_RE = new RegExp(
  `^(\\s*)(abstract\\s+class|class|interface|enum)\\s+(${IDENT})((?:\\s+(?:extends|implements)\\s+${LIST})*)\\s*(\\{\\s*\\}?)?\\s*$`,
  'u',
);
const CLAUSE_RE = new RegExp(`(extends|implements)\\s+(${LIST})`, 'gu');

export interface Decl {
  indent: string;
  /** « class », « abstract class », « interface » ou « enum ». */
  keyword: string;
  name: string;
  extends: string[];
  implements: string[];
  /** Ouvre un bloc { … } sur les lignes suivantes. */
  opens: boolean;
  /** Bloc vide fermé sur la même ligne : « { } ». */
  closes: boolean;
}

/** Analyse une ligne de déclaration (sans commentaire). */
export function parseDecl(code: string): Decl | null {
  const m = DECL_RE.exec(code);
  if (!m) return null;
  const [, indent, keyword, name, clauses, brace = ''] = m;
  const ext: string[] = [];
  const impl: string[] = [];
  for (const c of (clauses ?? '').matchAll(CLAUSE_RE)) {
    const names = c[2].split(',').map((s) => s.trim());
    (c[1] === 'extends' ? ext : impl).push(...names);
  }
  return {
    indent,
    keyword: keyword.replace(/\s+/g, ' '),
    name,
    extends: ext,
    implements: impl,
    opens: brace.startsWith('{') && !brace.includes('}'),
    closes: brace.includes('}'),
  };
}

export function formatDecl(d: Decl): string {
  let s = `${d.indent}${d.keyword} ${d.name}`;
  if (d.extends.length) s += ` extends ${d.extends.join(', ')}`;
  if (d.implements.length) s += ` implements ${d.implements.join(', ')}`;
  if (d.closes) s += ' { }';
  else if (d.opens) s += ' {';
  return s;
}
