import type { ClassNode, Diagram, DiagramType, NodeKind, Relation, RelationKind } from './types';

/*
 * Vocabulaire UML propre à chaque type de diagramme.
 *
 * Un même tableau blanc peut accueillir plusieurs notations : l'interface parle la langue du
 * diagramme affiché (« acteur », « cas d'utilisation », « objet », « paquetage »…) au lieu de
 * tout appeler « classe ». Les termes suivent la terminologie UML 2 en français.
 */

/** Ce qu'on peut créer : un mot-clé du script (+ variante de classe : abstraite, interface, énumération). */
export type ElementKind = 'class' | 'abstract' | 'interface' | 'enum' | 'actor' | 'usecase' | 'object' | 'system' | 'package' | 'note';

export interface ElementChoice {
  kind: ElementKind;
  label: string;
  /** Article + nom, pour « Ajouter un acteur ». */
  withArticle: string;
  hint: string;
}

export interface RelationChoice {
  /** Identifiant stable de l'option (« include », « association »…). */
  id: string;
  kind: RelationKind;
  label: string;
  hint: string;
  /** Stéréotype écrit comme libellé (« <<include>> ») : il fait partie de la relation. */
  stereotype?: string;
}

export interface Vocabulary {
  type: DiagramType;
  /** Nom du diagramme (« Diagramme de cas d'utilisation »). */
  title: string;
  /** Terme générique pour un élément du diagramme, au singulier / pluriel. */
  element: string;
  elements: string;
  /** Article indéfini du terme générique (« un élément », « une classe »). */
  elementArticle: string;
  /** Éléments proposés à la création, dans l'ordre d'usage. */
  create: ElementChoice[];
  /** Types de relation proposés (raccourcis 1…n sur le canevas). */
  relations: RelationChoice[];
  /** Terme pour une relation (« liaison », « lien », « dépendance »…). */
  relation: string;
  relationsLabel: string;
  /** Texte d'aide du libellé d'une relation. */
  labelPlaceholder: string;
  /** Les multiplicités ont-elles un sens ici (associations) ? */
  multiplicities: boolean;
  /** Regroupement proposé sur une sélection : package (dossier) ou système (frontière). */
  group: { kind: 'package' | 'system'; action: string; placeholder: string };
}

const E = (kind: ElementKind, label: string, withArticle: string, hint: string): ElementChoice => ({ kind, label, withArticle, hint });

export const ELEMENT_LABEL: Record<ElementKind, string> = {
  class: 'Classe',
  abstract: 'Classe abstraite',
  interface: 'Interface',
  enum: 'Énumération',
  actor: 'Acteur',
  usecase: 'Cas d’utilisation',
  object: 'Objet',
  system: 'Système',
  package: 'Paquetage',
  note: 'Note',
};

/** « Nom de l’acteur », « Nom du cas d’utilisation »… (champ de saisie à la création). */
export const NAME_OF: Record<ElementKind, string> = {
  class: 'Nom de la classe',
  abstract: 'Nom de la classe abstraite',
  interface: 'Nom de l’interface',
  enum: 'Nom de l’énumération',
  actor: 'Nom de l’acteur',
  usecase: 'Nom du cas d’utilisation',
  object: 'Nom de l’objet',
  system: 'Nom du système',
  package: 'Nom du paquetage',
  note: 'Texte de la note',
};

export const ELEMENT_PLURAL: Record<ElementKind, string> = {
  class: 'Classes',
  abstract: 'Classes abstraites',
  interface: 'Interfaces',
  enum: 'Énumérations',
  actor: 'Acteurs',
  usecase: 'Cas d’utilisation',
  object: 'Objets',
  system: 'Systèmes',
  package: 'Paquetages',
  note: 'Notes',
};

const CLASS_RELATIONS: RelationChoice[] = [
  { id: 'association', kind: 'association', label: 'Association', hint: 'Lien structurel entre deux classes' },
  { id: 'directed', kind: 'directed', label: 'Association navigable', hint: 'A connaît B (navigation de A vers B)' },
  { id: 'inheritance', kind: 'inheritance', label: 'Généralisation', hint: 'A est une spécialisation de B (héritage)' },
  { id: 'realization', kind: 'realization', label: 'Réalisation', hint: 'A réalise (implémente) l’interface B' },
  { id: 'dependency', kind: 'dependency', label: 'Dépendance', hint: 'A utilise B ponctuellement' },
  { id: 'composition', kind: 'composition', label: 'Composition', hint: 'A est composé de B (cycle de vie lié)' },
  { id: 'aggregation', kind: 'aggregation', label: 'Agrégation', hint: 'A regroupe des B (indépendants)' },
];

