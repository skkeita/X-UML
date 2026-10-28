import type { ClassNode, Diagram, Member, Relation, Visibility } from './types';

/*
 * Génération de code : diagramme de classes → squelettes Java, TypeScript ou Python.
 * Classes, classes abstraites, interfaces, énumérations, attributs, opérations (signatures),
 * généralisations / réalisations, et un attribut pour chaque association navigable non déjà écrite.
 * Les corps des opérations sont à compléter (le code compile / s'exécute tel quel).
 */

export type Language = 'java' | 'typescript' | 'python';

export const LANGUAGES: { id: Language; label: string; ext: string }[] = [
  { id: 'java', label: 'Java', ext: 'java' },
  { id: 'typescript', label: 'TypeScript', ext: 'ts' },
  { id: 'python', label: 'Python', ext: 'py' },
];

export interface GeneratedFile {
  name: string;
  content: string;
}

interface Param {
  name: string;
  type: string;
}
interface Field {
  vis: Visibility;
  name: string;
  type: string;
  isStatic: boolean;
}
interface Method {
  vis: Visibility;
  name: string;
  params: Param[];
  ret: string;
  isStatic: boolean;
}
interface Model {
  name: string;
  kind: 'class' | 'abstract' | 'interface' | 'enum';
  parent?: string;
  interfaces: string[];
  fields: Field[];
  methods: Method[];
  values: string[];
}

/* ------------------------------------------------------------------ */
/* Lecture des membres UML                                             */
/* ------------------------------------------------------------------ */

const ident = (s: string) => s.trim().replace(/[^\p{L}\p{N}_]/gu, '_').replace(/^(\d)/, '_$1') || 'x';

/** « nom: Type » → champ ; « {static} » ou « static » en tête : membre de classe. */
function readField(m: Member): Field {
  let text = m.text.trim();
  const isStatic = /^(\{static\}|static)\s+/i.test(text);
  text = text.replace(/^(\{static\}|static)\s+/i, '');
  const [name, ...type] = text.split(':');
  return { vis: m.visibility, name: ident(name.split('=')[0]), type: (type.join(':').split('=')[0] || '').trim() || 'any', isStatic };
}

/** « nom(a: T, b: U): R » → opération. */
function readMethod(m: Member): Method {
  let text = m.text.trim();
  const isStatic = /^(\{static\}|static)\s+/i.test(text);
  text = text.replace(/^(\{static\}|static)\s+/i, '');
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  const name = ident(text.slice(0, open));
  const inside = text.slice(open + 1, close > open ? close : undefined);
  const params: Param[] = splitTop(inside)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => {
      const [n, ...t] = p.split(':');
      return t.length ? { name: ident(n), type: t.join(':').trim() } : { name: `arg${i + 1}`, type: p.trim() };
    });
  const after = close > open ? text.slice(close + 1) : '';
  const ret = after.replace(/^\s*:/, '').trim() || 'void';
  return { vis: m.visibility, name, params, ret, isStatic };
}

