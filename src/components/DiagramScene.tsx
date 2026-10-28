import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  FONT_FAMILY,
  FONT_SIZE,
  LEGEND_ROW,
  type LegendBox,
  ROW_H,
  compartmentHeight,
  computeEdges,
  displayName,
  type EdgeGeometry,
  headerHeight,
  legendBox,
  memberLabel,
  splitMembers,
} from '../core/layout';
import { multPosition } from '../core/routing';
import { tinted, type SceneTheme } from '../core/theme';
import type { ClassNode, Diagram, DiagramType, Group, Point, Rect, Relation, RelationKind } from '../core/types';

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
  /** Relations sélectionnées ensemble (Shift+clic), repérées par leur ligne. */
  selectedEdges?: Set<number>;
  onBoxPointerDown?: (name: string, e: ReactPointerEvent<SVGGElement>) => void;
  onEdgePointerDown?: (relation: Relation, e: ReactPointerEvent<SVGGElement>) => void;
  /** Géométrie déjà calculée par l'appelant (le routage est coûteux : on évite de le refaire). */
  edges?: EdgeGeometry[];
  /** Vue ciblée : la classe et ses voisines restent nettes, le reste est estompé. */
  focus?: string | null;
  /** Classe mise en évidence comme cible pendant la création d'un lien. */
  highlighted?: string | null;
  /** Poignée de connexion (milieu d'un côté) : point de départ d'un nouveau lien, en coordonnées monde. */
  onHandlePointerDown?: (name: string, at: Point, e: ReactPointerEvent<SVGGElement>) => void;
  /** Rectangles des groupes (packages, frontières de système, cadres de diagramme). */
  frames?: Record<string, Rect>;
  /** Sélection multiple (Shift+clic / rectangle de sélection). */
  selection?: Set<string>;
  /** Saisie d'un cadre par son titre : déplace tout le groupe. */
  onFramePointerDown?: (group: Group, e: ReactPointerEvent<SVGGElement>) => void;
}

/** Étiquette UML d'un cadre de diagramme typé (coin supérieur gauche). */
const FRAME_TAG: Record<DiagramType, string> = {
  class: 'class',
  usecase: 'uc',
  context: 'ctx',
  package: 'pkg',
  communication: 'com',
};

