import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  FONT_FAMILY,
  FONT_SIZE,
  ROW_H,
  compartmentHeight,
  computeEdges,
  headerHeight,
  memberLabel,
  splitMembers,
} from '../core/layout';
import type { SceneTheme } from '../core/theme';
import type { ClassNode, Diagram, Point, Rect, Relation, RelationKind } from '../core/types';

/*
 * Moteur de rendu SVG pur : aucune dépendance au DOM ni à l'état.
 * Utilisé à la fois par le canevas interactif ET par l'export (renderToStaticMarkup),
 * ce qui garantit que le fichier exporté est identique à ce que l'utilisateur voit.
 */

interface Props {
  diagram: Diagram;
  boxes: Record<string, Rect>;
  theme: SceneTheme;
  selected?: string | null;
  /** Ligne source de la relation sélectionnée (identifiant stable d'un lien). */
  selectedEdge?: number | null;
  onBoxPointerDown?: (name: string, e: ReactPointerEvent<SVGGElement>) => void;
  onEdgePointerDown?: (relation: Relation, e: ReactPointerEvent<SVGGElement>) => void;
  /** Vue ciblée : la classe et ses voisines restent nettes, le reste est estompé. */
  focus?: string | null;
  /** Classe mise en évidence comme cible pendant la création d'un lien. */
  highlighted?: string | null;
  /** Poignée de connexion (milieu d'un côté) : point de départ d'un nouveau lien, en coordonnées monde. */
  onHandlePointerDown?: (name: string, at: Point, e: ReactPointerEvent<SVGGElement>) => void;
}

const DASHED: RelationKind[] = ['realization', 'dependency'];

function markerFor(kind: RelationKind): { start?: string; end?: string } {
  switch (kind) {
    case 'inheritance':
    case 'realization':
      return { end: 'url(#xuml-triangle)' };
    case 'directed':
    case 'dependency':
      return { end: 'url(#xuml-arrow)' };
    case 'composition':
      return { start: 'url(#xuml-diamond-filled)' };
    case 'aggregation':
      return { start: 'url(#xuml-diamond-open)' };
    default:
      return {};
  }
}

