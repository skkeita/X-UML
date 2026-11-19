import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { prefersReducedMotion, type ThemeName } from '../core/theme';

const KEY = 'x-uml:theme';

function initialTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* stockage indisponible : on retombe sur la préférence système */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown };

export function useTheme(): { theme: ThemeName; toggle: () => void } {
  const [theme, setTheme] = useState<ThemeName>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignoré */
    }
  }, [theme]);

  // Bascule clair / sombre en fondu enchaîné (View Transitions) : le navigateur fond deux
  // captures de la page en opacité, sur le compositeur — aucune transition de couleur élément
  // par élément. Sans l'API, ou en mouvement réduit, le thème change simplement d'un coup.
  const toggle = useCallback(() => {
    const apply = () =>
      flushSync(() =>
        setTheme((t) => {
          const next = t === 'dark' ? 'light' : 'dark';
          document.documentElement.classList.toggle('dark', next === 'dark');
          return next;
        }),
      );
    const doc = document as ViewTransitionDocument;
    if (doc.startViewTransition && !prefersReducedMotion()) doc.startViewTransition(apply);
    else apply();
  }, []);
  return { theme, toggle };
}
