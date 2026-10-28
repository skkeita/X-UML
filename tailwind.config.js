/** @type {import('tailwindcss').Config} */

/*
 * Identité X-UML : la planche à dessin technique.
 *  - « slate » est remplacé par un graphite bleuté (encre sur calque) ;
 *  - « indigo » par un bleu cobalt franc (le bleu des plans), sans la teinte violette générique.
 * Les composants gardent leurs classes (slate-*, indigo-*) : toute l'application change d'un coup.
 */
const graphite = {
  50: '#F4F6F9',
  100: '#E9EDF2',
  200: '#D6DDE5',
  300: '#B6C2CE',
  400: '#8796A7',
  500: '#627287',
  600: '#4B5A6C',
  700: '#384555',
  800: '#243140',
  900: '#17212D',
  950: '#0E1620',
};
const cobalt = {
  50: '#EDF3FB',
  100: '#DAE7F6',
  200: '#B6CEEC',
  300: '#89AFDF',
  400: '#5A8BCD',
  500: '#356FBC',
  600: '#1F5FAD',
  700: '#1A4D8D',
  800: '#173F72',
  900: '#14335B',
  950: '#0D2139',
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: graphite,
        indigo: cobalt,
        /** Encre de Prusse : la barre de l'application. */
        ink: { DEFAULT: '#13263A', light: '#1C3550', line: '#2A4462' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
