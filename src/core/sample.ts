export const SAMPLE_SOURCE = `// Bienvenue dans X-UML : écrivez à gauche, le diagramme se dessine à droite.
// « extends » / « implements » créent la flèche d'héritage toute seule. Glissez les boîtes pour les ranger.

abstract class Animal {
  # nom: string
  - age: int
  + manger(): void
  + crier(): void
}

class Chien extends Animal implements Domestique {
  + race: string
  + aboyer(): void
}

class Chat extends Animal {
  + chasser(): void
}

interface Domestique {
  + getProprietaire(): Personne
}

class Personne {
  + nom: string
  + adopter(a: Animal): void
}

// Les autres relations s’écrivent ici, ou se règlent à la souris en mode Visuel (sans code)
Personne --> Animal : adopte
`;
