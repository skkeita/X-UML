import { useRef } from 'react';
import type { Rect } from '../core/types';
import type { SceneTheme } from '../core/theme';

interface View {
  x: number;
  y: number;
  k: number;
}

const MAX_W = 184;
const MAX_H = 124;
const PAD = 40;

/**
 * Mini-carte : vue d'ensemble d'un grand diagramme, avec le cadre de la zone affichée.
 * Cliquer ou glisser dans la carte déplace la vue (le zoom ne change pas).
 * N'apparaît que lorsque le diagramme déborde de la fenêtre : inutile sinon.
 */
export function MiniMap({
  boxes,
  frames,
  selection,
  view,
  width,
  height,
  theme,
  onView,
}: {
  boxes: Rect[];
  frames: Rect[];
  selection: Rect[];
  view: View;
  width: number;
  height: number;
  theme: SceneTheme;
  onView: (v: View) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const all = [...boxes, ...frames];
  if (all.length === 0) return null;
  const minX = Math.min(...all.map((r) => r.x)) - PAD;
  const minY = Math.min(...all.map((r) => r.y)) - PAD;
  const maxX = Math.max(...all.map((r) => r.x + r.w)) + PAD;
  const maxY = Math.max(...all.map((r) => r.y + r.h)) + PAD;

  // Zone affichée, en coordonnées du diagramme.
  const vp = { x: -view.x / view.k, y: -view.y / view.k, w: width / view.k, h: height / view.k };
  const overflow = minX + PAD < vp.x || minY + PAD < vp.y || maxX - PAD > vp.x + vp.w || maxY - PAD > vp.y + vp.h;
  if (!overflow) return null;

  // La carte couvre le diagramme ET la zone affichée (on voit où l'on est, même hors du dessin).
  const x0 = Math.min(minX, vp.x);
  const y0 = Math.min(minY, vp.y);
  const w0 = Math.max(maxX, vp.x + vp.w) - x0;
  const h0 = Math.max(maxY, vp.y + vp.h) - y0;
  const s = Math.min(MAX_W / w0, MAX_H / h0);
  const W = Math.round(w0 * s);
  const H = Math.round(h0 * s);

  const centerOn = (clientX: number, clientY: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const dx = x0 + (clientX - r.left) / s;
    const dy = y0 + (clientY - r.top) / s;
    onView({ k: view.k, x: width / 2 - dx * view.k, y: height / 2 - dy * view.k });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90" data-minimap="">
      <svg
        ref={ref}
        width={W}
        height={H}
        role="img"
        aria-label="Mini-carte du diagramme : cliquez pour vous y déplacer"
        className="block cursor-pointer touch-none"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          centerOn(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) centerOn(e.clientX, e.clientY);
        }}
      >
        <g transform={`scale(${s}) translate(${-x0} ${-y0})`}>
          {frames.map((r, i) => (
            <rect key={`f${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={theme.muted} strokeOpacity={0.6} strokeWidth={1.5 / s} strokeDasharray={`${4 / s} ${3 / s}`} />
          ))}
          {boxes.map((r, i) => (
            <rect key={`b${i}`} x={r.x} y={r.y} width={r.w} height={r.h} rx={3 / s} fill={theme.muted} fillOpacity={0.35} />
          ))}
          {selection.map((r, i) => (
            <rect key={`s${i}`} x={r.x} y={r.y} width={r.w} height={r.h} rx={3 / s} fill={theme.accent} fillOpacity={0.7} />
          ))}
          <rect x={vp.x} y={vp.y} width={vp.w} height={vp.h} fill={theme.accent} fillOpacity={0.08} stroke={theme.accent} strokeWidth={1.5 / s} data-minimap-viewport="" />
        </g>
      </svg>
    </div>
  );
}