export const VOCABULARIES: Record<DiagramType, Vocabulary> = {
  class: {
    type: 'class',
    title: 'Diagramme de classes',
    element: 'classe',
    elements: 'classes',
    elementArticle: 'une classe',
    create: [
      E('class', 'Classe', 'une classe', 'Attributs et opérations'),
      E('abstract', 'Classe abstraite', 'une classe abstraite', 'Ne s’instancie pas directement'),
      E('interface', 'Interface', 'une interface', 'Contrat d’opérations'),
      E('enum', 'Énumération', 'une énumération', 'Liste fermée de valeurs'),
      E('note', 'Note', 'une note', 'Commentaire rattaché à un ou plusieurs éléments'),
    ],
    relations: CLASS_RELATIONS,
    relation: 'relation',
    relationsLabel: 'Relations',
    labelPlaceholder: 'rôle ou nom',
    multiplicities: true,
    group: { kind: 'package', action: 'Regrouper dans un paquetage', placeholder: 'Nom du paquetage' },
  },
  usecase: {
    type: 'usecase',
    title: 'Diagramme de cas d’utilisation',
    element: 'élément',
    elements: 'éléments',
    elementArticle: 'un élément',
    create: [
      E('actor', 'Acteur', 'un acteur', 'Rôle externe qui interagit avec le système'),
      E('usecase', 'Cas d’utilisation', 'un cas d’utilisation', 'Service rendu par le système'),
      E('system', 'Système', 'un système', 'Frontière du système étudié'),
      E('note', 'Note', 'une note', 'Commentaire rattaché à un ou plusieurs éléments'),
    ],
    relations: [
      { id: 'association', kind: 'association', label: 'Association', hint: 'L’acteur participe au cas d’utilisation' },
      { id: 'include', kind: 'dependency', label: 'Inclusion «include»', hint: 'Le cas A inclut toujours le cas B', stereotype: '<<include>>' },
      { id: 'extend', kind: 'dependency', label: 'Extension «extend»', hint: 'Le cas A étend B sous condition', stereotype: '<<extend>>' },
      { id: 'generalization', kind: 'inheritance', label: 'Généralisation', hint: 'A est un cas particulier de B' },
    ],
    relation: 'relation',
    relationsLabel: 'Relations',
    labelPlaceholder: 'libellé',
    multiplicities: false,
    group: { kind: 'system', action: 'Placer dans un système', placeholder: 'Nom du système' },
  },
  context: {
    type: 'context',
    title: 'Diagramme de contexte statique',
    element: 'élément',
    elements: 'éléments',
    elementArticle: 'un élément',
    create: [
      E('system', 'Système', 'le système', 'Système étudié, au centre'),
      E('actor', 'Acteur', 'un acteur', 'Acteur humain ou système externe'),
      E('note', 'Note', 'une note', 'Commentaire rattaché à un ou plusieurs éléments'),
    ],
    relations: [
      { id: 'association', kind: 'association', label: 'Association', hint: 'L’acteur interagit avec le système' },
      { id: 'directed', kind: 'directed', label: 'Association orientée', hint: 'Interaction à l’initiative de A' },
      { id: 'generalization', kind: 'inheritance', label: 'Généralisation', hint: 'A est un type particulier d’acteur B' },
    ],
    relation: 'association',
    relationsLabel: 'Associations',
    labelPlaceholder: 'libellé',
    multiplicities: true,
    group: { kind: 'system', action: 'Placer dans un système', placeholder: 'Nom du système' },
  },
  package: {
    type: 'package',
    title: 'Diagramme de paquetages',
    element: 'paquetage',
    elements: 'paquetages',
    elementArticle: 'un paquetage',
    create: [E('package', 'Paquetage', 'un paquetage', 'Regroupement d’éléments du modèle'), E('note', 'Note', 'une note', 'Commentaire rattaché à un ou plusieurs éléments')],
    relations: [
      { id: 'dependency', kind: 'dependency', label: 'Dépendance', hint: 'A dépend de B' },
      { id: 'import', kind: 'dependency', label: 'Importation «import»', hint: 'A importe les éléments publics de B', stereotype: '<<import>>' },
      { id: 'access', kind: 'dependency', label: 'Accès «access»', hint: 'A accède aux éléments de B (import privé)', stereotype: '<<access>>' },
      { id: 'merge', kind: 'dependency', label: 'Fusion «merge»', hint: 'A fusionne le contenu de B', stereotype: '<<merge>>' },
    ],
    relation: 'dépendance',
    relationsLabel: 'Dépendances',
    labelPlaceholder: 'libellé',
    multiplicities: false,
    group: { kind: 'package', action: 'Regrouper dans un paquetage', placeholder: 'Nom du paquetage' },
  },
  communication: {
    type: 'communication',
    title: 'Diagramme de communication',
    element: 'participant',
    elements: 'participants',
    elementArticle: 'un participant',
    create: [
      E('object', 'Objet', 'un objet', 'Instance d’une classe (nom : Classe)'),
      E('actor', 'Acteur', 'un acteur', 'Initiateur des messages'),
      E('note', 'Note', 'une note', 'Commentaire rattaché à un ou plusieurs éléments'),
    ],
    relations: [
      { id: 'message', kind: 'directed', label: 'Message', hint: 'A envoie un message à B (numéroté)' },
      { id: 'link', kind: 'association', label: 'Lien', hint: 'Lien entre deux participants, sans message' },
      { id: 'create', kind: 'directed', label: 'Création «create»', hint: 'A crée l’objet B', stereotype: '<<create>>' },
    ],
    relation: 'message',
    relationsLabel: 'Messages et liens',
    labelPlaceholder: 'ex. 1: valider()',
    multiplicities: false,
    group: { kind: 'package', action: 'Regrouper', placeholder: 'Nom du groupe' },
  },
};

