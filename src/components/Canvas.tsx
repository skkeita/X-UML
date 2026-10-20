import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { RELATION_CHOICES, type RelationChange, type RelationRef } from '../core/edit';
import { GRID, boundsOf, computeBoxes, computeEdges, snap } from '../core/layout';
import type { SceneTheme } from '../core/theme';
import type { Diagram, Point, Positions, Relation, RelationKind } from '../core/types';
import { DiagramScene } from './DiagramScene';
import { FitIcon } from './Icons';
import { RelationPicker } from './RelationPicker';

interface Props {
  diagram: Diagram;
  positions: Positions;
  theme: SceneTheme;
  /** `first` = premier mouvement d'un glisser (ouvre une nouvelle étape d'annulation). */
  onMove: (name: string, p: Point, first: boolean) => void;
  onRelationChange: (ref: RelationRef, change: RelationChange) => void;
  onRelationDelete: (ref: RelationRef) => void;
  onRelationAdd: (from: string, to: string, kind: RelationKind) => void;
  /** Change à chaque import : le canevas recadre alors tout le diagramme. */
  fitKey?: number;
  /** Fin d'un glisser de classe : l'application corrige un éventuel chevauchement. */
  onDrop?: (name: string) => void;
  /** Prévient l'application de la classe cliquée (null : clic dans le vide). */
  onSelectClass?: (name: string | null) => void;
  /** Vue ciblée active sur cette classe : les autres sont estompées. */
  focus?: string | null;
}

interface View {
  x: number;
  y: number;
  k: number;
}

type Drag =
  | { type: 'box'; name: string; dx: number; dy: number; moved: boolean }
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { type: 'link'; from: string; origin: Point; moved: boolean };

/**
 * Création d'un lien depuis une poignée :
 *  - 'drag'   : l'utilisateur tire un trait depuis la poignée ;
 *  - 'choose' : menu des flèches (cible connue si le trait a été lâché sur une classe) ;
 *  - 'target' : flèche choisie, on attend un clic sur la classe cible.
 */
type LinkState =
  | { phase: 'drag'; from: string; origin: Point }
  | { phase: 'choose'; from: string; to: string | null; origin: Point; at: Point }
  | { phase: 'target'; from: string; origin: Point; kind: RelationKind };

