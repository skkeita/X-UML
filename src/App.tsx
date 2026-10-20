import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Canvas } from './components/Canvas';
import { CodeEditor } from './components/CodeEditor';
import { EditorModeBar, FocusPlaceholder, type EditorMode } from './components/EditorModeBar';
import { SplitPane } from './components/SplitPane';
import { Tabs } from './components/Tabs';
import { Toast, type ToastData } from './components/Toast';
import { Toolbar } from './components/Toolbar';
import { addDiagramFrame, addPackage, addRelation, deleteNodes, duplicateNodes, setColor, setCorners, setLegendVisible, toIdent, ungroup, deleteRelation, updateRelation, type RelationChange, type RelationRef } from './core/edit';
import { applyFocusEdit, codeLines, focusLines, focusText } from './core/focus';
import { boundsOf, computeBoxes, computeFrames, layoutNewClasses, measureClass, resolveOverlap } from './core/layout';
import { parse } from './core/parser';
import { VOCABULARIES, inferDiagramType, summarize, type ElementKind } from './core/vocabulary';
import { addElement, renameElement, setElementKind, setGroupTitle, setElementLabel, setGroupOf, setMembers, setObjectType, setParents, type MemberDraft } from './core/modelEdit';
import { Inspector } from './components/Inspector';
import { SAMPLE_SOURCE } from './core/sample';
import type { Template } from './core/templates';
import { PRINT, sceneTheme } from './core/theme';
import type { Diagram, DiagramType, Group, Point, RelationKind } from './core/types';
import { useAutosave } from './hooks/useAutosave';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useHistory } from './hooks/useHistory';
import { useTheme } from './hooks/useTheme';
import { exportPdfPages } from './lib/exportPdf';
import { buildSvg, buildSvgString, downloadText } from './lib/exportSvg';
import { exportFileName, parseProjectFile, serializeProject } from './lib/projectFile';
import { newBoard, type Board } from './lib/project';
import { loadProject, type StoredProject } from './lib/storage';

export type RelationMode = 'simple' | 'custom';
const RELATION_MODE_KEY = 'x-uml:relation-mode';
function loadRelationMode(): RelationMode {
  try {
    return localStorage.getItem(RELATION_MODE_KEY) === 'custom' ? 'custom' : 'simple';
  } catch {
    return 'simple';
  }
}

const EDITOR_MODE_KEY = 'x-uml:editor-mode';
function loadEditorMode(): EditorMode {
  try {
    return localStorage.getItem(EDITOR_MODE_KEY) === 'class' ? 'class' : 'all';
  } catch {
    return 'all';
  }
}

/**
 * Tout ce que l'utilisateur peut modifier — donc tout ce que Ctrl+Z doit pouvoir restaurer :
 * les tableaux du projet (script + positions choisies), y compris leur création / fermeture.
 */
interface ProjectState {
  boards: Board[];
}