/** Découpe « a: Map<K, V>, b: int » aux virgules de premier niveau. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '<' || ch === '[' || ch === '(') depth++;
    if (ch === '>' || ch === ']' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const many = (mult?: string) => !!mult && /\*|\.\.\s*(n|[2-9]|\d{2,})/i.test(mult);

function buildModels(diagram: Diagram): Model[] {
  const models = buildRawModels(diagram);
  // Une classe concrète doit déclarer les opérations des interfaces qu'elle réalise (sinon le code
  // ne compile pas) : on ajoute les signatures manquantes, à compléter.
  const byName = new Map(models.map((m) => [m.name, m]));
  const ifaceMethods = (name: string, seen = new Set<string>()): Method[] => {
    const m = byName.get(name);
    if (!m || seen.has(name)) return [];
    seen.add(name);
    return [...m.methods, ...m.interfaces.flatMap((p) => ifaceMethods(p, seen))];
  };
  const inherited = (m: Model): Method[] => {
    const parent = m.parent ? byName.get(m.parent) : undefined;
    return parent ? [...parent.methods, ...inherited(parent)] : [];
  };
  for (const m of models) {
    if (m.kind !== 'class') continue;
    const all = [...m.interfaces, ...(m.parent ? (byName.get(m.parent)?.interfaces ?? []) : [])];
    const have = new Set([...m.methods, ...inherited(m)].map((x) => x.name));
    for (const req of all.flatMap((i) => ifaceMethods(i))) {
      if (have.has(req.name)) continue;
      have.add(req.name);
      m.methods.push({ ...req, vis: '+' });
    }
  }
  return models;
}

function buildRawModels(diagram: Diagram): Model[] {
  const classes = diagram.classes.filter((c) => (c.kind ?? 'class') === 'class');
  const names = new Set(classes.map((c) => c.name));
  const rels = diagram.relations.filter((r) => r.via !== 'note');
  return classes.map((c: ClassNode) => {
    const kind = c.stereotype === 'interface' ? 'interface' : c.stereotype === 'enum' ? 'enum' : c.stereotype === 'abstract' ? 'abstract' : 'class';
    const parents = rels.filter((r) => r.from === c.name && r.kind === 'inheritance').map((r) => r.to);
    const realized = rels.filter((r) => r.from === c.name && r.kind === 'realization').map((r) => r.to);
    const fields = c.members.filter((m) => m.kind === 'attribute').map(readField);
    const methods = c.members.filter((m) => m.kind === 'method').map(readMethod);
    // Associations navigables (A → B) sans attribut correspondant : on ajoute l'attribut.
    if (kind !== 'enum' && kind !== 'interface') {
      for (const r of rels as Relation[]) {
        if (r.from !== c.name || r.via === 'member' || !names.has(r.to)) continue;
        if (!['directed', 'composition', 'aggregation', 'association'].includes(r.kind)) continue;
        if (fields.some((f) => f.type.includes(r.to))) continue;
        const role = r.label && /^[\p{L}_][\p{L}\p{N}_]*$/u.test(r.label.trim()) ? r.label.trim() : lowerFirst(r.to);
        const list = many(r.multTo);
        fields.push({ vis: '-', name: list && !role.endsWith('s') ? `${role}s` : role, type: list ? `List<${r.to}>` : r.to, isStatic: false });
      }
    }
    return {
      name: c.name,
      kind,
      // Une interface « hérite » de ses interfaces parentes ; une classe n'a qu'un parent (Java) : les autres deviennent des remarques.
      parent: kind === 'interface' ? undefined : parents[0],
      interfaces: kind === 'interface' ? parents : realized,
      fields: kind === 'enum' ? [] : fields,
      methods,
      values: kind === 'enum' ? c.members.map((m) => ident(m.text.split(/[(:=]/)[0]).toUpperCase()) : [],
    };
  });
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

const GENERIC = /^(\w+)\s*<(.+)>$/;
function mapType(t: string, lang: Language): string {
  const type = t.trim();
  const arr = /^(.+)\[\]$/.exec(type);
  if (arr) return lang === 'java' ? `List<${box(mapType(arr[1], lang), lang)}>` : lang === 'typescript' ? `${mapType(arr[1], lang)}[]` : `list[${mapType(arr[1], lang)}]`;
  const g = GENERIC.exec(type);
  if (g) {
    const args = splitTop(g[2]).map((a) => mapType(a, lang));
    const base = g[1].toLowerCase();
    if (base === 'list' || base === 'arraylist' || base === 'collection')
      return lang === 'java' ? `List<${args.map((a) => box(a, lang)).join(', ')}>` : lang === 'typescript' ? `${args[0]}[]` : `list[${args[0]}]`;
    if (base === 'set' || base === 'hashset') return lang === 'java' ? `Set<${args.map((a) => box(a, lang)).join(', ')}>` : lang === 'typescript' ? `Set<${args[0]}>` : `set[${args[0]}]`;
    if (base === 'map' || base === 'hashmap' || base === 'dict')
      return lang === 'java' ? `Map<${args.map((a) => box(a, lang)).join(', ')}>` : lang === 'typescript' ? `Map<${args.join(', ')}>` : `dict[${args.join(', ')}]`;
    return `${g[1]}<${args.join(', ')}>`;
  }
  const k = type.toLowerCase();
  const table: Record<string, [string, string, string]> = {
    string: ['String', 'string', 'str'],
    str: ['String', 'string', 'str'],
    char: ['char', 'string', 'str'],
    int: ['int', 'number', 'int'],
    integer: ['int', 'number', 'int'],
    long: ['long', 'number', 'int'],
    short: ['short', 'number', 'int'],
    double: ['double', 'number', 'float'],
    float: ['double', 'number', 'float'],
    real: ['double', 'number', 'float'],
    number: ['double', 'number', 'float'],
    bool: ['boolean', 'boolean', 'bool'],
    boolean: ['boolean', 'boolean', 'bool'],
    date: ['LocalDate', 'Date', 'date'],
    datetime: ['LocalDateTime', 'Date', 'datetime'],
    void: ['void', 'void', 'None'],
    any: ['Object', 'unknown', 'Any'],
    object: ['Object', 'unknown', 'Any'],
  };
  const hit = table[k];
  if (!hit) return type;
  return hit[lang === 'java' ? 0 : lang === 'typescript' ? 1 : 2];
}
const box = (t: string, lang: Language) =>
  lang !== 'java' ? t : ({ int: 'Integer', long: 'Long', short: 'Short', double: 'Double', boolean: 'Boolean', char: 'Character' } as Record<string, string>)[t] ?? t;

/* ------------------------------------------------------------------ */
/* Java                                                                */
/* ------------------------------------------------------------------ */

