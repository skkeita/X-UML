/** @type {import('tailwindcss').Config} */

/*
 * Identité X-UML : monochrome + un seul accent violet pastel.
 *
 * Aucune couleur n'est écrite ici : tout pointe vers les variables CSS de src/index.css
 * (triplets « R V B », d'où rgb(var(--x) / <alpha-value>) pour garder les opacités Tailwind).
 *  - « slate » devient l'échelle de gris neutres, « indigo » l'échelle violette : les
 *    composants existants (slate-*, indigo-*) changent d'un coup, sans réécriture ;
 *  - les rôles (canvas, surface, line, fg, accent) basculent seuls entre clair et sombre :
 *    les nouveaux composants n'ont plus besoin de variantes dark:.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (prefix) =>
  Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((k) => [k, token(`${prefix}-${k}`)]));

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: scale('gray'),
        indigo: scale('violet'),
        canvas: token('bg'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2') },
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        fg: { DEFAULT: token('fg'), muted: token('fg-muted') },
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          ink: token('accent-ink'),
          strong: token('accent-strong'),
          soft: token('accent-soft'),
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      // Trois niveaux d'ombre seulement : sm (contrôle), lg (menu), 2xl (fenêtre).
      boxShadow: {
        sm: 'var(--shadow-1)',
        DEFAULT: 'var(--shadow-1)',
        md: 'var(--shadow-2)',
        lg: 'var(--shadow-2)',
        xl: 'var(--shadow-3)',
        '2xl': 'var(--shadow-3)',
      },
      // Mouvement : toute classe transition-* hérite de la courbe et de la durée « fast ».
      transitionTimingFunction: { DEFAULT: 'var(--ease)', token: 'var(--ease)' },
      transitionDuration: { DEFAULT: 'var(--dur-fast)', fast: 'var(--dur-fast)', base: 'var(--dur-base)', slow: 'var(--dur-slow)' },
      animation: {
        'fade-in': 'xu-fade-in var(--dur-base) var(--ease) both',
        'pop-in': 'xu-pop-in var(--dur-base) var(--ease) both',
        'panel-in': 'xu-panel-in var(--dur-slow) var(--ease) both',
        'panel-in-right': 'xu-panel-in-right var(--dur-slow) var(--ease) both',
        'toast-in': 'xu-toast-in var(--dur-slow) var(--ease) both',
      },
    },
  },
  plugins: [],
};
