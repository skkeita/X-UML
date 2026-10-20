import { renderToStaticMarkup } from 'react-dom/server';
import { DiagramScene } from '../components/DiagramScene';
import { boundsOf, legendBox, sceneFromBoxes } from '../core/layout';
import type { SceneTheme } from '../core/theme';
import type { Diagram, Rect } from '../core/types';

const PADDING = 32;

/** Construit un SVG autonome (viewBox ajustée au contenu, fond inclus). */
export function buildSvgString(diagram: Diagram, boxes: Record<string, Rect>, theme: SceneTheme): string {
  return buildSvg(diagram, boxes, theme).svg;
}

/** Variante qui renvoie aussi la taille de l'image (utile pour la mise en page PDF). */
export function buildSvg(diagram: Diagram, boxes: Record<string, Rect>, theme: SceneTheme): { svg: string; width: number; height: number } {
  // Le cadrage englobe aussi les liens : un contournement passe parfois au-delà des classes.
  const { edges, frames } = sceneFromBoxes(diagram, boxes);
  const extra = edges.flatMap((e) => [...e.points, e.label]).map((p) => ({ x: p.x - 30, y: p.y - 10, w: 60, h: 20 }));
  // Un acteur a un nom qui peut déborder de sa boîte : on garde une marge latérale.
  const legend = legendBox(diagram, [...Object.values(boxes), ...Object.values(frames)]);
  const b = boundsOf([...Object.values(boxes), ...Object.values(frames), ...extra, ...(legend ? [legend] : [])]) ?? { x: 0, y: 0, w: 200, h: 100 };
  const x = b.x - PADDING;
  const y = b.y - PADDING;
  const w = b.w + PADDING * 2;
  const h = b.h + PADDING * 2;

  const markup = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${x} ${y} ${w} ${h}`} width={w} height={h}>
      <rect x={x} y={y} width={w} height={h} fill={theme.bg} />
      <DiagramScene diagram={diagram} boxes={boxes} theme={theme} edges={edges} frames={frames} />
    </svg>,
  );
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`, width: w, height: h };
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
