// Modèle de données du diagramme : indépendant de l'UI et du rendu.

export type Visibility = '+' | '-' | '#' | '~';
export type MemberKind = 'attribute' | 'method';
export type Stereotype = 'interface' | 'abstract' | 'enum';

export interface Member {
  visibility: Visibility;
  text: string;
  kind: MemberKind;
}

/** Nature d'un élément du tableau blanc. */
export type NodeKind = 'class' | 'actor' | 'usecase' | 'object' | 'system' | 'package';

export interface ClassNode {
  name: string;
  /** Classe par défaut ; sinon acteur, cas d'utilisation, objet ou système. */
  kind?: NodeKind;
  /** Texte affiché quand il diffère de l'identifiant (ex. usecase PasserCommande "Passer une commande"). */
  label?: string;
  stereotype?: Stereotype;
  members: Member[];
  /** Ligne (1-based) de la déclaration, utile pour les messages d'erreur. */
  line: number;
  /** Créé seulement parce qu'il est cité (liaison, groupe) : pas de déclaration propre. */
  implicit?: boolean;
  /** Objet : classe dont il est une instance (object ihm : EcranCommande). */
  classifier?: string;
}

/** Types de diagrammes qu'un cadre peut porter (« typer » une sélection). */
export type DiagramType = 'class' | 'usecase' | 'context' | 'package' | 'communication';

/**
 * Groupe d'éléments, dessiné comme un cadre autour de ses membres :
 *  - package : dossier UML ;
 *  - system  : frontière du système (diagramme de cas d'utilisation) ;
 *  - frame   : cadre de diagramme typé (« uc Gestion des commandes »).
 */
export interface Group {
  name: string;
  kind: 'package' | 'system' | 'frame';
  title: string;
  diagramType?: DiagramType;
  members: string[];
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
  /** Créée automatiquement à partir du code (pas écrite comme liaison). */
  auto?: boolean;
  /** Origine d'une liaison automatique : « extends », « implements », ou le type d'un attribut / d'une méthode. */
  via?: 'extends' | 'implements' | 'member';
  /** Multiplicités aux extrémités (ex. "1" et "0..*"). */
  multFrom?: string;
  multTo?: string;
}

export interface LegendEntry {
  color: string;
  label: string;
}

/** Apparence du tableau, décrite dans le code (« color », « style », « legend »). */
export interface DiagramStyle {
  /** Couleur de fond de chaque élément ou groupe coloré (#rrggbb). */
  colors: Record<string, string>;
  /** Entrées de la légende : une par couleur libellée, dans l'ordre du script. */
  legend: LegendEntry[];
  legendTitle?: string;
  legendHidden?: boolean;
  corners: 'rounded' | 'square';
}

export interface Diagram {
  classes: ClassNode[];
  relations: Relation[];
  /** Packages, frontières de système et cadres de diagramme. */
  groups?: Group[];
  /** Absent : apparence par défaut (coins arrondis, sans couleur). */
  style?: DiagramStyle;
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
