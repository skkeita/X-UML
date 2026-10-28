import { displayName } from './layout';
import type { ClassNode, Diagram } from './types';

/*
 * Vérification du modèle : avertissements discrets sur les erreurs UML courantes,
 * à corriger avant de rendre un diagramme. Rien n'est bloquant : c'est une relecture.
 */

export interface Issue {
  /** Identifiant stable (pour les listes React et les tests). */
  id: string;
  /** « warning » : probablement une erreur ; « info » : à vérifier. */
  level: 'warning' | 'info';
  message: string;
  /** Éléments concernés (sélectionnés au clic sur l'avertissement). */
  elements: string[];
}

const isClassLike = (c: ClassNode) => (c.kind ?? 'class') === 'class';
const memberName = (text: string) => text.split(/[(:]/)[0].trim();

export function validate(diagram: Diagram): Issue[] {
  const issues: Issue[] = [];
  const byName = new Map(diagram.classes.map((c) => [c.name, c]));
  const label = (n: string) => {
    const c = byName.get(n);
    return c ? displayName(c) : n;
  };
  const rels = diagram.relations.filter((r) => r.via !== 'note');

  // 1) Héritage circulaire (généralisation / réalisation qui revient à son point de départ).
  const parents = new Map<string, string[]>();
  for (const r of rels) if (r.kind === 'inheritance' || r.kind === 'realization') parents.set(r.from, [...(parents.get(r.from) ?? []), r.to]);
  const reported = new Set<string>();
  const visit = (n: string, path: string[]) => {
    if (path.includes(n)) {
      const cycle = path.slice(path.indexOf(n));
      const key = [...cycle].sort().join('|');
      if (!reported.has(key)) {
        reported.add(key);
        issues.push({ id: `cycle:${key}`, level: 'warning', message: `Héritage circulaire : ${[...cycle, n].map(label).join(' → ')}.`, elements: cycle });
      }
      return;
    }
    for (const p of parents.get(n) ?? []) visit(p, [...path, n]);
  };
  for (const n of parents.keys()) visit(n, []);

  for (const c of diagram.classes.filter(isClassLike)) {
    const ext = rels.filter((r) => r.from === c.name && r.kind === 'inheritance').map((r) => byName.get(r.to)).filter((x): x is ClassNode => !!x);
    const impl = rels.filter((r) => r.from === c.name && r.kind === 'realization').map((r) => byName.get(r.to)).filter((x): x is ClassNode => !!x);
    const isInterface = c.stereotype === 'interface';

    // 2) extends / implements mal employés.
    for (const p of ext) {
      if (!isInterface && p.stereotype === 'interface')
        issues.push({ id: `ext-iface:${c.name}:${p.name}`, level: 'warning', message: `${c.name} hérite de l’interface ${p.name} : une classe réalise une interface (« implements »).`, elements: [c.name, p.name] });
      if (isInterface && p.stereotype !== 'interface' && isClassLike(p))
        issues.push({ id: `iface-ext-class:${c.name}:${p.name}`, level: 'warning', message: `L’interface ${c.name} hérite de la classe ${p.name} : une interface ne peut spécialiser qu’une interface.`, elements: [c.name, p.name] });
    }
    for (const p of impl) {
      if (isClassLike(p) && p.stereotype !== 'interface')
        issues.push({ id: `impl-class:${c.name}:${p.name}`, level: 'warning', message: `${c.name} réalise ${p.name}, qui n’est pas une interface : utilisez une généralisation (« extends »).`, elements: [c.name, p.name] });
    }
    // 3) Héritage multiple de classes (impossible en Java / C#).
    const classParents = ext.filter((p) => p.stereotype !== 'interface');
    if (!isInterface && classParents.length > 1)
      issues.push({ id: `multi:${c.name}`, level: 'info', message: `${c.name} hérite de plusieurs classes (${classParents.map((p) => p.name).join(', ')}) : impossible en Java ou en C#.`, elements: [c.name, ...classParents.map((p) => p.name)] });

    // 4) Interface sans opération, énumération sans valeur.
    if (isInterface && !c.implicit && c.members.every((m) => m.kind !== 'method'))
      issues.push({ id: `iface-empty:${c.name}`, level: 'info', message: `L’interface ${c.name} ne déclare aucune opération.`, elements: [c.name] });
    if (c.stereotype === 'enum' && c.members.length === 0)
      issues.push({ id: `enum-empty:${c.name}`, level: 'info', message: `L’énumération ${c.name} n’a aucune valeur.`, elements: [c.name] });

    // 5) Classe abstraite jamais spécialisée.
    if (c.stereotype === 'abstract' && !rels.some((r) => r.to === c.name && r.kind === 'inheritance'))
      issues.push({ id: `abstract-alone:${c.name}`, level: 'info', message: `La classe abstraite ${c.name} n’a aucune sous-classe.`, elements: [c.name] });

    // 6) Membre déclaré deux fois.
    const seen = new Map<string, number>();
    for (const m of c.members) {
      const key = `${m.kind}:${m.kind === 'method' ? m.text.replace(/\s+/g, '') : memberName(m.text)}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, n] of seen)
      if (n > 1)
        issues.push({ id: `dup-member:${c.name}:${key}`, level: 'warning', message: `${c.name} déclare ${n} fois ${key.startsWith('method') ? 'l’opération' : 'l’attribut'} « ${key.split(':').slice(1).join(':')} ».`, elements: [c.name] });
  }

  // 7) Éléments isolés (aucune relation), quand le diagramme en compte plusieurs.
  const linked = new Set(rels.flatMap((r) => [r.from, r.to]));
  const grouped = new Set((diagram.groups ?? []).flatMap((g) => g.members));
  const candidates = diagram.classes.filter((c) => c.kind !== 'note' && c.kind !== 'system' && c.kind !== 'package');
  if (candidates.length >= 2) {
    for (const c of candidates) {
      if (linked.has(c.name)) continue;
      const k = c.kind ?? 'class';
      if (k === 'actor') issues.push({ id: `alone:${c.name}`, level: 'warning', message: `L’acteur ${label(c.name)} ne participe à aucun cas d’utilisation.`, elements: [c.name] });
      else if (k === 'usecase') issues.push({ id: `alone:${c.name}`, level: 'warning', message: `Le cas d’utilisation ${label(c.name)} n’est relié à aucun acteur.`, elements: [c.name] });
      else if (!grouped.has(c.name) || k === 'class') issues.push({ id: `alone:${c.name}`, level: 'info', message: `${label(c.name)} n’est relié à aucun autre élément.`, elements: [c.name] });
    }
  }

  // 8) Deux éléments affichés sous le même nom (ex. deux acteurs « Client »).
  const byLabel = new Map<string, string[]>();
  for (const c of diagram.classes.filter((x) => x.kind !== 'note')) {
    const l = displayName(c).trim().toLowerCase();
    byLabel.set(l, [...(byLabel.get(l) ?? []), c.name]);
  }
  for (const [, names] of byLabel)
    if (names.length > 1) issues.push({ id: `same-name:${names.join('|')}`, level: 'warning', message: `Plusieurs éléments s’appellent « ${label(names[0])} » : ils se confondent sur le diagramme.`, elements: names });

  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warning' ? -1 : 1));
}
