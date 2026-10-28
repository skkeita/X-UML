# X-UML

Éditeur de diagrammes de classes UML **100 % local** : on écrit un script à gauche, le diagramme SVG se dessine à droite.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parseur, layout, export
npm run build    # dist/ prêt pour GitHub Pages (base './')
```

## Syntaxe

```
// commentaire
abstract class Animal {
  # nom: string
  + manger(): void
}
interface Domestique { + getProprietaire(): Personne }

Chien --|> Animal            héritage
Chien ..|> Domestique        réalisation
Personne --> Animal : adopte association dirigée + libellé
A -- B    A *-- B    A o-- B    A ..> B

note N1 "Texte de la note" : Chien, Chat   note rattachée (pointillés)
```

## Outils pratiques

- **Générer le code** (Exporter → Code source) : squelettes Java (un fichier par classe, .zip), TypeScript ou Python.
- **Importer du Java** : déposez un ou plusieurs `.java`, ils deviennent un diagramme de classes.
- **Vérification du modèle** : badge en bas à droite (héritage circulaire, élément isolé, nom en double…).
- **Historique des versions** : instantané toutes les 10 min et avant chaque import, restauration annulable.
- **Lien de partage** : le tableau est compressé dans l'adresse (`#d=…`), rien n'est envoyé à un serveur.
- **Copier / coller** (`Ctrl+C` / `Ctrl+V`), y compris d'un onglet à l'autre ; **aligner / répartir** une sélection ; **mini-carte** des grands diagrammes.

## Architecture

```
src/
├─ core/        logique pure, sans React ni DOM (testable seule)
│  ├─ types.ts      modèle : ClassNode, Relation, Diagram
│  ├─ parser.ts     texte → Diagram + erreurs par ligne
│  ├─ layout.ts     mesure des boîtes, placement auto, géométrie des liens
│  └─ theme.ts      jetons de couleur clair / sombre
├─ components/
│  ├─ CodeEditor.tsx    textarea + calque de colorisation
│  ├─ Canvas.tsx        pan / zoom / drag & drop / snapping
│  ├─ DiagramScene.tsx  rendu SVG pur (écran ET export)
│  ├─ SplitPane.tsx, Toolbar.tsx, Icons.tsx
├─ hooks/       useDebouncedValue, useAutosave, useTheme
├─ lib/         storage (localStorage), exportSvg
└─ App.tsx      orchestration : texte → parse → dernier rendu valide → positions → canevas
```

Raccourcis : `Ctrl+B` masque l'éditeur · `Alt` pendant un glisser désactive l'aimantation.

## Confidentialité

X-UML ne collecte aucune donnée : pas de compte, pas de serveur, pas de cookie, pas de mesure d'audience, pas de publicité, aucune ressource chargée depuis un autre site (les polices sont incluses dans l'application).
Vos diagrammes, leur historique de versions et vos préférences (thème, mode d'édition) sont enregistrés uniquement dans votre navigateur (`localStorage`) et ne quittent jamais votre ordinateur, sauf si vous les exportez vous-même.
Un lien de partage contient le diagramme dans son fragment (`#d=…`), que le navigateur n'envoie jamais au serveur.
Le site est hébergé par GitHub Pages, qui peut conserver des journaux techniques (adresse IP) pour la sécurité du service : voir la [déclaration de confidentialité de GitHub](https://docs.github.com/fr/site-policy/privacy-policies/github-general-privacy-statement).

Le détail (mentions légales, confidentialité, licences) est consultable dans l'application : lien « Mentions légales » en bas du diagramme.

## Licence

Code publié sous licence [MIT](LICENSE) © 2026 skkeita.
Les diagrammes que vous créez vous appartiennent.

X-UML inclut des composants open source (React, jsPDF et ses dépendances sous licence MIT ; polices IBM Plex sous licence SIL Open Font License 1.1). Leurs licences complètes sont générées à chaque build dans `dist/third-party-licenses.txt` et publiées avec le site.

## Contribuer, signaler un problème

Les suggestions et signalements se font dans les [issues du dépôt](https://github.com/skkeita/X-UML/issues).