export const DIAGRAM_TYPE_ORDER: DiagramType[] = ['class', 'usecase', 'context', 'package', 'communication'];

/**
 * Type du diagramme : d'abord le choix explicite du tableau, sinon un cadre typé, sinon
 * ce que contiennent les éléments (cas d'utilisation → UC, objets → communication…).
 */
export function inferDiagramType(diagram: Diagram, chosen?: DiagramType): DiagramType {
  if (chosen) return chosen;
  const frame = diagram.groups?.find((g) => g.kind === 'frame' && g.diagramType);
  if (frame?.diagramType) return frame.diagramType;
  const kinds = new Set(diagram.classes.map((c) => c.kind ?? 'class'));
  if (kinds.has('usecase')) return 'usecase';
  if (kinds.has('object')) return 'communication';
  if (kinds.has('system') && kinds.has('actor')) return 'context';
  if (kinds.size > 0 && [...kinds].every((k) => k === 'package')) return 'package';
  if (kinds.has('actor') && !kinds.has('class')) return 'usecase';
  return 'class';
}

/** Type d'un élément tel que l'interface le nomme (une classe abstraite reste une « classe abstraite »). */
export function elementKindOf(c: ClassNode): ElementKind {
  const k: NodeKind = c.kind ?? 'class';
  if (k !== 'class') return k;
  if (c.stereotype === 'abstract') return 'abstract';
  if (c.stereotype === 'interface') return 'interface';
  if (c.stereotype === 'enum') return 'enum';
  return 'class';
}

/** Option de relation correspondant à une relation existante (stéréotype compris). */
export function relationChoiceOf(v: Vocabulary, r: Pick<Relation, 'kind' | 'label'>): RelationChoice | undefined {
  const label = r.label?.trim();
  return (
    v.relations.find((c) => c.stereotype && c.kind === r.kind && c.stereotype === label) ??
    v.relations.find((c) => !c.stereotype && c.kind === r.kind) ??
    CLASS_RELATIONS.find((c) => c.kind === r.kind)
  );
}

/** Libellé lisible d'un type de relation, dans le vocabulaire du diagramme. */
export const relationLabel = (v: Vocabulary, r: Pick<Relation, 'kind' | 'label'>): string => relationChoiceOf(v, r)?.label ?? r.kind;

/**
 * Résumé du contenu, avec les bons mots : « 2 acteurs, 5 cas d’utilisation, 6 relations ».
 */
export function summarize(v: Vocabulary, diagram: Diagram): string {
  const counts = new Map<ElementKind, number>();
  for (const c of diagram.classes) {
    const k = elementKindOf(c);
    // En diagramme de classes, toutes les variantes comptent comme des classes.
    const key: ElementKind = ['abstract', 'interface', 'enum'].includes(k) && v.type === 'class' ? 'class' : k;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const plural = (n: number, k: ElementKind) => `${n} ${(n > 1 ? ELEMENT_PLURAL : ELEMENT_LABEL)[k].toLowerCase()}`;
  const parts = [...counts.entries()].map(([k, n]) => plural(n, k));
  if (parts.length === 0) parts.push(`0 ${v.element}`);
  const rels = diagram.relations.filter((r) => r.via !== 'note').length;
  const rel = v.relation;
  parts.push(`${rels} ${rel}${rels > 1 ? 's' : ''}`);
  return parts.join(', ');
}

const STEREOTYPE = /^<<[^<>]+>>$/;
/** Changement à appliquer pour passer une relation à l'option choisie (le stéréotype suit l'option). */
export function changeForChoice(choice: RelationChoice, currentLabel?: string): { kind: RelationKind; label?: string } {
  if (choice.stereotype) return { kind: choice.kind, label: choice.stereotype };
  // Quitter « «include» » pour « Association » retire le stéréotype ; un libellé libre est conservé.
  return { kind: choice.kind, ...(currentLabel && STEREOTYPE.test(currentLabel.trim()) ? { label: '' } : {}) };
}
export const isStereotypeLabel = (label?: string) => !!label && STEREOTYPE.test(label.trim());

/** « la classe cible », « l’élément cible »… (consigne pendant la création d'un lien). */
export function targetPhrase(v: Vocabulary): string {
  if (v.type === 'class') return 'la classe cible';
  if (v.type === 'package') return 'le paquetage cible';
  if (v.type === 'communication') return 'le participant cible';
  return 'l’élément cible';
}

/** Terme générique avec article défini : « la classe », « l’élément », « le paquetage ». */
export function definite(v: Vocabulary): string {
  if (v.element === 'classe') return 'la classe';
  return /^[aeiouéèh]/i.test(v.element) ? `l’${v.element}` : `le ${v.element}`;
}
