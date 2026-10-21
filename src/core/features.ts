/*
 * Catalogue des fonctionnalités, affiché par le bouton « Fonctionnalités » (F1).
 * Données séparées de l'affichage : une nouvelle fonctionnalité = une entrée ici.
 */

export interface Feature {
  title: string;
  /** Ce que ça fait, en une ou deux phrases. */
  text: string;
  /** Comment y accéder (geste, menu, raccourci). */
  how?: string;
  /** Touches à afficher en <kbd> (une combinaison par entrée, « Ctrl+Z »). */
  keys?: string[];
  /** Exemple de script, pour le mode Code. */
  code?: string;
  /** Mots-clés supplémentaires pour la recherche. */
  tags?: string;
}

export interface FeatureSection {
  id: string;
  title: string;
  intro?: string;
  items: Feature[];
}

export const FEATURE_SECTIONS: FeatureSection[] = [
  {
    id: 'modes',
    title: 'Modes d’édition',
    intro: 'Deux façons de construire le même diagramme. Le script reste la référence : on passe de l’un à l’autre à tout moment, sans rien perdre.',
    items: [
      {
        title: 'Mode Code',
        text: 'Le diagramme s’écrit sous forme de script, relations comprises. Le dessin suit la frappe en temps réel.',
        how: 'Barre du haut : « Code ».',
        tags: 'script texte clavier simplifié',
      },
      {
        title: 'Mode Visuel',
        text: 'Tout se construit avec des menus et des champs, sans écrire une ligne de code : ajout d’éléments, membres, héritage, relations, groupes, couleurs.',
        how: 'Barre du haut : « Visuel ».',
        tags: 'sans code souris personnalisé inspecteur',
      },
      {
        title: 'Afficher / masquer le panneau de gauche',
        text: 'Donne toute la largeur au diagramme.',
        how: 'Bouton en haut à gauche.',
        keys: ['Ctrl+B'],
      },
      {
        title: 'Redimensionner le panneau',
        text: 'La séparation entre le panneau et le diagramme se déplace à la souris.',
        how: 'Glisser la barre verticale.',
      },
    ],
  },
  {
    id: 'diagram',
    title: 'Sur le diagramme',
    items: [
      {
        title: 'Déplacer un élément',
        text: 'Les éléments s’aimantent sur la grille ; au lâcher, un élément ne reste jamais posé sur un autre. Les relations se redessinent à angles droits, sans traverser les éléments.',
        how: 'Glisser l’élément.',
        tags: 'bouger position aimantation grille',
      },
      {
        title: 'Renommer un élément',
        text: 'Le nom change partout : déclaration, relations, héritage, types des attributs, groupes, couleurs. Pour un acteur ou un cas d’utilisation, c’est le nom affiché qui change (espaces acceptés).',
        how: 'Double-clic sur l’élément, puis Entrée (Échap annule).',
        tags: 'nom modifier',
      },
      {
        title: 'Créer une relation',
        text: 'Choisissez le type de relation (les options suivent le type de diagramme), puis la cible.',
        how: 'Tirer un trait depuis une poignée ronde au bord d’un élément jusqu’à la cible ; ou cliquer la poignée, choisir le type, puis cliquer la cible.',
        keys: ['1, 2, 3…'],
        tags: 'lien flèche association héritage',
      },
      {
        title: 'Modifier une relation',
        text: 'Changer son type, inverser son sens ou la supprimer.',
        how: 'Clic sur la relation.',
        keys: ['1, 2, 3…', 'R', 'Suppr'],
        tags: 'lien flèche inverser',
      },
      {
        title: 'Sélection multiple',
        text: 'Sélectionne plusieurs éléments pour les déplacer ensemble ou leur appliquer une action.',
        how: 'Shift+clic sur des éléments, ou Shift+glisser dans le vide pour tracer un rectangle.',
        tags: 'plusieurs lasso rectangle',
      },
      {
        title: 'Actions sur une sélection',
        text: 'Regrouper dans un paquetage (ou placer dans un système), dupliquer, colorer, encadrer comme diagramme typé, supprimer.',
        how: 'Le menu apparaît au-dessus de la sélection.',
        tags: 'menu contextuel',
      },
      {
        title: 'Dupliquer',
        text: 'Copie les éléments avec leurs membres et les relations entre eux ; les copies sont décalées et sélectionnées.',
        how: 'Menu de sélection : « Dupliquer ».',
        keys: ['Ctrl+D'],
        tags: 'copier',
      },
      {
        title: 'Supprimer',
        text: 'Seuls les éléments visés disparaissent (avec les relations qui les touchent) ; tous les autres restent à leur place.',
        how: 'Sélectionner puis Suppr, ou menu de sélection.',
        keys: ['Suppr'],
        tags: 'effacer retirer',
      },
      {
        title: 'Renommer ou dégrouper un groupe',
        text: 'Pour un paquetage, un système ou un cadre de diagramme. Dégrouper retire le cadre ; les éléments restent à leur place.',
        how: 'Clic sur le titre du groupe : « Renommer », « Dégrouper ». Double-clic sur le titre : renommer.',
        tags: 'package paquetage système cadre frontière',
      },
      {
        title: 'Déplacer un groupe',
        text: 'Tous les éléments du groupe suivent.',
        how: 'Glisser le titre du groupe.',
      },
      {
        title: 'Se déplacer et zoomer',
        text: 'Le zoom suit le pointeur de la souris.',
        how: 'Glisser dans le vide pour se déplacer ; molette pour zoomer ; boutons − / + / ajuster en bas à droite.',
        tags: 'zoom pan vue cadrer',
      },
      {
        title: 'Lisibilité automatique',
        text: 'Relations à angles droits, qui ne traversent jamais un élément ; pointes de flèches dégagées ; libellés et multiplicités placés là où ils ne masquent rien.',
        tags: 'routage lignes orthogonales',
      },
    ],
  },
  {
    id: 'visual',
    title: 'Mode Visuel (sans code)',
    items: [
      {
        title: 'Type de diagramme',
        text: 'Décide des éléments et des relations proposés, et du vocabulaire de l’interface. Déduit du contenu tant qu’on ne le choisit pas.',
        how: 'Panneau de gauche, en haut.',
      },
      {
        title: 'Ajouter un élément',
        text: 'Tapez seulement son nom, espaces et accents compris (« Passer une commande »).',
        how: 'Boutons « + Classe », « + Acteur », « + Cas d’utilisation »…',
      },
      {
        title: 'Fiche d’un élément',
        text: 'Nom, nature, héritage, interfaces réalisées, attributs et opérations (avec visibilité), valeurs d’une énumération, classe d’un objet, appartenance à un système ou un paquetage, couleur, relations et multiplicités. Dupliquer, supprimer.',
        how: 'Clic sur l’élément (liste ou diagramme).',
        tags: 'inspecteur attributs méthodes opérations visibilité',
      },
      {
        title: 'Relations',
        text: 'Source, type, cible, libellé et multiplicités se règlent avec des menus. Les stéréotypes («include», «extend», «import»…) sont des types à part entière.',
        how: 'Section « Relations » du panneau.',
      },
      {
        title: 'Groupes',
        text: 'Liste des paquetages, systèmes et cadres : titre modifiable, bouton « Dégrouper ».',
        how: 'Section « Groupes » du panneau.',
      },
    ],
  },
  {
    id: 'code',
    title: 'Mode Code (script)',
    intro: 'Une ligne par déclaration ou par relation. Une erreur est signalée en bas sans effacer le dernier dessin valide.',
    items: [
      {
        title: 'Classes et membres',
        text: 'Visibilité : + public, - privé, # protégé, ~ paquetage. Une ligne avec des parenthèses est une opération.',
        code: 'abstract class Animal {\n  # nom: string\n  + manger(): void\n}\ninterface Domestique\nenum Couleur {\n  ROUGE\n}',
        tags: 'attribut méthode opération visibilité',
      },
      {
        title: 'Héritage écrit dans la classe',
        text: '« extends » et « implements » créent la flèche tout seuls ; modifier la flèche met le code à jour, et inversement.',
        code: 'class Chien extends Animal implements Domestique {\n}',
        tags: 'généralisation réalisation',
      },
      {
        title: 'Relations',
        text: '-- association · --> navigable · --|> généralisation · ..|> réalisation · ..> dépendance · *-- composition · o-- agrégation. Libellé après « : », multiplicités entre guillemets.',
        code: 'Client "1" -- "0..*" Commande : passe\nCommande *-- Ligne',
        tags: 'flèches multiplicité libellé',
      },
      {
        title: 'Relations déduites des membres',
        text: 'Un attribut du type d’une autre classe crée une association navigable ; un paramètre ou un retour, une dépendance.',
        code: 'class Personne {\n  + animal: Animal\n}',
      },
      {
        title: 'Autres éléments UML',
        text: 'Acteur, cas d’utilisation, objet (avec sa classe), système, paquetage ; le nom affiché entre guillemets.',
        code: 'actor Client "Client web"\nusecase Payer "Payer en ligne"\nobject ihm : EcranCommande\nsystem Boutique "Boutique en ligne"\npackage Metier "Métier"',
      },
      {
        title: 'Groupes et cadres',
        text: 'Un système ou un paquetage avec une liste de membres est dessiné autour d’eux ; « diagram » encadre une zone comme un diagramme typé (class, usecase, context, package, communication).',
        code: 'system Boutique "Boutique" : Payer, Commander\ndiagram usecase "Ventes" : Client, Payer',
        tags: 'package frontière cadre',
      },
      {
        title: 'Apparence dans le script',
        text: 'Couleur (nommée ou #hex) avec entrée de légende, coins carrés, titre ou masquage de la légende.',
        code: 'color Animal, Chien bleu "Métier"\nstyle square\nlegend "Légende"\nlegend off',
        tags: 'couleur légende coins',
      },
      {
        title: 'Autocomplétion',
        text: 'Propose les classes, éléments, attributs et opérations déjà écrits, les mots-clés et les couleurs.',
        keys: ['Ctrl+Espace'],
        tags: 'complétion suggestions',
      },
      {
        title: 'Tout le diagramme / un élément',
        text: 'N’affiche que le code de l’élément cliqué sur le diagramme.',
        how: 'Au-dessus de l’éditeur.',
      },
    ],
  },
  {
    id: 'types',
    title: 'Types de diagramme',
    intro: 'Un même tableau peut mélanger plusieurs notations. Chaque type a ses éléments, ses relations et son vocabulaire.',
    items: [
      { title: 'Diagramme de classes', text: 'Classes, classes abstraites, interfaces, énumérations ; association, généralisation, réalisation, dépendance, composition, agrégation.' },
      { title: 'Cas d’utilisation', text: 'Acteurs, cas d’utilisation, frontière du système ; association, «include», «extend», généralisation.' },
      { title: 'Contexte statique', text: 'Le système au centre, les acteurs autour ; associations avec multiplicités.' },
      { title: 'Paquetages', text: 'Paquetages ; dépendance, «import», «access», «merge». Lecture de haut en bas.' },
      { title: 'Communication', text: 'Objets et acteurs ; messages numérotés (1: valider()), liens, «create».' },
    ],
  },
  {
    id: 'style',
    title: 'Apparence',
    items: [
      {
        title: 'Couleurs',
        text: 'Neuf teintes ou une couleur libre ; s’applique dès le clic. Le texte reste lisible quelle que soit la couleur.',
        how: 'Menu de sélection : « Couleur », ou fiche de l’élément en mode Visuel.',
      },
      {
        title: 'Légende',
        text: 'Chaque couleur nommée devient une entrée de légende, placée sous le diagramme et incluse dans les exports.',
        how: 'Donner un nom à la couleur ; afficher / masquer : menu « Style ».',
      },
      { title: 'Coins arrondis ou carrés', text: 'Pour un rendu plus sobre dans un rapport.', how: 'Menu « Style ».' },
      { title: 'Thème clair / sombre', text: 'L’export PDF reste toujours clair, prêt à imprimer.', how: 'Bouton soleil / lune en haut à droite.', tags: 'dark mode nuit' },
    ],
  },
  {
    id: 'boards',
    title: 'Tableaux (onglets)',
    items: [
      { title: 'Nouveau tableau', text: 'Vide, ou à partir d’un exemple de chaque type de diagramme (on apprend en le modifiant).', how: '« + Nouveau » à côté des onglets.', tags: 'modèle template onglet' },
      { title: 'Renommer un tableau', text: 'Le nom sert aussi pour les fichiers exportés.', how: 'Double-clic sur l’onglet.' },
      { title: 'Fermer un tableau', text: 'Un bouton « Annuler » permet de le rouvrir aussitôt.', how: 'Croix de l’onglet.' },
    ],
  },
  {
    id: 'files',
    title: 'Exporter et importer',
    intro: 'Avec plusieurs onglets, le menu Exporter commence par la liste des tableaux à cocher (le tableau affiché est coché d’office).',
    items: [
      { title: 'Document PDF', text: 'A4, orientation automatique, prêt à imprimer. Plusieurs tableaux cochés : un seul PDF, une page par tableau.', how: 'Exporter → Document PDF.', keys: ['Ctrl+P'] },
      { title: 'Projet X-UML (.json)', text: 'Le contenu et la disposition des tableaux, pour reprendre le travail plus tard.', how: 'Exporter → Projet. Ctrl+S exporte tous les tableaux.', keys: ['Ctrl+S'], tags: 'sauvegarder enregistrer' },
      { title: 'Code du diagramme (.txt)', text: 'Le script seul : à lire, à versionner (Git) ou à réimporter.', how: 'Exporter → Code du diagramme.' },
      { title: 'Image (.svg)', text: 'Nette à toutes les tailles, pour un rapport ou un site ; une image par tableau coché.', how: 'Exporter → Image du diagramme.' },
      { title: 'Importer', text: 'Un projet .json (tous ses tableaux), ou un script .txt / .xuml / .puml (PlantUML) qui devient un tableau.', how: 'Bouton Importer, ou glisser-déposer le fichier sur la fenêtre.', keys: ['Ctrl+O'], tags: 'ouvrir plantuml' },
    ],
  },
  {
    id: 'safety',
    title: 'Sauvegarde et annulation',
    items: [
      { title: 'Sauvegarde automatique', text: 'Tout est enregistré dans le navigateur au fil de l’eau, sans compte ni serveur. L’indicateur en haut à gauche le confirme.', tags: 'local hors ligne' },
      { title: 'Annuler / rétablir', text: 'Toute action est annulable : frappe, déplacement, suppression, couleur, onglet…', keys: ['Ctrl+Z', 'Ctrl+Y'], how: 'Ou les flèches de la barre du haut.' },
    ],
  },
];