function ClassBox({
  node,
  rect,
  theme,
  selected,
  highlighted,
  onPointerDown,
  onHandlePointerDown,
}: {
  node: ClassNode;
  rect: Rect;
  theme: SceneTheme;
  selected: boolean;
  highlighted: boolean;
  onPointerDown?: (e: ReactPointerEvent<SVGGElement>) => void;
  onHandlePointerDown?: (at: Point, e: ReactPointerEvent<SVGGElement>) => void;
}) {
  const { attrs, methods } = splitMembers(node);
  const headH = headerHeight(node);
  const attrsH = compartmentHeight(attrs.length);
  const { w, h } = rect;
  const r = 6;
  const text = { fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, fill: theme.text } as const;
  const active = selected || highlighted;
  const stroke = active ? theme.accent : theme.boxStroke;
  // Milieu des 4 côtés (coordonnées locales à la boîte).
  const handles: Point[] = [
    { x: w / 2, y: 0 },
    { x: w, y: h / 2 },
    { x: w / 2, y: h },
    { x: 0, y: h / 2 },
  ];

  const renderRows = (members: typeof attrs, top: number) =>
    members.map((m, i) => (
      <text key={i} x={14} y={top + 6 + i * ROW_H + 14} {...text}>
        {memberLabel(m)}
      </text>
    ));

  return (
    <g
      transform={`translate(${rect.x} ${rect.y})`}
      onPointerDown={onPointerDown}
      style={{ cursor: onPointerDown ? 'grab' : undefined }}
      data-class={node.name}
      className="group"
    >
      {/* Corps + ombre portée légère pour détacher la boîte du fond */}
      <rect width={w} height={h} rx={r} fill={theme.boxFill} stroke={stroke} strokeWidth={active ? 2 : 1.2} />
      {/* En-tête aux coins supérieurs arrondis */}
      <path
        d={`M 0 ${headH} L 0 ${r} Q 0 0 ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${headH} Z`}
        fill={theme.headerFill}
      />
      <line x1={0} y1={headH} x2={w} y2={headH} stroke={stroke} strokeWidth={1} />
      <line x1={0} y1={headH + attrsH} x2={w} y2={headH + attrsH} stroke={stroke} strokeWidth={1} />

      {node.stereotype && (
        <text x={w / 2} y={16} textAnchor="middle" {...text} fill={theme.muted} fontSize={11}>
          {`«${node.stereotype}»`}
        </text>
      )}
      <text
        x={w / 2}
        y={node.stereotype ? 36 : 22}
        textAnchor="middle"
        {...text}
        fontSize={13}
        fontWeight={700}
        fontStyle={node.stereotype === 'abstract' || node.stereotype === 'interface' ? 'italic' : 'normal'}
      >
        {node.name}
      </text>

      {renderRows(attrs, headH)}
      {renderRows(methods, headH + attrsH)}

      {/* Poignées de connexion : visibles au survol (ou si la boîte est sélectionnée, pour le tactile).
          Absentes de l'export SVG puisqu'aucun gestionnaire n'y est passé. */}
      {onHandlePointerDown &&
        handles.map((p, i) => (
          <g
            key={i}
            data-handle={i}
            className={`transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            style={{ cursor: 'crosshair' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onHandlePointerDown({ x: rect.x + p.x, y: rect.y + p.y }, e);
            }}
          >
            <circle cx={p.x} cy={p.y} r={11} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={5} fill={theme.boxFill} stroke={theme.accent} strokeWidth={1.6} />
          </g>
        ))}
    </g>
  );
}

export function DiagramScene({
  diagram,
  boxes,
  theme,
  selected,
  selectedEdge,
  highlighted,
  focus,
  onBoxPointerDown,
  onEdgePointerDown,
  onHandlePointerDown,
}: Props) {
  const edges = computeEdges(diagram.relations, boxes);
  const focusOn = focus && boxes[focus] ? focus : null;
  const neighbours = new Set<string>();
  if (focusOn) {
    neighbours.add(focusOn);
    for (const r of diagram.relations) {
      if (r.from === focusOn) neighbours.add(r.to);
      if (r.to === focusOn) neighbours.add(r.from);
    }
  }
  const DIM = 0.28;

  return (
    <>
      <defs>
        <marker id="xuml-triangle" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M 1 1 L 13 7 L 1 13 Z" fill={theme.bg} stroke={theme.edge} strokeWidth={1.4} strokeLinejoin="round" />
        </marker>
        <marker id="xuml-arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M 1 1 L 11 6 L 1 11" fill="none" stroke={theme.edge} strokeWidth={1.4} strokeLinejoin="round" />
        </marker>
        <marker id="xuml-diamond-open" viewBox="0 0 18 12" refX="1" refY="6" markerWidth="18" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M 1 6 L 9 1 L 17 6 L 9 11 Z" fill={theme.bg} stroke={theme.edge} strokeWidth={1.4} strokeLinejoin="round" />
        </marker>
        <marker id="xuml-diamond-filled" viewBox="0 0 18 12" refX="1" refY="6" markerWidth="18" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M 1 6 L 9 1 L 17 6 L 9 11 Z" fill={theme.edge} stroke={theme.edge} strokeWidth={1.4} strokeLinejoin="round" />
        </marker>
      </defs>

      {/* Liens sous les boîtes : une boîte déplacée masque proprement les traits qui passent derrière */}
      <g fill="none" stroke={theme.edge} strokeWidth={1.4}>
        {edges.map(({ relation, d, label }, i) => {
          const m = markerFor(relation.kind);
          const isSelected = selectedEdge === relation.line;
          return (
            <g
              key={i}
              onPointerDown={onEdgePointerDown ? (e) => onEdgePointerDown(relation, e) : undefined}
              style={{ cursor: onEdgePointerDown ? 'pointer' : undefined }}
              data-relation={relation.line}
              opacity={focusOn && relation.from !== focusOn && relation.to !== focusOn ? DIM : undefined}
            >
              {/* Zone de clic invisible de 14 px : un trait de 1,4 px est presque impossible à viser */}
              {onEdgePointerDown && <path d={d} stroke="transparent" strokeWidth={14} pointerEvents="stroke" />}
              {isSelected && <path d={d} stroke={theme.accent} strokeOpacity={0.25} strokeWidth={8} strokeLinecap="round" />}
              <path
                d={d}
                stroke={isSelected ? theme.accent : undefined}
                strokeWidth={isSelected ? 2 : undefined}
                strokeDasharray={DASHED.includes(relation.kind) ? '6 4' : undefined}
                markerStart={m.start}
                markerEnd={m.end}
              />
              {relation.label && (
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  fill={theme.muted}
                  stroke={theme.bg}
                  strokeWidth={4}
                  paintOrder="stroke"
                  fontFamily={FONT_FAMILY}
                  fontSize={11}
                >
                  {relation.label}
                </text>
              )}
            </g>
          );
        })}
      </g>

      <g>
        {diagram.classes.map((c) => {
          const rect = boxes[c.name];
          if (!rect) return null;
          return (
            <g key={c.name} opacity={focusOn && !neighbours.has(c.name) ? DIM : undefined} style={{ transition: 'opacity 150ms' }}>
            <ClassBox
              node={c}
              rect={rect}
              theme={theme}
              selected={selected === c.name}
              highlighted={highlighted === c.name}
              onPointerDown={onBoxPointerDown ? (e) => onBoxPointerDown(c.name, e) : undefined}
              onHandlePointerDown={onHandlePointerDown ? (at, e) => onHandlePointerDown(c.name, at, e) : undefined}
            />
            </g>
          );
        })}
      </g>
    </>
  );
}
