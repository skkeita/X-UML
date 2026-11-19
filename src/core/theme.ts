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

/* ------------------------------------------------------------------ */
/* Charte : monochrome + violet pastel                                */
/* ------------------------------------------------------------------ */

/**
 * Miroir hexadécimal des variables CSS de src/index.css (rôle → couleur, par mode).
 * Choix technique : l'interface lit les variables CSS, mais le SVG exporté doit rester
 * autonome (ouvert hors de l'application) → il lui faut des valeurs en dur. Le test
 * theme.sync.test.ts garantit que ce miroir et la feuille de style ne divergent jamais.
 */
export const PALETTE = {
  light: {
    bg: '#FAFAFA',
    surface: '#FFFFFF',
    'surface-2': '#F2F2F2',
    line: '#E4E4E4',
    'line-strong': '#8C8C8C',
    fg: '#171717',
    'fg-muted': '#6B6B6B',
    accent: '#C4B5FD',
    'accent-hover': '#B3A1FB',
    'accent-ink': '#171717',
    'accent-strong': '#6C55D3',
    'accent-soft': '#F6F3FF',
  },
  dark: {
    bg: '#0A0A0A',
    surface: '#171717',
    'surface-2': '#262626',
    line: '#333333',
    'line-strong': '#6B6B6B',
    fg: '#F2F2F2',
    'fg-muted': '#A3A3A3',
    accent: '#C4B5FD',
    'accent-hover': '#D6CBFE',
    'accent-ink': '#0A0A0A',
    'accent-strong': '#C4B5FD',
    'accent-soft': '#231F33',
  },
} as const;

export type ColorRole = keyof (typeof PALETTE)['light'];

/** Nom de la variable CSS d'un rôle, pour un style en ligne : `rgb(${cssVar('accent')})`. */
export const cssVar = (role: ColorRole): string => `var(--${role})`;

/** Jetons de mouvement (miroir de --ease / --dur-* pour les animations lancées en JavaScript). */
export const MOTION = {
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  fast: 150,
  base: 200,
  slow: 250,
} as const;

/** Vrai si l'utilisateur a demandé moins d'animations : on n'en joue alors aucune. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const LIGHT: SceneTheme = {
  bg: PALETTE.light.bg,
  grid: '#CFCFCF',
  boxFill: PALETTE.light.surface,
  boxStroke: '#262626', // trait noir net : la boîte se lit avant tout le reste
  headerFill: PALETTE.light['surface-2'],
  text: PALETTE.light.fg,
  muted: PALETTE.light['fg-muted'],
  edge: '#3D3D3D',
  accent: PALETTE.light['accent-strong'], // sélection, poignées : violet soutenu (3:1 sur le fond clair)
  noteFill: '#F2F2F2',
};

export const DARK: SceneTheme = {
  bg: PALETTE.dark.bg,
  grid: '#333333',
  boxFill: PALETTE.dark.surface,
  boxStroke: '#8C8C8C',
  headerFill: PALETTE.dark['surface-2'],
  text: PALETTE.dark.fg,
  muted: PALETTE.dark['fg-muted'],
  edge: '#A3A3A3',
  accent: PALETTE.dark['accent-strong'], // violet pastel
  noteFill: '#262626',
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
  const text = light ? '#171717' : '#ffffff';
  return {
    ...theme,
    headerFill: color,
    boxFill: light ? mix(color, '#ffffff', 0.55) : mix(color, '#000000', 0.25),
    // Une note colorée prend la teinte choisie (au lieu du papier jaune par défaut).
    noteFill: light ? mix(color, '#ffffff', 0.4) : mix(color, '#000000', 0.25),
    text,
    muted: light ? '#525252' : '#E4E4E4',
    boxStroke: light ? mix(color, '#000000', 0.55) : mix(color, '#ffffff', 0.35),
  };
}
