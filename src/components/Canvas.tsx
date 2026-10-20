import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { RelationChange, RelationRef } from '../core/edit';
import { changeForChoice, relationChoiceOf, targetPhrase, type RelationChoice, type Vocabulary } from '../core/vocabulary';
import { GRID, boundsOf, computeScene, legendBox, snap } from '../core/layout';
import type { SceneTheme } from '../core/theme';
import type { Diagram, DiagramType, Group, Point, Positions, Relation, RelationKind } from '../core/types';
import { DiagramScene } from './DiagramScene';
import { FitIcon } from './Icons';
import { RelationPicker } from './RelationPicker';
import { SelectionMenu } from './SelectionMenu';

interface Props {
  diagram: Diagram;
  positions: Positions;
  theme: SceneTheme;
  /** Nouvelles positions ; `first` = premier mouvement d'un glisser (ouvre une nouvelle étape d'annulation). */
  onMove: (moves: Record<string, Point>, first: boolean) => void;
  onRelationChange: (ref: RelationRef, change: RelationChange) => void;
  onRelationDelete: (ref: RelationRef) => void;
  onRelationAdd: (from: string, to: string, kind: RelationKind, label?: string) => void;
  /** Vocabulaire du diagramme affiché (types de relation proposés, consignes). */
  vocab: Vocabulary;
  /** Change à chaque import : le canevas recadre alors tout le diagramme. */
  fitKey?: number;
  /** Fin d'un glisser : l'application corrige un éventuel chevauchement. */
  onDrop?: (names: string[]) => void;
  /** Actions du menu de sélection multiple. */
  onDeleteNodes?: (names: string[]) => void;
  /** Duplique les éléments ; renvoie les noms des copies (qui deviennent la sélection). */
  onDuplicate?: (names: string[]) => string[];
  onColor?: (names: string[], color: string | null, label: string) => void;
  onCreatePackage?: (title: string, names: string[]) => void;
  /** Renommer un élément (double-clic) : nom d'une classe / d'un objet, libellé des autres. */
  onRenameElement?: (name: string, text: string) => void;
  /** Titre d'un groupe (paquetage, système, cadre) et dégroupement. */
  onRenameGroup?: (group: Group, title: string) => void;
  onUngroup?: (group: Group) => void;
  /** Consigne affichée sur un tableau vide (dépend du mode Code / Visuel). */
  emptyHint?: string;
  onTypeSelection?: (type: DiagramType, title: string, names: string[]) => void;
  /** Prévient l'application de la classe cliquée (null : clic dans le vide). */
  onSelectClass?: (name: string | null) => void;
  /** Élément sélectionné depuis le panneau Visuel (il est mis en évidence sur le diagramme). */
  selectedName?: string | null;
  /** Vue ciblée active sur cette classe : les autres sont estompées. */
  focus?: string | null;
}

interface View {
  x: number;
  y: number;
  k: number;
}