const JAVA_VIS: Record<Visibility, string> = { '+': 'public ', '-': 'private ', '#': 'protected ', '~': '' };

function javaDefault(t: string): string {
  if (t === 'void') return '';
  return '        throw new UnsupportedOperationException("À implémenter");\n';
}

function toJava(m: Model): GeneratedFile {
  const imports = new Set<string>();
  const use = (t: string) => {
    const out = mapType(t, 'java');
    if (/\bList</.test(out)) imports.add('java.util.List');
    if (/\bSet</.test(out)) imports.add('java.util.Set');
    if (/\bMap</.test(out)) imports.add('java.util.Map');
    if (/\bLocalDate\b/.test(out)) imports.add('java.time.LocalDate');
    if (/\bLocalDateTime\b/.test(out)) imports.add('java.time.LocalDateTime');
    return out;
  };
  const lines: string[] = [];
  const head =
    m.kind === 'interface'
      ? `public interface ${m.name}${m.interfaces.length ? ` extends ${m.interfaces.join(', ')}` : ''}`
      : m.kind === 'enum'
        ? `public enum ${m.name}`
        : `public ${m.kind === 'abstract' ? 'abstract ' : ''}class ${m.name}${m.parent ? ` extends ${m.parent}` : ''}${m.interfaces.length ? ` implements ${m.interfaces.join(', ')}` : ''}`;
  lines.push(`${head} {`);
  if (m.kind === 'enum') lines.push(`    ${m.values.join(',\n    ')}${m.values.length ? ';' : ''}`);
  for (const f of m.fields) lines.push(`    ${JAVA_VIS[f.vis]}${f.isStatic ? 'static ' : ''}${use(f.type)} ${f.name};`);
  if (m.fields.length && m.methods.length) lines.push('');
  for (const op of m.methods) {
    const ret = use(op.ret);
    const params = op.params.map((p) => `${use(p.type)} ${p.name}`).join(', ');
    if (m.kind === 'interface') lines.push(`    ${ret} ${op.name}(${params});`);
    else lines.push(`    ${JAVA_VIS[op.vis]}${op.isStatic ? 'static ' : ''}${ret} ${op.name}(${params}) {\n${javaDefault(ret) || '        // TODO\n'}    }`);
  }
  lines.push('}');
  const header = imports.size ? `${[...imports].sort().map((i) => `import ${i};`).join('\n')}\n\n` : '';
  return { name: `${m.name}.java`, content: `${header}${lines.join('\n')}\n` };
}

/* ------------------------------------------------------------------ */
/* TypeScript                                                          */
/* ------------------------------------------------------------------ */

const TS_VIS: Record<Visibility, string> = { '+': 'public ', '-': 'private ', '#': 'protected ', '~': '' };

function toTs(models: Model[]): GeneratedFile {
  const out: string[] = ['// Généré par X-UML : squelettes à compléter.', ''];
  // Les parents d'abord : une classe ne peut pas étendre une classe déclarée plus bas.
  for (const m of orderByParent(models)) {
    if (m.kind === 'enum') {
      out.push(`export enum ${m.name} {`, ...m.values.map((v) => `  ${v} = '${v}',`), '}', '');
      continue;
    }
    if (m.kind === 'interface') {
      out.push(`export interface ${m.name}${m.interfaces.length ? ` extends ${m.interfaces.join(', ')}` : ''} {`);
      for (const f of m.fields) out.push(`  ${f.name}: ${mapType(f.type, 'typescript')};`);
      for (const op of m.methods) out.push(`  ${op.name}(${op.params.map((p) => `${p.name}: ${mapType(p.type, 'typescript')}`).join(', ')}): ${mapType(op.ret, 'typescript')};`);
      out.push('}', '');
      continue;
    }
    out.push(`export ${m.kind === 'abstract' ? 'abstract ' : ''}class ${m.name}${m.parent ? ` extends ${m.parent}` : ''}${m.interfaces.length ? ` implements ${m.interfaces.join(', ')}` : ''} {`);
    // « ! » : attribut initialisé plus tard (constructeur à écrire) ; interdit sur un attribut statique.
    for (const f of m.fields) out.push(`  ${TS_VIS[f.vis]}${f.isStatic ? 'static ' : ''}${f.name}${f.isStatic ? '?' : '!'}: ${mapType(f.type, 'typescript')};`);
    if (m.fields.length && m.methods.length) out.push('');
    for (const op of m.methods) {
      const ret = mapType(op.ret, 'typescript');
      out.push(
        `  ${TS_VIS[op.vis]}${op.isStatic ? 'static ' : ''}${op.name}(${op.params.map((p) => `${p.name}: ${mapType(p.type, 'typescript')}`).join(', ')}): ${ret} {`,
        ret === 'void' ? '    // TODO' : "    throw new Error('À implémenter');",
        '  }',
      );
    }
    out.push('}', '');
  }
  return { name: 'modele.ts', content: out.join('\n') };
}

