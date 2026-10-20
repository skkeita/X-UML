export const SAMPLE_SOURCE = `// Bienvenue dans X-UML : écrivez à gauche, le diagramme se dessine à droite.
// Glissez les boîtes à la souris pour les ranger (aimantation sur la grille, Alt pour la désactiver).

abstract class Animal {
  # nom: string
  - age: int
  + manger(): void
  + crier(): void
}

class Chien {
  + race: string
  + aboyer(): void
}

class Chat {
  + chasser(): void
}

interface Domestique {
  + getProprietaire(): Personne
}

class Personne {
  + nom: string
  + adopter(a: Animal): void
}

Chien --|> Animal
Chat --|> Animal
Chien ..|> Domestique
Personne --> Animal : adopte
`;