type Drag =
  | { type: 'move'; names: string[]; start: Point; orig: Record<string, Point>; moved: boolean }
  | { type: 'lasso'; start: Point; additive: boolean }
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
  | { phase: 'target'; from: string; origin: Point; choice: RelationChoice };

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
  vocab,
  onSelectClass,
  selectedName,
  onDrop,
  onDeleteNodes,
  onDuplicate,
  onColor,
  onCreatePackage,
  emptyHint,
  onRenameElement,
  onRenameGroup,
  onUngroup,
  onTypeSelection,
  fitKey = 0,
  focus,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const didFit = useRef(false);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  /** Groupe dont on a cliqué le titre : le menu propose alors Renommer / Dégrouper. */
  const [activeFrame, setActiveFrame] = useState<string | null>(null);
  /** Renommage en place (double-clic sur un élément ou sur le titre d'un groupe). */
  const [renaming, setRenaming] = useState<{ type: 'element'; name: string } | { type: 'group'; name: string } | null>(null);
  useEffect(() => {
    if (selectedName !== undefined) setSelected(selectedName);
  }, [selectedName]);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const [link, setLink] = useState<LinkState | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  /** Sélection multiple (Shift+clic, Shift+glisser, clic sur un cadre). */
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [lasso, setLasso] = useState<{ a: Point; b: Point } | null>(null);
  /** Glisser en cours (le menu de sélection se cache pendant le mouvement). */
  const [dragging, setDragging] = useState(false);

  const scene = useMemo(() => computeScene(diagram, positions), [diagram, positions]);
  const { boxes, edges, frames } = scene;
  // Un élément sélectionné qui disparaît du code sort de la sélection.
  const selected2 = useMemo(() => new Set([...selection].filter((n) => boxes[n])), [selection, boxes]);

  // Lien sélectionné (identifié par sa ligne source). S'il disparaît du texte, le panneau se ferme seul.
  const activeEdge = selectedEdge === null ? undefined : edges.find((e) => e.relation.line === selectedEdge);
  const activeRef: RelationRef | null = activeEdge
    ? { line: activeEdge.relation.line, from: activeEdge.relation.from, to: activeEdge.relation.to, auto: activeEdge.relation.auto, via: activeEdge.relation.via, kind: activeEdge.relation.kind }
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

  const createLink = (from: string, to: string, choice: RelationChoice) => {
    onRelationAdd(from, to, choice.kind, choice.stereotype);
    setLink(null);
  };

  const pickForNewLink = (choice: RelationChoice) => {
    if (link?.phase !== 'choose') return;
    if (link.to) createLink(link.from, link.to, choice);
    else {
      setLink({ phase: 'target', from: link.from, origin: link.origin, choice });
      setCursor(link.origin);
    }
  };

  const onHandleDown = (name: string, at: Point, e: React.PointerEvent<SVGGElement>) => {
    if (link?.phase === 'target') {
      createLink(link.from, name, link.choice);
      return;
    }
    setSelectedEdge(null);
    drag.current = { type: 'link', from: name, origin: at, moved: false };
    setLink({ phase: 'drag', from: name, origin: at });
    setCursor(at);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  // --- Raccourcis clavier (via ref : toujours la dernière version des états) ----------------

  const duplicate = (names: string[]) => {
    if (!onDuplicate || names.length === 0) return;
    const copies = onDuplicate(names);
    setSelected(null);
    setSelection(new Set(copies));
  };

  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return; // ne pas voler la frappe de l'éditeur
    // Ctrl+D : dupliquer la sélection (au lieu d'ajouter un favori dans le navigateur).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'd' && (selected2.size > 0 || selected)) {
      e.preventDefault();
      duplicate(selected2.size > 0 ? [...selected2] : selected ? [selected] : []);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const n = Number(e.key);
    const digit = Number.isInteger(n) && n >= 1 && n <= vocab.relations.length ? vocab.relations[n - 1] : null;

    if (e.key === 'Escape' && (link || activeRef || selected2.size > 0)) {
      setLink(null);
      setSelectedEdge(null);
      setSelection(new Set());
    } else if (!activeRef && !link && (e.key === 'Delete' || e.key === 'Backspace') && (selected2.size > 0 || selected)) {
      const names = selected2.size > 0 ? [...selected2] : selected ? [selected] : [];
      onDeleteNodes?.(names);
      setSelection(new Set());
      setSelected(null);
    } else if (link?.phase === 'choose' && digit) pickForNewLink(digit);
    else if (activeRef && digit) onRelationChange(activeRef, changeForChoice(digit, activeEdge?.relation.label));
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
    const content = [...Object.values(boxes), ...Object.values(frames)];
    const legend = legendBox(diagram, content);
    const b = boundsOf(legend ? [...content, legend] : content);
    if (!el || !b) {
      setView({ x: 0, y: 0, k: 1 });
      return;
    }
    const W = el.clientWidth;
    const H = el.clientHeight;
    const k = clamp(Math.min((W - 80) / b.w, (H - 80) / b.h), MIN_K, 1.25);
    setView({ k, x: (W - b.w * k) / 2 - b.x * k, y: (H - b.h * k) / 2 - b.y * k });
  }, [boxes, frames, diagram]);

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

  /** Démarre le déplacement d'un ou plusieurs éléments. */
  const startMove = (names: string[], e: React.PointerEvent) => {
    const orig: Record<string, Point> = {};
    for (const n of names) if (boxes[n]) orig[n] = { x: boxes[n].x, y: boxes[n].y };
    drag.current = { type: 'move', names: Object.keys(orig), start: toWorld(e.clientX, e.clientY), orig, moved: false };
    setDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onBoxDown = (name: string, e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    if (link?.phase === 'target') {
      createLink(link.from, name, link.choice);
      return;
    }
    setLink(null);
    setSelectedEdge(null);
    // Shift+clic : ajoute / retire l'élément de la sélection multiple.
    if (e.shiftKey) {
      setSelection((s) => {
        const next = new Set(s);
        if (selected && !next.size) next.add(selected);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
      setSelected(null);
      return;
    }
    // Clic sur un élément d'une sélection multiple : on déplace tout le groupe.
    if (selected2.has(name) && selected2.size > 1) {
      startMove([...selected2], e);
      return;
    }
    setSelection(new Set());
    setSelected(name);
    onSelectClass?.(name);
    startMove([name], e);
  };

  /** Clic sur le titre d'un cadre : sélectionne et déplace tous ses membres. */
  const onFrameDown = (group: Group, e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    setLink(null);
    setSelectedEdge(null);
    setSelected(null);
    const members = group.members.filter((m) => boxes[m]);
    setSelection(new Set(members));
    setActiveFrame(group.name);
    startMove(members, e);
  };

  const onBackgroundDown = (e: PointerEvent<SVGSVGElement>) => {
    setSelected(null);
    onSelectClass?.(null);
    setSelectedEdge(null);
    if (link) {
      setLink(null); // un clic dans le vide annule la création de lien
      if (link.phase === 'target') return;
    }
    // Shift+glisser dans le vide : rectangle de sélection.
    if (e.shiftKey) {
      const w = toWorld(e.clientX, e.clientY);
      drag.current = { type: 'lasso', start: w, additive: true };
      setLasso({ a: w, b: w });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    setSelection(new Set());
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
    if (d.type === 'lasso') {
      setLasso({ a: d.start, b: w });
      return;
    }
    // Déplacement : même décalage pour tous les éléments ; aimantation sur la grille (Alt = libre).
    const dx = w.x - d.start.x;
    const dy = w.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) * view.k < 2) return;
    const moves: Record<string, Point> = {};
    for (const n of d.names) {
      const x = d.orig[n].x + dx;
      const y = d.orig[n].y + dy;
      moves[n] = e.altKey ? { x: Math.round(x), y: Math.round(y) } : { x: snap(x), y: snap(y) };
    }
    onMove(moves, !d.moved);
    d.moved = true;
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d?.type === 'move' && d.moved) onDrop?.(d.names);
    if (d?.type === 'lasso' && lasso) {
      const x0 = Math.min(lasso.a.x, lasso.b.x);
      const x1 = Math.max(lasso.a.x, lasso.b.x);
      const y0 = Math.min(lasso.a.y, lasso.b.y);
      const y1 = Math.max(lasso.a.y, lasso.b.y);
      const hit = Object.entries(boxes)
        .filter(([, b]) => b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0)
        .map(([n]) => n);
      setSelection((s) => new Set([...(d.additive ? s : []), ...hit]));
      setLasso(null);
    }
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
    setDragging(false);
    setPanning(false);
  };

  const onPointerCancel = () => {
    if (drag.current?.type === 'link') setLink(null);
    setLasso(null);
    setDragging(false);
    drag.current = null;
    setPanning(false);
  };

  /** Double-clic : renommer l'élément ou le groupe visé, directement sur le diagramme. */
  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // Par coordonnées : pendant un glisser, le pointeur est capturé par le canevas (la cible n'est pas l'élément).
    const w = toWorld(e.clientX, e.clientY);
    const name = boxAt(w);
    if (name && onRenameElement) {
      setRenaming({ type: 'element', name });
      return;
    }
    if (!onRenameGroup) return;
    // Groupe : le plus petit cadre qui contient le point (un cadre imbriqué l'emporte sur son parent).
    const hit = (diagram.groups ?? [])
      .filter((g) => {
        const r = frames[g.name];
        return r && w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h;
      })
      .sort((a, b) => frames[a.name].w * frames[a.name].h - frames[b.name].w * frames[b.name].h)[0];
    if (hit) setRenaming({ type: 'group', name: hit.name });
  };

  // Le menu « groupe » ne vaut que tant que la sélection est exactement celle du groupe cliqué.
  const frameGroup = (() => {
    if (!activeFrame) return null;
    const g = diagram.groups?.find((x) => x.name === activeFrame);
    if (!g) return null;
    const members = g.members.filter((m) => boxes[m]);
    return members.length === selected2.size && members.every((m) => selected2.has(m)) ? g : null;
  })();

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

  const targetLabel = link?.phase === 'target' ? link.choice.label : null;
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
        onDoubleClick={onDoubleClick}
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
            frames={frames}
            selection={selected2}
            onFramePointerDown={onFrameDown}
            onBoxPointerDown={onBoxDown}
            onEdgePointerDown={onEdgeDown}
            onHandlePointerDown={onHandleDown}
          />
          {lasso && (
            <rect
              x={Math.min(lasso.a.x, lasso.b.x)}
              y={Math.min(lasso.a.y, lasso.b.y)}
              width={Math.abs(lasso.b.x - lasso.a.x)}
              height={Math.abs(lasso.b.y - lasso.a.y)}
              fill={theme.accent}
              fillOpacity={0.08}
              stroke={theme.accent}
              strokeWidth={1 / view.k}
              strokeDasharray={`${4 / view.k} ${3 / view.k}`}
              pointerEvents="none"
              data-lasso=""
            />
          )}
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
          choices={vocab.relations}
          current={relationChoiceOf(vocab, activeEdge.relation)}
          onPick={(choice) => onRelationChange(activeRef, changeForChoice(choice, activeEdge.relation.label))}
          onReverse={() => onRelationChange(activeRef, { reverse: true })}
          onDelete={
            activeRef.via === 'member'
              ? undefined
              : () => {
                  onRelationDelete(activeRef);
                  setSelectedEdge(null);
                }
          }
          onClose={() => setSelectedEdge(null)}
        />
      )}

      {/* Renommage en place (double-clic) */}
      {renaming &&
        (() => {
          const isEl = renaming.type === 'element';
          const node = isEl ? diagram.classes.find((c) => c.name === renaming.name) : undefined;
          const group = !isEl ? diagram.groups?.find((g) => g.name === renaming.name) : undefined;
          const r = isEl ? boxes[renaming.name] : group ? frames[group.name] : undefined;
          if ((!node && !group) || !r) return null;
          const p = toScreen({ x: r.x, y: r.y });
          const keepsId = node && ((node.kind ?? 'class') === 'class' || node.kind === 'object');
          const value = node ? (keepsId ? node.name : (node.label ?? node.name)) : (group?.title ?? '');
          const close = () => setRenaming(null);
          return (
            <input
              key={`${renaming.type}-${renaming.name}`}
              autoFocus
              defaultValue={value}
              aria-label={node ? 'Nouveau nom' : 'Nouveau titre du groupe'}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                if (v && v !== value) {
                  if (node) onRenameElement?.(node.name, v);
                  else if (group) onRenameGroup?.(group, v);
                }
                close();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  e.currentTarget.value = value;
                  e.currentTarget.blur();
                }
              }}
              className="absolute z-30 h-8 rounded-md border-2 border-indigo-500 bg-white px-2 text-center font-mono text-sm font-semibold text-slate-900 shadow-lg focus:outline-none dark:bg-slate-900 dark:text-white"
              style={{ left: p.x, top: p.y + (node ? 4 : -4), width: Math.max(160, r.w * view.k) }}
            />
          );
        })()}

      {/* Menu : actions sur une sélection multiple */}
      {selected2.size > 0 && !lasso && !link && !dragging && (() => {
        const b = frameGroup && frames[frameGroup.name] ? frames[frameGroup.name] : boundsOf([...selected2].map((n) => boxes[n]));
        if (!b) return null;
        const top = toScreen({ x: b.x + b.w / 2, y: b.y });
        const bottom = toScreen({ x: b.x, y: b.y + b.h });
        const names = [...selected2];
        // Au-dessus de la sélection (sans jamais la masquer) ; en dessous s'il n'y a pas la place.
        // Ancré par le bas (il grandit vers le haut, quelle que soit l'étape) : il ne masque jamais la sélection.
        const above = top.y - 12 >= 140;
        return (
          <SelectionMenu
            key={`${frameGroup?.name ?? ''}|${names.join('|')}`}
            frame={frameGroup ? { title: frameGroup.title, kind: frameGroup.kind } : undefined}
            onRenameFrame={frameGroup && onRenameGroup ? (title) => onRenameGroup(frameGroup, title) : undefined}
            onUngroup={
              frameGroup && onUngroup
                ? () => {
                    onUngroup(frameGroup);
                    setActiveFrame(null);
                  }
                : undefined
            }
            x={top.x}
            boundsW={bounds.w}
            y={above ? top.y - 12 : Math.min(bottom.y + 12, bounds.h - 60)}
            above={above}
            names={names}
            onPackage={(title) => {
              onCreatePackage?.(title, names);
              setSelection(new Set());
            }}
            onType={(type, title) => {
              onTypeSelection?.(type, title, names);
              setSelection(new Set());
            }}
            onDuplicate={() => duplicate(names)}
            groupAction={vocab.group.action}
            groupPlaceholder={vocab.group.placeholder}
            legend={diagram.style?.legend ?? []}
            colors={diagram.style?.colors ?? {}}
            currentColor={(() => {
              const cs = new Set(names.map((n) => diagram.style?.colors[n]));
              return cs.size === 1 ? [...cs][0] : undefined;
            })()}
            // La sélection reste active : on peut essayer une autre couleur, l'aperçu est immédiat.
            onColor={(color, label) => onColor?.(names, color, label)}
            onDelete={() => {
              onDeleteNodes?.(names);
              setSelection(new Set());
            }}
            onClear={() => setSelection(new Set())}
          />
        );
      })()}

      {/* Menu : création d'un lien depuis une poignée */}
      {link?.phase === 'choose' && (
        <RelationPicker {...toScreen(link.at)} bounds={bounds} from={link.from} to={link.to} choices={vocab.relations} onPick={pickForNewLink} onClose={() => setLink(null)} />
      )}

      {link?.phase === 'target' && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1.5 text-xs text-white shadow-md">
          {targetLabel} depuis <span className="font-mono">{link.from}</span> : cliquez sur {targetPhrase(vocab)} · Échap pour annuler
        </div>
      )}

      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm" style={{ color: theme.muted }}>
          {emptyHint ?? (
            <>
              Écrivez <code className="mx-1 rounded bg-black/5 px-1.5 py-0.5 font-mono dark:bg-white/10">class MaClasse</code> pour commencer
            </>
          )}
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
        Glisser : déplacer · Shift+clic ou Shift+glisser : sélection multiple · Poignée ◦ : nouvelle relation · Ctrl+Z : annuler
      </p>
    </div>
  );
}
