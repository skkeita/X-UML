// Modèle de données du diagramme : indépendant de l'UI et du rendu.

export type Visibility = '+' | '-' | '#' | '~';
export type MemberKind = 'attribute' | 'method';
export type Stereotype = 'interface' | 'abstract' | 'enum';

export interface Member {
  visibility: Visibility;
  text: string;
  kind: MemberKind;
}

export interface ClassNode {
  name: string;
  stereotype?: Stereotype;
  members: Member[];
  /** Ligne (1-based) de la déclaration, utile pour les messages d'erreur. */
  line: number;
}

export type RelationKind =
  | 'association' //  --
  | 'directed' //     -->
  | 'inheritance' //  --|>
  | 'realization' //  ..|>
  | 'dependency' //   ..>
  | 'composition' //  *--
  | 'aggregation'; // o--

export interface Relation {
  from: string;
  to: string;
  kind: RelationKind;
  label?: string;
  line: number;
}

export interface Diagram {
  classes: ClassNode[];
  relations: Relation[];
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  diagram: Diagram;
  errors: ParseError[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Point, Size {}

/** Positions des boîtes, indexées par nom de classe. */
export type Positions = Record<string, Point>;
