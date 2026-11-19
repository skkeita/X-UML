// Déclaration minimale pour les tests qui relisent un fichier du dépôt (vitest tourne sous Node).
// Évite d'ajouter @types/node au projet pour une seule fonction.
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}
