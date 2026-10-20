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
```

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