const MIN_K = 0.2;
const MAX_K = 3;
const DRAG_THRESHOLD_PX = 4;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function Canvas({
  diagram,
  positions,
  theme,
  onMove,
  onRelationChange,
  onRelationDelete,
  onRelationAdd,
  onSelectClass,
  onDrop,
  fitKey = 0,
  focus,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const didFit = useRef(false);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const [link, setLink] = useState<LinkState | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);

  const boxes = useMemo(() => computeBoxes(diagram, positions), [diagram, positions]);
  const edges = useMemo(() => computeEdges(diagram.relations, boxes), [diagram, boxes]);

  // Lien sélectionné (identifié par sa ligne source). S'il disparaît du texte, le panneau se ferme seul.
  const activeEdge = selectedEdge === null ? undefined : edges.find((e) => e.relation.line === selectedEdge);
  const activeRef: RelationRef | null = activeEdge
    ? { line: activeEdge.relation.line, from: activeEdge.relation.from, to: activeEdge.relation.to, auto: activeEdge.relation.auto }
    : null;

  /** Classe sous un point (monde), la plus haute d'abord. */
  const boxAt = (p: Point): string | null => {
    for (let i = diagram.classes.length - 1; i >= 0; i--) {
      const name = diagram.classes[i].name;
      const b = boxes[name];
      if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return name;
    }
    return null;
  };

  /** Coordonnées écran → coordonnées « monde » (avant pan/zoom). */
  const toWorld = (clientX: number, clientY: number): Point => {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: (clientX - (r?.left ?? 0) - view.x) / view.k, y: (clientY - (r?.top ?? 0) - view.y) / view.k };
  };
  const toScreen = (p: Point): Point => ({ x: p.x * view.k + view.x, y: p.y * view.k + view.y });

  // --- Création de lien -----------------------------------------------------------------

  const createLink = (from: string, to: string, kind: RelationKind) => {
    onRelationAdd(from, to, kind);
    setLink(null);
  };

  const pickForNewLink = (kind: RelationKind) => {
    if (link?.phase !== 'choose') return;
    if (link.to) createLink(link.from, link.to, kind);
    else {
      setLink({ phase: 'target', from: link.from, origin: link.origin, kind });
      setCursor(link.origin);
    }
  };

  const onHandleDown = (name: string, at: Point, e: React.PointerEvent<SVGGElement>) => {
    if (link?.phase === 'target') {
      createLink(link.from, name, link.kind);
      return;
    }
    setSelectedEdge(null);
    drag.current = { type: 'link', from: name, origin: at, moved: false };
    setLink({ phase: 'drag', from: name, origin: at });
    setCursor(at);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  // --- Raccourcis clavier (via ref : toujours la dernière version des états) ----------------

  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return; // ne pas voler la frappe de l'éditeur
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const n = Number(e.key);
    const digit = Number.isInteger(n) && n >= 1 && n <= RELATION_CHOICES.length ? RELATION_CHOICES[n - 1].kind : null;

    if (e.key === 'Escape' && (link || activeRef)) {
      setLink(null);
      setSelectedEdge(null);
    } else if (link?.phase === 'choose' && digit) pickForNewLink(digit);
    else if (activeRef && digit) onRelationChange(activeRef, { kind: digit });
    else if (activeRef && (e.key === 'r' || e.key === 'R')) onRelationChange(activeRef, { reverse: true });
    else if (activeRef && (e.key === 'Delete' || e.key === 'Backspace')) {
      onRelationDelete(activeRef);
      setSelectedEdge(null);
    } else return;
    e.preventDefault();
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  // --- Vue : cadrage, zoom ------------------------------------------------------------------

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

  // Recadrage après un import (le nouveau diagramme arrive après l'anti-rebond du parseur).
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    if (fitKey === 0) return;
    const t = window.setTimeout(() => fitRef.current(), 350);
    return () => window.clearTimeout(t);
  }, [fitKey]);

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

  // --- Pointeur -------------------------------------------------------------------------------

  const onEdgeDown = (relation: Relation, e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    setLink(null);
    setSelected(null);
    setSelectedEdge(relation.line);
  };

  const onBoxDown = (name: string, e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    if (link?.phase === 'target') {
      createLink(link.from, name, link.kind);
      return;
    }
    setLink(null);
    const w = toWorld(e.clientX, e.clientY);
    const b = boxes[name];
    drag.current = { type: 'box', name, dx: w.x - b.x, dy: w.y - b.y, moved: false };
    setSelected(name);
    onSelectClass?.(name);
    setSelectedEdge(null);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onBackgroundDown = (e: PointerEvent<SVGSVGElement>) => {
    setSelected(null);
    onSelectClass?.(null);
    setSelectedEdge(null);
    if (link) {
      setLink(null); // un clic dans le vide annule la création de lien
      if (link.phase === 'target') return;
    }
    drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    setPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const w = toWorld(e.clientX, e.clientY);
    if (link?.phase === 'target') setCursor(w);

    const d = drag.current;
    if (!d) return;
    if (d.type === 'pan') {
      setView((v) => ({ ...v, x: d.vx + (e.clientX - d.sx), y: d.vy + (e.clientY - d.sy) }));
      return;
    }
    if (d.type === 'link') {
      if (Math.hypot(w.x - d.origin.x, w.y - d.origin.y) * view.k > DRAG_THRESHOLD_PX) d.moved = true;
      setCursor(w);
      return;
    }
    const x = w.x - d.dx;
    const y = w.y - d.dy;
    // Aimantation sur la grille ; Alt = déplacement libre au pixel près.
    onMove(d.name, e.altKey ? { x: Math.round(x), y: Math.round(y) } : { x: snap(x), y: snap(y) }, !d.moved);
    d.moved = true;
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d?.type === 'box' && d.moved) onDrop?.(d.name);
    if (d?.type === 'link') {
      const w = toWorld(e.clientX, e.clientY);
      if (d.moved) {
        // Trait lâché sur une autre classe → on propose directement les flèches.
        const target = boxAt(w);
        setLink(target && target !== d.from ? { phase: 'choose', from: d.from, to: target, origin: d.origin, at: w } : null);
      } else {
        // Simple clic sur la poignée → on propose les flèches, la cible sera cliquée ensuite.
        setLink({ phase: 'choose', from: d.from, to: null, origin: d.origin, at: d.origin });
      }
    }
    drag.current = null;
    setPanning(false);
  };

  const onPointerCancel = () => {
    if (drag.current?.type === 'link') setLink(null);
    drag.current = null;
    setPanning(false);
  };

  // --- Rendu ------------------------------------------------------------------------------------

  // Trait « élastique » + classe visée mise en évidence.
  const rubber =
    link?.phase === 'drag' || link?.phase === 'target'
      ? cursor && { from: link.origin, to: cursor }
      : link?.phase === 'choose' && link.to
        ? { from: link.origin, to: link.at }
        : null;
  const hovered = link && link.phase !== 'choose' && cursor ? boxAt(cursor) : null;
  const highlighted =
    link?.phase === 'choose' ? link.to : link?.phase === 'drag' ? (hovered !== link.from ? hovered : null) : hovered;

  const targetLabel = link?.phase === 'target' ? RELATION_CHOICES.find((c) => c.kind === link.kind)?.label : null;
  const bounds = { w: svgRef.current?.clientWidth ?? 800, h: svgRef.current?.clientHeight ?? 600 };
  const gridSize = GRID * 4 * view.k;
  const isEmpty = diagram.classes.length === 0;
  const cursorClass = link?.phase === 'target' || link?.phase === 'drag' ? 'cursor-crosshair' : panning ? 'cursor-grabbing' : 'cursor-default';

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: theme.bg }}>
      <svg
        ref={svgRef}
        className={`h-full w-full touch-none select-none ${cursorClass}`}
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* Grille de points : repère visuel de l'aimantation, suit pan et zoom */}
        <defs>
          <pattern id="xuml-grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
            <circle cx={1} cy={1} r={1} fill={theme.grid} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#xuml-grid)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <DiagramScene
            diagram={diagram}
            boxes={boxes}
            theme={theme}
            selected={selected}
            selectedEdge={selectedEdge}
            highlighted={highlighted}
            focus={focus}
            edges={edges}
            onBoxPointerDown={onBoxDown}
            onEdgePointerDown={onEdgeDown}
            onHandlePointerDown={onHandleDown}
          />
          {rubber && (
            <g pointerEvents="none">
              <line
                x1={rubber.from.x}
                y1={rubber.from.y}
                x2={rubber.to.x}
                y2={rubber.to.y}
                stroke={theme.accent}
                strokeWidth={1.6 / view.k}
                strokeDasharray={`${6 / view.k} ${4 / view.k}`}
              />
              <circle cx={rubber.to.x} cy={rubber.to.y} r={4 / view.k} fill={theme.accent} />
            </g>
          )}
        </g>
      </svg>

      {/* Menu : édition d'un lien existant */}
      {activeEdge && activeRef && !link && (
        <RelationPicker
          {...toScreen(activeEdge.label)}
          bounds={bounds}
          from={activeRef.from}
          to={activeRef.to}
          current={activeEdge.relation.kind}
          onPick={(kind) => onRelationChange(activeRef, { kind })}
          onReverse={() => onRelationChange(activeRef, { reverse: true })}
          onDelete={() => {
            onRelationDelete(activeRef);
            setSelectedEdge(null);
          }}
          onClose={() => setSelectedEdge(null)}
        />
      )}

      {/* Menu : création d'un lien depuis une poignée */}
      {link?.phase === 'choose' && (
        <RelationPicker {...toScreen(link.at)} bounds={bounds} from={link.from} to={link.to} onPick={pickForNewLink} onClose={() => setLink(null)} />
      )}

      {link?.phase === 'target' && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1.5 text-xs text-white shadow-md">
          {targetLabel} depuis <span className="font-mono">{link.from}</span> : cliquez sur la classe cible · Échap pour annuler
        </div>
      )}

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

      <p className="pointer-events-none absolute bottom-3 left-3 hidden text-[11px] lg:block" style={{ color: theme.muted }}>
        Glisser : déplacer · Poignée ◦ d’une classe : nouveau lien · Clic sur un lien : changer la flèche · Ctrl+Z : annuler
      </p>
    </div>
  );
}