/* ------------------------------------------------------------------ */
/* Python                                                              */
/* ------------------------------------------------------------------ */

function toPython(models: Model[]): GeneratedFile {
  const needs = { abc: false, enum: false, date: false, datetime: false, any: false };
  const body: string[] = [];
  const pyName = (n: string, v: Visibility) => (v === '-' ? `_${n}` : v === '#' ? `_${n}` : n);
  for (const m of orderByParent(models)) {
    const t = (x: string) => {
      const out = mapType(x, 'python');
      if (/\bdate\b/.test(out)) needs.date = true;
      if (/\bdatetime\b/.test(out)) needs.datetime = true;
      if (/\bAny\b/.test(out)) needs.any = true;
      return out;
    };
    if (m.kind === 'enum') {
      needs.enum = true;
      body.push(`class ${m.name}(Enum):`, ...(m.values.length ? m.values.map((v) => `    ${v} = "${v}"`) : ['    pass']), '', '');
      continue;
    }
    const abstract = m.kind === 'abstract' || m.kind === 'interface';
    if (abstract) needs.abc = true;
    const bases = [...(m.parent ? [m.parent] : []), ...m.interfaces, ...(abstract ? ['ABC'] : [])];
    body.push(`class ${m.name}${bases.length ? `(${bases.join(', ')})` : ''}:`);
    const inst = m.fields.filter((f) => !f.isStatic);
    const stat = m.fields.filter((f) => f.isStatic);
    for (const f of stat) body.push(`    ${pyName(f.name, f.vis)}: ${t(f.type)}`);
    if (inst.length) {
      body.push('    def __init__(self) -> None:');
      if (m.parent) body.push('        super().__init__()');
      for (const f of inst) body.push(`        self.${pyName(f.name, f.vis)}: ${t(f.type)} = None  # type: ignore[assignment]`);
    }
    for (const op of m.methods) {
      if (inst.length || stat.length || body[body.length - 1] !== `class ${m.name}${bases.length ? `(${bases.join(', ')})` : ''}:`) body.push('');
      if (op.isStatic) body.push('    @staticmethod');
      else if (m.kind === 'interface') body.push('    @abstractmethod');
      const args = [...(op.isStatic ? [] : ['self']), ...op.params.map((p) => `${p.name}: ${t(p.type)}`)].join(', ');
      body.push(`    def ${pyName(op.name, op.vis)}(${args}) -> ${t(op.ret)}:`, '        raise NotImplementedError');
    }
    if (!inst.length && !stat.length && !m.methods.length) body.push('    pass');
    body.push('', '');
  }
  const head = ['# Généré par X-UML : squelettes à compléter.', 'from __future__ import annotations', ''];
  if (needs.abc) head.push('from abc import ABC, abstractmethod');
  if (needs.enum) head.push('from enum import Enum');
  if (needs.date || needs.datetime) head.push(`from datetime import ${[needs.date && 'date', needs.datetime && 'datetime'].filter(Boolean).join(', ')}`);
  if (needs.any) head.push('from typing import Any');
  return { name: 'modele.py', content: `${head.join('\n')}\n\n\n${body.join('\n').trimEnd()}\n` };
}

/** Parents avant enfants (ordre stable sinon). */
function orderByParent(models: Model[]): Model[] {
  const byName = new Map(models.map((m) => [m.name, m]));
  const done = new Set<string>();
  const out: Model[] = [];
  const visit = (m: Model, stack: Set<string>) => {
    if (done.has(m.name) || stack.has(m.name)) return;
    stack.add(m.name);
    for (const p of [m.parent, ...m.interfaces]) {
      const pm = p ? byName.get(p) : undefined;
      if (pm) visit(pm, stack);
    }
    done.add(m.name);
    out.push(m);
  };
  for (const m of models) visit(m, new Set());
  return out;
}

/** Fichiers générés pour un langage (Java : un fichier par type ; TypeScript / Python : un module). */
export function generateCode(diagram: Diagram, lang: Language): GeneratedFile[] {
  const models = buildModels(diagram);
  if (models.length === 0) return [];
  if (lang === 'java') return models.map(toJava);
  if (lang === 'typescript') return [toTs(models)];
  return [toPython(models)];
}
