// Jetons de couleur du rendu SVG.
// Choix UX/technique : couleurs en attributs SVG (pas de classes Tailwind) → le même
// composant sert à l'affichage ET à l'export SVG autonome, avec le thème courant.

export type ThemeName = 'light' | 'dark';

export interface SceneTheme {
  bg: string;
  grid: string;
  boxFill: string;
  boxStroke: string;
  headerFill: string;
  text: string;
  muted: string;
  edge: string;
  accent: string;
}

export const LIGHT: SceneTheme = {
  bg: '#f8fafc',
  grid: '#cbd5e1',
  boxFill: '#ffffff',
  boxStroke: '#64748b',
  headerFill: '#e0e7ff',
  text: '#0f172a',
  muted: '#64748b',
  edge: '#475569',
  accent: '#4f46e5',
};

export const DARK: SceneTheme = {
  bg: '#0b1020',
  grid: '#1e293b',
  boxFill: '#111827',
  boxStroke: '#475569',
  headerFill: '#1e1b4b',
  text: '#e2e8f0',
  muted: '#94a3b8',
  edge: '#94a3b8',
  accent: '#818cf8',
};

export const sceneTheme = (name: ThemeName): SceneTheme => (name === 'dark' ? DARK : LIGHT);