/** « <<include>> » s'affiche « «include» ». */
const pretty = (s: string) => s.replace(/<<\s*(.+?)\s*>>/g, '«$1»');

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
  const r = 6 * (theme.corner ?? 1);
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

  const name = displayName(node);
  const sw = active ? 2 : 1.2;
  const kind = node.kind ?? 'class';

  const shape = (() => {
    switch (kind) {
      case 'actor': {
        const cx = w / 2;
        return (
          <>
            {/* Zone de saisie invisible : tout le rectangle de l'acteur, nom compris */}
            <rect width={w} height={h} fill="transparent" />
            <g fill="none" stroke={stroke} strokeWidth={active ? 2.2 : 1.6} strokeLinecap="round">
              <circle cx={cx} cy={12} r={9} fill={theme.boxFill} />
              <path d={`M ${cx} 21 V 50 M ${cx - 18} 30 H ${cx + 18} M ${cx} 50 L ${cx - 14} 70 M ${cx} 50 L ${cx + 14} 70`} />
            </g>
            <text x={cx} y={88} textAnchor="middle" {...text} fontSize={12} fontWeight={600} data-shape="actor">
              {name}
            </text>
          </>
        );
      }
      case 'usecase':
        return (
          <>
            <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={theme.boxFill} stroke={stroke} strokeWidth={sw} data-shape="usecase" />
            <text x={w / 2} y={h / 2 + 4} textAnchor="middle" {...text} fontSize={12.5}>
              {name}
            </text>
          </>
        );
      case 'object':
        return (
          <>
            <rect width={w} height={h} rx={3 * (theme.corner ?? 1)} fill={theme.boxFill} stroke={stroke} strokeWidth={sw} data-shape="object" />
            <text x={w / 2} y={h / 2 + 4} textAnchor="middle" {...text} fontSize={12.5} fontWeight={600} textDecoration="underline">
              {name}
            </text>
          </>
        );
      case 'system':
        return (
          <>
            <rect width={w} height={h} rx={4 * (theme.corner ?? 1)} fill={theme.headerFill} stroke={stroke} strokeWidth={active ? 2.4 : 1.8} data-shape="system" />
            <text x={w / 2} y={26} textAnchor="middle" {...text} fill={theme.muted} fontSize={11}>
              «système»
            </text>
            <text x={w / 2} y={50} textAnchor="middle" {...text} fontSize={14} fontWeight={700}>
              {name}
            </text>
          </>
        );
      case 'package': {
        const tabW = Math.min(w * 0.45, 90);
        return (
          <>
            <path d={`M 0 16 V 2 Q 0 0 2 0 H ${tabW - 2} Q ${tabW} 0 ${tabW} 2 V 16`} fill={theme.headerFill} stroke={stroke} strokeWidth={sw} />
            <rect y={16} width={w} height={h - 16} rx={2 * (theme.corner ?? 1)} fill={theme.boxFill} stroke={stroke} strokeWidth={sw} data-shape="package" />
            <text x={w / 2} y={16 + (h - 16) / 2 + 5} textAnchor="middle" {...text} fontSize={13} fontWeight={700}>
              {name}
            </text>
          </>
        );
      }
      default:
        return null;
    }
  })();

  if (shape) {
    return (
      <g
        transform={`translate(${rect.x} ${rect.y})`}
        onPointerDown={onPointerDown}
        style={{ cursor: onPointerDown ? 'grab' : undefined }}
        data-class={node.name}
        data-kind={kind}
        className="group"
      >
        {shape}
        {onHandlePointerDown && renderHandles()}
      </g>
    );
  }

  function renderHandles() {
    return handles.map((p, i) => (
      <g
        key={i}
        data-handle={i}
        className={`transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{ cursor: 'crosshair' }}
        onPointerDown={(e) => {
          // Shift+clic : c'est une sélection, pas un nouveau lien → on laisse l'élément le recevoir.
          if (e.shiftKey) return;
          e.stopPropagation();
          onHandlePointerDown?.({ x: rect.x + p.x, y: rect.y + p.y }, e);
        }}
      >
        <circle cx={p.x} cy={p.y} r={11} fill="transparent" />
        <circle cx={p.x} cy={p.y} r={5} fill={theme.boxFill} stroke={theme.accent} strokeWidth={1.6} />
      </g>
    ));
  }

  return (
    <g
      transform={`translate(${rect.x} ${rect.y})`}
      onPointerDown={onPointerDown}
      style={{ cursor: onPointerDown ? 'grab' : undefined }}
      data-class={node.name}
      data-kind="class"
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
      {onHandlePointerDown && renderHandles()}
    </g>
  );
}

/** Cadre d'un groupe : dossier (package), frontière de système, ou cadre de diagramme typé. */
function GroupFrame({
  group,
  rect,
  theme,
  colored,
  onPointerDown,
}: {
  group: Group;
  rect: Rect;
  theme: SceneTheme;
  /** Groupe coloré (« color ») : fond teinté. */
  colored?: boolean;
  onPointerDown?: (e: ReactPointerEvent<SVGGElement>) => void;
}) {
  const { x, y, w, h } = rect;
  const text = { fontFamily: FONT_FAMILY, fill: theme.text } as const;
  const grab = { onPointerDown, style: { cursor: onPointerDown ? 'move' : undefined } } as const;
  if (group.kind === 'package') {
    const tabW = Math.min(Math.max(group.title.length * 8 + 24, 70), w);
    return (
      <g data-group={group.name} data-group-kind="package">
        <rect x={x} y={y + 22} width={w} height={h - 22} rx={3 * (theme.corner ?? 1)} fill={theme.headerFill} fillOpacity={0.25} stroke={theme.muted} strokeWidth={1.3} />
        <g {...grab}>
          <path d={`M ${x} ${y + 22} V ${y + 3} Q ${x} ${y} ${x + 3} ${y} H ${x + tabW - 3} Q ${x + tabW} ${y} ${x + tabW} ${y + 3} V ${y + 22}`} fill={theme.headerFill} stroke={theme.muted} strokeWidth={1.3} />
          <text x={x + 10} y={y + 16} {...text} fontSize={12} fontWeight={700}>
            {group.title}
          </text>
        </g>
      </g>
    );
  }
  if (group.kind === 'system') {
    return (
      <g data-group={group.name} data-group-kind="system">
        <rect x={x} y={y} width={w} height={h} rx={6 * (theme.corner ?? 1)} fill={colored ? theme.headerFill : 'none'} fillOpacity={0.18} stroke={theme.muted} strokeWidth={1.6} />
        <g {...grab}>
          <rect x={x} y={y} width={w} height={26} fill="transparent" />
          <text x={x + w / 2} y={y + 18} textAnchor="middle" {...text} fontSize={13} fontWeight={700}>
            {group.title}
          </text>
        </g>
      </g>
    );
  }
  const tag = `${FRAME_TAG[group.diagramType ?? 'class']} ${group.title}`;
  const tw = Math.min(tag.length * 7.2 + 22, w);
  return (
    <g data-group={group.name} data-group-kind="frame">
      <rect x={x} y={y} width={w} height={h} fill={colored ? theme.headerFill : 'none'} fillOpacity={0.14} stroke={theme.edge} strokeWidth={1.3} />
      <g {...grab}>
        <path d={`M ${x} ${y} H ${x + tw} V ${y + 14} L ${x + tw - 8} ${y + 22} H ${x} Z`} fill={theme.headerFill} stroke={theme.edge} strokeWidth={1.3} />
        <text x={x + 8} y={y + 15} {...text} fontSize={11.5} fontWeight={600}>
          {tag}
        </text>
      </g>
    </g>
  );
}

export function DiagramScene({
  diagram,
  boxes,
  theme,
  selected,
  selectedEdge,
  selectedEdges,
  highlighted,
  focus,
  edges: precomputed,
  onBoxPointerDown,
  onEdgePointerDown,
  onHandlePointerDown,
  frames = {},
  selection,
  onFramePointerDown,
}: Props) {
  const edges = precomputed ?? computeEdges(diagram.relations, boxes);
  // Les grands cadres d'abord : un cadre imbriqué est dessiné par-dessus son parent.
  const groups = [...(diagram.groups ?? [])].filter((g) => frames[g.name]).sort((a, b) => frames[b.name].w * frames[b.name].h - frames[a.name].w * frames[a.name].h);
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
  // Apparence décrite dans le code : coins (carrés / arrondis) et couleur propre à chaque élément.
  const st = diagram.style;
  const base: SceneTheme = st?.corners === 'square' ? { ...theme, corner: 0 } : theme;
  const themeFor = (name: string) => (st?.colors[name] ? tinted(base, st.colors[name]) : base);
  const legend = legendBox(diagram, [...Object.values(boxes), ...Object.values(frames)]);

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

      {/* Cadres de groupes, tout au fond */}
      <g>
        {groups.map((g) => (
          <GroupFrame key={g.name} group={g} rect={frames[g.name]} theme={themeFor(g.name)} colored={!!st?.colors[g.name]} onPointerDown={onFramePointerDown ? (e) => onFramePointerDown(g, e) : undefined} />
        ))}
      </g>

      {/* Liens sous les boîtes : une boîte déplacée masque proprement les traits qui passent derrière */}
      <g fill="none" stroke={theme.edge} strokeWidth={1.4}>
        {edges.map(({ relation, d, label, points, inset }, i) => {
          const m = markerFor(relation.kind);
          const isSelected = selectedEdge === relation.line || !!selectedEdges?.has(relation.line);
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
                  {pretty(relation.label)}
                </text>
              )}
              {[
                [relation.multFrom, 'start'],
                [relation.multTo, 'end'],
              ].map(([m, end]) => {
                if (!m || points.length < 2) return null;
                const at = multPosition(points, end as 'start' | 'end', inset?.[end as 'start' | 'end'] ?? 0);
                return (
                  <text key={end} x={at.x} y={at.y} textAnchor="middle" fill={theme.text} stroke={theme.bg} strokeWidth={3} paintOrder="stroke" fontFamily={FONT_FAMILY} fontSize={11} data-mult={end}>
                    {m}
                  </text>
                );
              })}
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
              theme={themeFor(c.name)}
              selected={selected === c.name || !!selection?.has(c.name)}
              highlighted={highlighted === c.name}
              onPointerDown={onBoxPointerDown ? (e) => onBoxPointerDown(c.name, e) : undefined}
              onHandlePointerDown={onHandlePointerDown ? (at, e) => onHandlePointerDown(c.name, at, e) : undefined}
            />
            </g>
          );
        })}
      </g>

      {legend && <Legend box={legend} theme={base} />}
    </>
  );
}

/** Légende : une pastille par couleur libellée (incluse dans les exports SVG / PDF). */
function Legend({ box, theme }: { box: LegendBox; theme: SceneTheme }) {
  const { x, y, w, h } = box;
  const r = 6 * (theme.corner ?? 1);
  return (
    <g data-legend="" fontFamily={FONT_FAMILY}>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={theme.boxFill} stroke={theme.boxStroke} strokeWidth={1.2} />
      <text x={x + 12} y={y + 20} fill={theme.text} fontSize={12} fontWeight={700}>
        {box.title}
      </text>
      {box.entries.map((e, i) => {
        const ry = y + 30 + i * LEGEND_ROW;
        return (
          <g key={`${e.color}-${e.label}`} data-legend-entry={e.label}>
            <rect x={x + 12} y={ry + 3} width={16} height={14} rx={3 * (theme.corner ?? 1)} fill={e.color} stroke={tinted(theme, e.color).boxStroke} strokeWidth={1} />
            <text x={x + 38} y={ry + 14.5} fill={theme.text} fontSize={12}>
              {e.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