/** Raccourcis clavier, regroupés pour le tableau récapitulatif. */
export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'F1', action: 'Afficher les fonctionnalités' },
  { keys: 'Ctrl+Z', action: 'Annuler' },
  { keys: 'Ctrl+Y · Ctrl+Maj+Z', action: 'Rétablir' },
  { keys: 'Ctrl+D', action: 'Dupliquer la sélection' },
  { keys: 'Suppr', action: 'Supprimer la sélection ou la relation choisie' },
  { keys: 'Échap', action: 'Désélectionner, fermer un menu, annuler une relation en cours' },
  { keys: '1, 2, 3…', action: 'Type de la relation choisie ou en cours de création (dans l’ordre du menu)' },
  { keys: 'R', action: 'Inverser le sens de la relation choisie' },
  { keys: 'Ctrl+Espace', action: 'Autocomplétion (mode Code)' },
  { keys: 'Ctrl+B', action: 'Afficher / masquer le panneau de gauche' },
  { keys: 'Ctrl+S', action: 'Exporter le projet (tous les tableaux)' },
  { keys: 'Ctrl+P', action: 'Exporter le tableau affiché en PDF' },
  { keys: 'Ctrl+O', action: 'Importer un fichier' },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Filtre le catalogue (insensible aux accents) ; une section sans résultat disparaît. */
export function searchFeatures(query: string, sections: FeatureSection[] = FEATURE_SECTIONS): FeatureSection[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return sections;
  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter((f) => {
        const hay = norm([s.title, f.title, f.text, f.how, f.code, f.tags, ...(f.keys ?? [])].filter(Boolean).join(' '));
        return words.every((w) => hay.includes(w));
      }),
    }))
    .filter((s) => s.items.length > 0);
}
