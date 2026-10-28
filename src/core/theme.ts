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
  /** 1 = coins arrondis (par défaut), 0 = coins carrés. */
  corner?: number;
  /** Fond des notes UML (papier légèrement jaune, comme un post-it de relecture). */
  noteFill?: string;
}

export const LIGHT: SceneTheme = {
  bg: '#F3F5F8', // calque
  grid: '#C5D0DB',
  boxFill: '#FFFFFF',
  boxStroke: '#3B4859', // trait d'encre net, comme sur un plan
  headerFill: '#E2EBF6', // en-tête bleu cobalt très clair
  text: '#17212D',
  muted: '#5E6C7E',
  edge: '#2F3B4A',
  accent: '#1F5FAD', // cobalt : sélection, poignées
  noteFill: '#FBF5DD',
};

export const DARK: SceneTheme = {
  bg: '#0E1620',
  grid: '#223142',
  boxFill: '#142030',
  boxStroke: '#5D7189',
  headerFill: '#1A3250',
  text: '#E5EBF1',
  muted: '#98A7B8',
  edge: '#A2B2C4',
  accent: '#6FA3E3',
  noteFill: '#2A2719',
};

export const sceneTheme = (name: ThemeName): SceneTheme => (name === 'dark' ? DARK : LIGHT);

/** Thème d'impression (PDF) : toujours clair, fond blanc, quel que soit le thème de l'écran. */
export const PRINT: SceneTheme = { ...LIGHT, bg: '#ffffff' };

/* ------------------------------------------------------------------ */
/* Couleurs personnalisées                                            */
/* ------------------------------------------------------------------ */

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
const hexOf = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
/** Mélange `a` et `b` (t = part de `b`). */
export const mix = (a: string, b: string, t: number): string => {
  const x = rgb(a);
  const y = rgb(b);
  return hexOf(x.map((v, i) => v + (y[i] - v) * t));
};
/** Luminance relative (0 = noir, 1 = blanc). */
export const luminance = (hex: string): number => {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Thème d'un élément coloré : l'en-tête prend la couleur choisie, le corps une teinte plus claire,
 * et le texte passe en clair ou en foncé selon le contraste (lisible même avec une couleur sombre).
 */
export function tinted(theme: SceneTheme, color: string): SceneTheme {
  const light = luminance(color) > 0.35;
  const text = light ? '#0f172a' : '#ffffff';
  return {
    ...theme,
    headerFill: color,
    boxFill: light ? mix(color, '#ffffff', 0.55) : mix(color, '#000000', 0.25),
    // Une note colorée prend la teinte choisie (au lieu du papier jaune par défaut).
    noteFill: light ? mix(color, '#ffffff', 0.4) : mix(color, '#000000', 0.25),
    text,
    muted: light ? '#475569' : '#e2e8f0',
    boxStroke: light ? mix(color, '#000000', 0.55) : mix(color, '#ffffff', 0.35),
  };
}