/** Nom libre pour un nouveau tableau (« Classes », « Classes 2 »…). */
function uniqueName(boards: Board[], base: string): string {
  const names = new Set(boards.map((b) => b.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export default function App() {
  const { theme, toggle } = useTheme();
  const initial = useMemo(loadProject, []);

  const history = useHistory<ProjectState>(() => ({
    boards: initial?.boards ?? [newBoard('Classes', SAMPLE_SOURCE, {}, 'class')],
  }));
  const { boards } = history.present;

  // --- Onglet actif (hors historique : changer d'onglet ne s'annule pas) ----------------------
  const [activeId, setActiveId] = useState<string>(() => initial?.activeId ?? history.present.boards[0].id);
  const active = boards.find((b) => b.id === activeId) ?? boards[0];
  const activeIdRef = useRef(active.id);
  activeIdRef.current = active.id;
  // Après une annulation qui retire l'onglet actif, on retombe sur un onglet existant.
  useEffect(() => {
    if (!boards.some((b) => b.id === activeId)) setActiveId(boards[0].id);
  }, [boards, activeId]);
  /** Applique une modification au tableau actif uniquement. */
  const onActive = useCallback(
    (fn: (b: Board) => Board) => (p: ProjectState): ProjectState => ({
      boards: p.boards.map((b) => (b.id === activeIdRef.current ? fn(b) : b)),
    }),
    [],
  );
  const { source, positions: stored } = active;
  const [editorOpen, setEditorOpen] = useState(true);

  // --- Mode de l'éditeur : tout le script, ou seulement la classe cliquée --------------------
  const [editorMode, setEditorMode] = useState<EditorMode>(loadEditorMode);
  useEffect(() => {
    try {
      localStorage.setItem(EDITOR_MODE_KEY, editorMode);
    } catch {
      /* préférence non mémorisée : sans conséquence */
    }
  }, [editorMode]);
  /**
   * Code : tout s'écrit dans le script, relations comprises. Visuel : tout se construit à la souris.
   */
  const [relationMode, setRelationMode] = useState<RelationMode>(loadRelationMode);
  useEffect(() => {
    try {
      localStorage.setItem(RELATION_MODE_KEY, relationMode);
    } catch {
      /* préférence non mémorisée : sans conséquence */
    }
  }, [relationMode]);
  /** Classe actuellement sélectionnée dans le diagramme (null après un clic dans le vide). */
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  /** Classe affichée en mode « une classe » : reste affichée tant qu'on n'en clique pas une autre. */
  const [focusName, setFocusName] = useState<string | null>(null);
  /** Lignes affichées dans l'éditeur, mémorisées pendant la frappe (une ligne pas encore valide ne doit pas disparaître). */
  const [viewMemo, setViewMemo] = useState<{ key: string; source: string; lines: number[] } | null>(null);
  const [reveal, setReveal] = useState<number | null>(null);

  // 1) Parsing temps réel avec anti-rebond : la frappe reste fluide, le rendu suit ~150 ms après.
  const debounced = useDebouncedValue(source, 150);
  const result = useMemo(() => parse(debounced), [debounced]);

  // 2) Dernier rendu valide : si le script contient une erreur, le canevas ne « clignote » pas ni ne se vide.
  const [diagram, setDiagram] = useState<Diagram>(() => parse(source).diagram);
  useEffect(() => {
    if (result.errors.length === 0) setDiagram(result.diagram);
  }, [result]);
  // Changement d'onglet : on affiche tout de suite le nouveau tableau, et on oublie l'état de l'éditeur.
  const firstBoard = useRef(true);
  useEffect(() => {
    if (firstBoard.current) {
      firstBoard.current = false;
      return;
    }
    setDiagram(parse(source).diagram);
    setViewMemo(null);
    setFocusName(null);
    setSelectedClass(null);
    setFitKey((k) => k + 1);
  }, [active.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3) Positions effectives : celles de l'utilisateur + placement automatique des nouvelles classes seulement.
  const positions = useMemo(() => layoutNewClasses(diagram, stored), [diagram, stored]);

  // 4) Type du diagramme (choisi pour le tableau, sinon déduit) → vocabulaire de toute l'interface.
  const diagramType = inferDiagramType(diagram, active.type);
  const vocab = VOCABULARIES[diagramType];

  // --- Actions (toutes passent par l'historique) -------------------------------------------


  /** Un glisser = une seule étape d'annulation : 'push' au premier mouvement, 'merge' ensuite. */
  const handleMove = useCallback(
    (moves: Record<string, Point>, first: boolean) => {
      const apply = onActive((b) => ({ ...b, positions: { ...b.positions, ...positions, ...moves } }));
      if (first) history.push(apply);
      else history.merge(apply);
    },
    [positions, onActive, history.push, history.merge], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /**
   * Au lâcher : des éléments posés sur d'autres glissent ensemble vers la place libre la plus proche
   * (même étape d'annulation). Un groupe déplacé garde sa disposition interne.
   */
  const handleDrop = useCallback(
    (names: string[]) => {
      const moved = new Set(names);
      const rects = names
        .map((n) => {
          const node = diagram.classes.find((c) => c.name === n);
          return node && positions[n] ? { ...positions[n], ...measureClass(node) } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      const union = boundsOf(rects);
      if (!union) return;
      const others = diagram.classes
        .filter((c) => !moved.has(c.name) && positions[c.name])
        .map((c) => ({ ...positions[c.name], ...measureClass(c) }));
      // Un élément ne se pose pas dans le cadre d'un groupe dont il ne fait pas partie.
      const boxesNow = computeBoxes(diagram, positions);
      const frames = computeFrames(diagram.groups ?? [], boxesNow);
      for (const g of diagram.groups ?? []) {
        if (frames[g.name] && !g.members.some((m) => moved.has(m))) others.push(frames[g.name]);
      }
      const free = resolveOverlap({ x: union.x, y: union.y }, { w: union.w, h: union.h }, others);
      const dx = free.x - union.x;
      const dy = free.y - union.y;
      if (dx === 0 && dy === 0) return;
      history.merge(
        onActive((b) => {
          const next = { ...b.positions };
          for (const n of names) if (positions[n]) next[n] = { x: positions[n].x + dx, y: positions[n].y + dy };
          return { ...b, positions: next };
        }),
      );
    },
    [diagram, positions, onActive, history.merge], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Édition depuis le canevas : on réécrit le script (le texte reste la source de vérité).
  const editSource = useCallback(
    (fn: (src: string) => string) => history.push(onActive((b) => ({ ...b, source: fn(b.source) }))),
    [onActive, history.push], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const handleRelationChange = useCallback(
    (ref: RelationRef, change: RelationChange) => editSource((src) => updateRelation(src, ref, change)),
    [editSource],
  );
  const handleRelationDelete = useCallback((ref: RelationRef) => editSource((src) => deleteRelation(src, ref)), [editSource]);
  /**
   * Supprime seulement les éléments visés : les autres gardent exactement leur place
   * (leurs positions actuelles sont figées, même celles calculées automatiquement).
   */
  const handleDeleteNodes = useCallback(
    (names: string[]) => {
      const gone = new Set(names);
      const kept = Object.fromEntries(Object.entries(positions).filter(([n]) => !gone.has(n)));
      history.push(onActive((b) => ({ ...b, source: deleteNodes(b.source, names), positions: { ...kept } })));
    },
    [positions, onActive, history.push], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /** Duplique la sélection : copies décalées en diagonale (on voit tout de suite qu'il y en a deux), puis sélectionnées. */
  const handleDuplicate = useCallback(
    (names: string[]): string[] => {
      const { source: next, renames } = duplicateNodes(active.source, names);
      const moved: Record<string, Point> = {};
      for (const [from, to] of Object.entries(renames)) {
        const p = positions[from];
        if (p) moved[to] = { x: p.x + 40, y: p.y + 40 };
      }
      history.push(onActive((b) => ({ ...b, source: next, positions: { ...b.positions, ...moved } })));
      return Object.values(renames);
    },
    [active.source, positions, onActive, history.push], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const handleColor = useCallback(
    (names: string[], color: string | null, label: string) => editSource((src) => setColor(src, names, color, label)),
    [editSource],
  );
  const handleCreatePackage = useCallback(
    (title: string, names: string[]) => editSource((src) => addPackage(src, title, names, vocab.group.kind)),
    [editSource, vocab.group.kind],
  );
  const handleTypeSelection = useCallback(
    (type: DiagramType, title: string, names: string[]) => editSource((src) => addDiagramFrame(src, type, title, names)),
    [editSource],
  );
  // --- Panneau Visuel : construire sans écrire de code ------------------------------------------
  const setBoardType = useCallback(
    (type: DiagramType) => history.push(onActive((b) => ({ ...b, type }))),
    [onActive, history.push], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const handleAddElement = useCallback(
    (kind: ElementKind, label: string): string => {
      const { source: next, name } = addElement(active.source, kind, label);
      history.push(onActive((b) => ({ ...b, source: next })));
      return name;
    },
    [active.source, onActive, history.push], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const handleRename = useCallback(
    (name: string, next: string) => {
      const renamed = renameElement(active.source, name, next);
      if (renamed === active.source) return;
      const id = toIdent(next);
      // La position suit le nouveau nom : l'élément ne « saute » pas ailleurs.
      history.push(
        onActive((b) => {
          const positions = { ...b.positions };
          if (positions[name]) {
            positions[id] = positions[name];
            delete positions[name];
          }
          return { ...b, source: renamed, positions };
        }),
      );
      setSelectedClass(id);
    },
    [active.source, onActive, history.push], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /** Renommer depuis le diagramme : identifiant pour une classe / un objet, libellé affiché pour les autres. */
  const handleRenameAny = useCallback(
    (name: string, text: string) => {
      const node = diagram.classes.find((c) => c.name === name);
      const keepsId = !node || (node.kind ?? 'class') === 'class' || node.kind === 'object';
      if (keepsId) handleRename(name, text);
      else editSource((src) => setElementLabel(src, name, text));
    },
    [diagram, handleRename, editSource],
  );
  const handleRenameGroup = useCallback((group: Group, title: string) => editSource((src) => setGroupTitle(src, group, title)), [editSource]);
  /** Dégrouper : le cadre disparaît, les éléments restent exactement à leur place. */
  const handleUngroup = useCallback(
    (group: Group) => {
      const kept = Object.fromEntries(Object.entries(positions).filter(([n]) => n !== group.name));
      history.push(onActive((b) => ({ ...b, source: ungroup(b.source, group), positions: kept })));
    },
    [positions, onActive, history.push], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const inspectorActions = {
    onRenameGroup: handleRenameGroup,
    onUngroup: handleUngroup,
    onTypeChange: setBoardType,
    onAdd: handleAddElement,
    onRename: handleRename,
    onLabel: (name: string, label: string) => editSource((src) => setElementLabel(src, name, label)),
    onKind: (name: string, kind: ElementKind) => editSource((src) => setElementKind(src, name, kind)),
    onParents: (name: string, parents: string[], interfaces: string[]) => editSource((src) => setParents(src, name, parents, interfaces)),
    onMembers: (name: string, members: MemberDraft[]) => editSource((src) => setMembers(src, name, members)),
    onObjectType: (name: string, type: string) => editSource((src) => setObjectType(src, name, type)),
    onGroup: (name: string, group: string | null) => editSource((src) => setGroupOf(src, name, group)),
  };

  const handleRelationAdd = useCallback(
    (from: string, to: string, kind: RelationKind, label?: string) => editSource((src) => addRelation(src, from, to, kind, label)),
    [editSource],
  );

  // --- Vue ciblée -------------------------------------------------------------------------
  const handleSelectClass = useCallback(
    (name: string | null) => {
      setSelectedClass(name);
      if (!name) return;
      setFocusName(name);
      const first = focusLines(source, name, false)[0];
      setReveal(first === undefined ? null : first + 1);
    },
    [source],
  );

  // L'éditeur montre le code des classes, jamais les liaisons (elles ont leur propre panneau).
  // En mode Code, l'éditeur montre tout le script, relations comprises.
  const withRelations = relationMode === 'simple';
  const viewKey = `${relationMode}:${editorMode === 'all' ? 'all' : `class:${focusName ?? ''}`}`;
  const viewLines = useMemo(() => {
    if (viewMemo && viewMemo.key === viewKey && viewMemo.source === source) return viewMemo.lines;
    if (editorMode === 'all') return withRelations ? source.split('\n').map((_, i) => i) : codeLines(source);
    return focusName ? focusLines(source, focusName, withRelations) : [];
  }, [viewKey, viewMemo, source, editorMode, focusName, withRelations]);

  const onViewChange = useCallback(
    (view: string) => {
      const r = applyFocusEdit(source, viewLines, view);
      let key = viewKey;
      if (editorMode === 'class' && focusName) {
        // Renommage de la classe depuis la vue : on suit le nouveau nom.
        const decl = /^\s*(?:abstract\s+class|class|interface|enum)\s+([\p{L}_][\p{L}\p{N}_]*)/mu.exec(view);
        const name = decl && decl[1] !== focusName && focusLines(r.source, focusName, false).length === 0 ? decl[1] : focusName;
        if (name !== focusName) setFocusName(name);
        key = `${relationMode}:class:${name}`;
      }
      setViewMemo({ key, source: r.source, lines: r.lines });
      history.type(onActive((b) => ({ ...b, source: r.source })));
    },
    [source, viewLines, viewKey, editorMode, focusName, relationMode, onActive, history.type], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const highlightLines = useMemo(
    () =>
      editorMode === 'all' && selectedClass ? new Set(focusLines(source, selectedClass, withRelations).map((i) => i + 1)) : undefined,
    [editorMode, selectedClass, source, withRelations],
  );

  /** Classe connue seulement par ses liaisons : on propose de la déclarer. */
  const declareClass = useCallback(
    (name: string) => editSource((src) => `${src.replace(/\s+$/, '')}\n\nclass ${name} {\n}\n`),
    [editSource],
  );

  // 4) Persistance locale automatique (tous les tableaux ; positions effectives pour le tableau affiché).
  const projectBoards = useMemo(() => boards.map((b) => (b.id === active.id ? { ...b, positions } : b)), [boards, active.id, positions]);
  const project = useMemo<StoredProject>(() => ({ boards: projectBoards, activeId: active.id }), [projectBoards, active.id]);
  const saveStatus = useAutosave(project);

  // --- Onglets ----------------------------------------------------------------------------------
  const addBoard = useCallback(
    (t: Template) => {
      const b = newBoard(uniqueName(history.present.boards, t.name), t.source, {}, t.type);
      history.push((p) => ({ boards: [...p.boards, b] }));
      setActiveId(b.id);
    },
    [history],
  );
  const renameBoard = useCallback(
    (id: string, name: string) => history.push((p) => ({ boards: p.boards.map((b) => (b.id === id ? { ...b, name } : b)) })),
    [history.push], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Nom de fichier lisible pour un tableau (export SVG / PDF). */
  const slug = (name: string) => name.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'tableau';
  const dated = exportFileName().replace(/\.json$/, '');
  /** Tableaux choisis dans le menu Exporter (le tableau affiché par défaut), avec leur diagramme prêt à dessiner. */
  const boardsFor = useCallback(
    (ids?: string[]) =>
      projectBoards
        .filter((b) => (ids ? ids.includes(b.id) : b.id === active.id))
        .map((b) => {
          if (b.id === active.id) return { board: b, diagram, positions };
          const d = parse(b.source).diagram;
          return { board: b, diagram: d, positions: layoutNewClasses(d, b.positions) };
        }),
    [projectBoards, active.id, diagram, positions],
  );
  /** Export du code : le script de chaque tableau choisi, en texte brut (réimportable tel quel). */
  const exportCode = (ids?: string[]) => {
    const list = ids ? projectBoards.filter((b) => ids.includes(b.id)) : projectBoards.filter((b) => b.id === active.id);
    list.forEach((b, i) =>
      window.setTimeout(() => downloadText(`${dated}-${slug(b.name)}.txt`, b.source.endsWith('\n') ? b.source : `${b.source}\n`, 'text/plain'), i * 300),
    );
  };
  const exportSvg = (ids?: string[]) => {
    const list = boardsFor(ids);
    // Un fichier par tableau ; léger décalage pour que le navigateur accepte les téléchargements successifs.
    list.forEach(({ board, diagram: d, positions: pos }, i) =>
      window.setTimeout(() => downloadText(`${dated}-${slug(board.name)}.svg`, buildSvgString(d, computeBoxes(d, pos), sceneTheme(theme)), 'image/svg+xml'), i * 300),
    );
  };

  // --- Import / export du projet ------------------------------------------------------------
  const fileInput = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const [fitKey, setFitKey] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  /** Export PDF : A4, thème clair ; plusieurs tableaux → un seul PDF, une page par tableau. */
  const downloadPdf = useCallback(
    async (ids?: string[]) => {
      const list = boardsFor(ids);
      if (list.length === 0) return;
      const pages = list.map(({ board, diagram: d, positions: pos }) => ({ ...buildSvg(d, computeBoxes(d, pos), PRINT), title: board.name }));
      const many = list.length > 1;
      setToast({ id: Date.now(), message: 'Préparation du PDF…', tone: 'success' });
      try {
        await exportPdfPages(pages, `${dated}-${many ? 'projet' : slug(list[0].board.name)}.pdf`, many ? 'Projet X-UML' : list[0].board.name);
        setToast({
          id: Date.now(),
          message: many ? `PDF exporté : ${list.length} tableaux, une page A4 chacun.` : 'PDF exporté (A4, prêt à imprimer).',
          tone: 'success',
        });
      } catch {
        setToast({ id: Date.now(), message: 'Impossible de créer le PDF dans ce navigateur.', tone: 'error' });
      }
    },
    [boardsFor, dated],
  );

  /** Projet .json : tous les tableaux par défaut (Ctrl+S), ou ceux cochés dans le menu. */
  const downloadProject = useCallback(
    (ids?: string[]) => {
      const list = ids ? projectBoards.filter((b) => ids.includes(b.id)) : projectBoards;
      if (list.length === 0) return;
      const name = list.length === 1 && projectBoards.length > 1 ? `${dated}-${slug(list[0].name)}.json` : exportFileName();
      downloadText(name, serializeProject(list), 'application/json');
      setToast({
        id: Date.now(),
        message: `Projet exporté : ${list.length} tableau${list.length > 1 ? 'x' : ''}, code et positions.`,
        tone: 'success',
      });
    },
    [projectBoards, dated],
  );

  // Raccourcis globaux. Ctrl+Z est intercepté AUSSI dans l'éditeur : l'annulation native du
  // <textarea> ignorerait les modifications faites depuis le canevas et désynchroniserait tout.
  const { undo, redo } = history;

  const closeBoard = useCallback(
    (id: string) => {
      const list = history.present.boards;
      if (list.length <= 1) return;
      const i = list.findIndex((b) => b.id === id);
      const name = list[i]?.name;
      history.push((p) => ({ boards: p.boards.filter((b) => b.id !== id) }));
      if (id === activeIdRef.current) setActiveId(list[i + 1]?.id ?? list[i - 1].id);
      setToast({ id: Date.now(), message: `Tableau « ${name} » fermé.`, tone: 'success', action: { label: 'Annuler', onClick: undo } });
    },
    [history, undo],
  );

  /** Remplace le projet courant par le fichier importé — en une étape annulable (Ctrl+Z). */
  const importFile = useCallback(
    async (file: File) => {
      let text = '';
      try {
        text = await file.text();
      } catch {
        setToast({ id: Date.now(), message: 'Impossible de lire ce fichier.', tone: 'error' });
        return;
      }
      const r = parseProjectFile(text, file.name);
      if (!r.ok) {
        setToast({ id: Date.now(), message: `Import impossible : ${r.error}`, tone: 'error' });
        return;
      }
      history.push(() => ({ boards: r.boards }));
      setActiveId(r.boards[0].id);
      setViewMemo(null);
      setFocusName(null);
      setSelectedClass(null);
      setFitKey((k) => k + 1);
      setToast({ id: Date.now(), message: `« ${file.name} » importé.`, tone: 'success', action: { label: 'Annuler', onClick: undo } });
    },
    [history.push, undo], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOver(true);
  };
  const onDropFile = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void importFile(f);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) undo();
      else if ((k === 'z' && e.shiftKey) || k === 'y') redo();
      else if (k === 'b') setEditorOpen((o) => !o);
      else if (k === 's') downloadProject(); // remplace « Enregistrer la page » du navigateur
      else if (k === 'p') void downloadPdf(); // remplace l'impression de la page entière
      else if (k === 'o') fileInput.current?.click();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, downloadProject, downloadPdf]);

  const hasErrors = result.errors.length > 0;

  const focusActive = editorMode === 'class' && !!focusName && viewLines.length > 0;
  const classNames = useMemo(() => diagram.classes.map((c) => c.name), [diagram]);
  const implicitFocus = editorMode === 'class' && focusName && !focusActive && classNames.includes(focusName) ? focusName : null;

  const footer = (
    <footer
      className={`shrink-0 border-t px-3 py-2 text-xs ${
        hasErrors
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
          : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
      }`}
      role="status"
    >
      {hasErrors ? (
        <>
          <p className="font-medium">
            Ligne {result.errors[0].line} : {result.errors[0].message}
            {result.errors.length > 1 && ` (+${result.errors.length - 1})`}
          </p>
          <p className="opacity-80">Le dernier rendu valide est conservé.</p>
        </>
      ) : (
        <p>
          {summarize(vocab, diagram)}
          {diagram.groups?.length ? ` · ${diagram.groups.length} cadre${diagram.groups.length > 1 ? 's' : ''}` : ''}
        </p>
      )}
    </footer>
  );

  const editorPanel =
    relationMode === 'custom' ? (
      // Mode Visuel : tout se construit avec des menus et des champs, sans une ligne de code.
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <Inspector
            diagram={diagram}
            vocab={vocab}
            chosenType={active.type}
            selected={selectedClass}
            onSelect={(name) => setSelectedClass(name)}
            {...inspectorActions}
            onColor={handleColor}
            onDelete={handleDeleteNodes}
            onDuplicate={handleDuplicate}
            onRelationChange={handleRelationChange}
            onRelationDelete={handleRelationDelete}
            onRelationAdd={handleRelationAdd}
          />
        </div>
        {footer}
      </div>
    ) : (
      <div className="flex h-full min-h-0 flex-col">
        <EditorModeBar
          mode={editorMode}
          onModeChange={setEditorMode}
          focusName={editorMode === 'class' && viewLines.length > 0 ? focusName : null}
          lineCount={viewLines.length}
          totalLines={withRelations ? source.split('\n').length : codeLines(source).length}
          vocab={vocab}
        />
        <div className="min-h-0 flex-1">
          {editorMode === 'all' || focusActive ? (
            <CodeEditor
              key={editorMode}
              value={focusText(source, viewLines)}
              onChange={onViewChange}
              errors={result.errors}
              lineNumbers={viewLines.map((i) => i + 1)}
              highlightLines={highlightLines}
              revealLine={editorMode === 'all' ? reveal : null}
              placeholder={editorMode === 'all' ? 'class Animal { + nom: string }' : `class ${focusName} { … }`}
              diagram={diagram}
            />
          ) : (
            <FocusPlaceholder
              missing={implicitFocus ? null : focusName}
              implicit={implicitFocus}
              onDeclare={declareClass}
              onShowAll={() => setEditorMode('all')}
              vocab={vocab}
            />
          )}
        </div>
        {footer}
      </div>
    );

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setDragOver(false);
      }}
      onDrop={onDropFile}
    >
      <input
        ref={fileInput}
        type="file"
        accept=".json,.xuml,.txt,.puml,.uml,application/json,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = ''; // permet de réimporter le même fichier
        }}
      />
      <Toolbar
        theme={theme}
        onToggleTheme={toggle}
        editorOpen={editorOpen}
        onToggleEditor={() => setEditorOpen((o) => !o)}
        boards={boards.map((b) => ({ id: b.id, name: b.name }))}
        activeId={active.id}
        onExportSvg={exportSvg}
        onExportCode={exportCode}
        onDownloadProject={downloadProject}
        onImport={() => fileInput.current?.click()}
        onExportPdf={(ids) => void downloadPdf(ids)}
        saveStatus={saveStatus}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        relationMode={relationMode}
        onRelationModeChange={setRelationMode}
        corners={diagram.style?.corners ?? 'rounded'}
        onCornersChange={(c) => editSource((src) => setCorners(src, c))}
        legendCount={diagram.style?.legend.length ?? 0}
        legendVisible={!diagram.style?.legendHidden}
        onLegendVisibleChange={(v) => editSource((src) => setLegendVisible(src, v))}
      />
      <Tabs boards={boards} activeId={active.id} onSelect={setActiveId} onAdd={addBoard} onRename={renameBoard} onClose={closeBoard} />
      <SplitPane
        leftOpen={editorOpen}
        left={editorPanel}
        right={
          <Canvas
            diagram={diagram}
            positions={positions}
            theme={sceneTheme(theme)}
            onMove={handleMove}
            onRelationChange={handleRelationChange}
            onRelationDelete={handleRelationDelete}
            onRelationAdd={handleRelationAdd}
            onSelectClass={handleSelectClass}
            selectedName={relationMode === 'custom' ? selectedClass : undefined}
            onRenameElement={handleRenameAny}
            onRenameGroup={handleRenameGroup}
            onUngroup={handleUngroup}
            onDrop={handleDrop}
            onDeleteNodes={handleDeleteNodes}
            onDuplicate={handleDuplicate}
            onColor={handleColor}
            onCreatePackage={handleCreatePackage}
            onTypeSelection={handleTypeSelection}
            fitKey={fitKey}
            vocab={vocab}
            emptyHint={
              relationMode === 'custom'
                ? `Ajoutez ${vocab.create[0]?.withArticle ?? 'un élément'} depuis le panneau de gauche pour commencer`
                : undefined
            }
            focus={focusActive ? focusName : null}
          />
        }
      />
      {dragOver && (
        <div className="pointer-events-none fixed inset-2 z-40 flex items-center justify-center rounded-xl border-4 border-dashed border-indigo-400 bg-indigo-500/10 text-lg font-medium text-indigo-700 backdrop-blur-[1px] dark:text-indigo-200">
          Déposez le fichier pour importer le projet
        </div>
      )}
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
