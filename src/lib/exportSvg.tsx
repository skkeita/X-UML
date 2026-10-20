import { renderToStaticMarkup } from 'react-dom/server';
import { DiagramScene } from '../components/DiagramScene';
import { boundsOf } from '../core/layout';
import type { SceneTheme } from '../core/theme';
import type { Diagram, Rect } from '../core/types';

const PADDING = 32;

/** Construit un SVG autonome (viewBox ajustée au contenu, fond inclus). */
export function buildSvgString(diagram: Diagram, boxes: Record<string, Rect>, theme: SceneTheme): string {
  const b = boundsOf(Object.values(boxes)) ?? { x: 0, y: 0, w: 200, h: 100 };
  // Marge supplémentaire à droite pour les liens réflexifs et les libellés.
  const x = b.x - PADDING;
  const y = b.y - PADDING;
  const w = b.w + PADDING * 2 + 60;
  const h = b.h + PADDING * 2;

  const markup = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${x} ${y} ${w} ${h}`} width={w} height={h}>
      <rect x={x} y={y} width={w} height={h} fill={theme.bg} />
      <DiagramScene diagram={diagram} boxes={boxes} theme={theme} />
    </svg>,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

export function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Laisse le temps au navigateur de démarrer le téléchargement.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
