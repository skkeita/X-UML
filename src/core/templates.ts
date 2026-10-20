import { SAMPLE_SOURCE } from './sample';
import type { DiagramType } from './types';

/*
 * Modèles proposés à la création d'un tableau : un exemple court et correct de chaque type
 * de diagramme, pour découvrir la syntaxe sans documentation (on apprend en modifiant).
 */

export interface Template {
  id: string;
  /** Nom du tableau créé. */
  name: string;
  /** Libellé dans le menu « + ». */
  label: string;
  hint: string;
  source: string;
  /** Type de diagramme du tableau créé (absent pour un tableau vide : déduit de son contenu). */
  type?: DiagramType;
}

export const TEMPLATES: Template[] = [
  { id: 'empty', name: 'Tableau', label: 'Tableau vide', hint: 'Une page blanche', source: '' },
  {
    id: 'class',
    type: 'class',
    name: 'Classes',
    label: 'Diagramme de classes',
    hint: 'Classes, héritage, interfaces',
    source: SAMPLE_SOURCE,
  },
  {
    id: 'usecase',
    type: 'usecase',
    name: 'Cas d’utilisation',
    label: 'Cas d’utilisation',
    hint: 'Acteurs, cas, frontière du système, «include»',
    source: `// Diagramme de cas d'utilisation — Boutique en ligne
actor Client
actor Admin "Administrateur"
usecase Consulter "Consulter le catalogue"
usecase Commander "Passer une commande"
usecase Payer "Payer en ligne"
usecase Identifier "S'identifier"
usecase GererStock "Gérer le stock"
system Boutique "Boutique en ligne" : Consulter, Commander, Payer, Identifier, GererStock

Client -- Consulter
Client -- Commander
Admin -- GererStock
Commander ..> Payer : <<include>>
Commander ..> Identifier : <<include>>
GererStock ..> Identifier : <<include>>

diagram usecase "Gestion des commandes" : Client, Admin, Consulter, Commander, Payer, Identifier, GererStock
`,
  },
  {
    id: 'context',
    type: 'context',
    name: 'Contexte statique',
    label: 'Contexte statique',
    hint: 'Le système et les acteurs qui l’entourent',
    source: `// Diagramme de contexte statique — Bibliothèque
system Biblio "Gestion de bibliothèque"
actor Adherent "Adhérent"
actor Bibliothecaire "Bibliothécaire"
actor Fournisseur
actor Banque

Adherent "0..*" -- "1" Biblio
Bibliothecaire "1..*" -- "1" Biblio
Fournisseur "0..*" -- "1" Biblio
Banque "1" -- "1" Biblio

diagram context "Bibliothèque" : Biblio, Adherent, Bibliothecaire, Fournisseur, Banque
`,
  },
  {
    id: 'package',
    type: 'package',
    name: 'Paquetages',
    label: 'Paquetages',
    hint: 'Paquetages et dépendances entre eux',
    source: `// Diagramme de paquetages — Application de gestion
package IHM "Interface"
package Metier "Métier"
package Donnees "Données"
package Securite "Sécurité"

IHM ..> Metier : <<import>>
Metier ..> Donnees : <<access>>
IHM ..> Securite
Metier ..> Securite

diagram package "Architecture" : IHM, Metier, Donnees, Securite
`,
  },
  {
    id: 'communication',
    type: 'communication',
    name: 'Communication',
    label: 'Communication',
    hint: 'Objets et messages numérotés',
    source: `// Diagramme de communication — Passer une commande
actor Client
object ihm : EcranCommande
object ctrl : ControleurCommande
object cmd : Commande
object stock : Stock

Client --> ihm : 1: valider()
ihm --> ctrl : 1.1: creerCommande()
ctrl --> stock : 1.2: verifierStock()
ctrl --> cmd : 1.3: <<create>>

diagram communication "Passer une commande" : Client, ihm, ctrl, cmd, stock
`,
  },
];
