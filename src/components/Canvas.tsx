import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { GRID, boundsOf, computeBoxes, snap } from '../core/layout';
import type { SceneTheme } from '../core/theme';
import type { Diagram, Point, Positions } from '../core/types';
import { DiagramScene } from './DiagramScene';
import { FitIcon } from './Icons';

interface Props {
  diagram: Diagram;
  positions: Positions;
  theme: SceneTheme;
  onMove: (name: string, p: Point) => void;
}

interface View {
  x: number;
  y: number;
  k: number;
}

type Drag =
  | { type: 'box'; name: string; dx: number; dy: number }
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number };

const MIN_K = 0.2;
const MAX_K = 3;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function Canvas({ diagram, positions, theme, onMove }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const didFit = useRef(false);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);

  const boxes = useMemo(() => computeBoxes(diagram, positions), [diagram, positions]);

  /** Coordonnées écran → coordonnées « monde » (avant pan/zoom). */
  const toWorld = (clientX: number, clientY: number): Point => {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: (clientX - (r?.left ?? 0) - view.x) / view.k, y: (clientY - (r?.top ?? 0) - view.y) / view.k };
  };

  /** Ajuste le zoom/pan pour voir tout le diagramme. */
  const fit = useCallback(() => {
    const el = svgRef.current;
    const b = boundsOf(Object.values(boxes));
    if (!el || !b) {
      setView({ x: 0, y: 0, k: 1 });
      return;
    }
    const W = el.clientWidth;
    const H = el.clientHeight;
    const k = clamp(Math.min((W - 80) / b.w, (H - 80) / b.h), MIN_K, 1.25);
    setView({ k, x: (W - b.w * k) / 2 - b.x * k, y: (H - b.h * k) / 2 - b.y * k });
  }, [boxes]);

  // Cadrage automatique une seule fois, dès que le diagramme n'est plus vide.
  useEffect(() => {
    if (!didFit.current && Object.keys(boxes).length > 0) {
      didFit.current = true;
      fit();
    }
  }, [boxes, fit]);

  // Zoom à la molette centré sur le curseur. Listener natif non-passif pour bloquer le zoom de page (pinch trackpad).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView((v) => {
        const k = clamp(v.k * Math.exp(-e.deltaY * 0.0015), MIN_K, MAX_K);
        const ratio = k / v.k;
        return { k, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (factor: number) => {
    const el = svgRef.current;
    if (!el) return;
    const mx = el.clientWidth / 2;
    const my = el.clientHeight / 2;
    setView((v) => {
      const k = clamp(v.k * factor, MIN_K, MAX_K);
      const ratio = k / v.k;
      return { k, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
    });
  };

  const onBoxDown = (name: string, e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    const w = toWorld(e.clientX, e.clientY);
    const b = boxes[name];
    drag.current = { type: 'box', name, dx: w.x - b.x, dy: w.y - b.y };
    setSelected(name);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onBackgroundDown = (e: PointerEvent<SVGSVGElement>) => {
    setSelected(null);
    drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    setPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.type === 'pan') {
      setView((v) => ({ ...v, x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy) }));
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const x = w.x - d.dx;
    const y = w.y - d.dy;
    // Aimantation sur la grille ; Alt = déplacement libre au pixel près.
    onMove(d.name, e.altKey ? { x: Math.round(x), y: Math.round(y) } : { x: snap(x), y: snap(y) });
  };

  const endDrag = () => {
    drag.current = null;
    setPanning(false);
  };

  const gridSize = GRID * 4 * view.k;
  const isEmpty = diagram.classes.length === 0;

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: theme.bg }}>
      <svg
        ref={svgRef}
        className={`h-full w-full touch-none select-none ${panning ? 'cursor-grabbing' : 'cursor-default'}`}
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Grille de points : repère visuel de l'aimantation, suit pan et zoom */}
        <defs>
          <pattern id="xuml-grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
            <circle cx={1} cy={1} r={1} fill={theme.grid} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#xuml-grid)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <DiagramScene diagram={diagram} boxes={boxes} theme={theme} selected={selected} onBoxPointerDown={onBoxDown} />
        </g>
      </svg>

      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm" style={{ color: theme.muted }}>
          Écrivez <code className="mx-1 rounded bg-black/5 px-1.5 py-0.5 font-mono dark:bg-white/10">class MaClasse</code> pour commencer
        </div>
      )}

      {/* Contrôles de vue */}
      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/90 p-0.5 text-sm shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <button type="button" onClick={() => zoomBy(1 / 1.25)} title="Zoom arrière" className="h-7 w-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
          −
        </button>
        <span className="w-11 text-center text-xs tabular-nums text-slate-500 dark:text-slate-400">{Math.round(view.k * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.25)} title="Zoom avant" className="h-7 w-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
          +
        </button>
        <button type="button" onClick={fit} title="Ajuster à la fenêtre" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
          <FitIcon />
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3 hidden text-[11px] sm:block" style={{ color: theme.muted }}>
        Glisser : déplacer · Molette : zoom · Alt : sans aimantation
      </p>
    </div>
  );
}
