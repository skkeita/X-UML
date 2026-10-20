import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Canvas } from './components/Canvas';
import { CodeEditor } from './components/CodeEditor';
import { EditorModeBar, FocusPlaceholder, type EditorMode } from './components/EditorModeBar';
import { RelationsPanel } from './components/RelationsPanel';
import { SplitPane } from './components/SplitPane';
import { Tabs } from './components/Tabs';
import { Toast, type ToastData } from './components/Toast';
import { Toolbar } from './components/Toolbar';
import { addDiagramFrame, addPackage, addRelation, deleteNodes, deleteRelation, updateRelation, type RelationChange, type RelationRef } from './core/edit';
import { applyFocusEdit, codeLines, focusLines, focusText } from './core/focus';
import { boundsOf, computeBoxes, computeFrames, layoutNewClasses, measureClass, resolveOverlap } from './core/layout';
import { parse } from './core/parser';
import { SAMPLE_SOURCE } from './core/sample';
import type { Template } from './core/templates';
import { PRINT, sceneTheme } from './core/theme';
import type { Diagram, DiagramType, Point, RelationKind } from './core/types';
import { useAutosave } from './hooks/useAutosave';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useHistory } from './hooks/useHistory';
import { useTheme } from './hooks/useTheme';
import { exportPdf } from './lib/exportPdf';
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
    boards: initial?.boards ?? [newBoard('Classes', SAMPLE_SOURCE)],
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
   * Simplifié : tout s'écrit dans le code, liaisons comprises (comme au début).
   * Personnalisé : le code ne contient que les classes ; les liaisons se règlent dans leur panneau.
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
  const handleDeleteNodes = useCallback((names: string[]) => editSource((src) => deleteNodes(src, names)), [editSource]);
  const handleCreatePackage = useCallback(
    (title: string, names: string[]) => editSource((src) => addPackage(src, title, names)),
    [editSource],
  );
  const handleTypeSelection = useCallback(
    (type: DiagramType, title: string, names: string[]) => editSource((src) => addDiagramFrame(src, type, title, names)),
    [editSource],
  );
  const handleRelationAdd = useCallback(
    (from: string, to: string, kind: RelationKind) => editSource((src) => addRelation(src, from, to, kind)),
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
  // En mode Simplifié, l'éditeur montre aussi les liaisons (tout le script, comme au début).
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
      const b = newBoard(uniqueName(history.present.boards, t.name), t.source);
      history.push((p) => ({ boards: [...p.boards, b] }));
      setActiveId(b.id);
    },
    [history],
  );
  const renameBoard = useCallback(
    (id: string, name: string) => history.push((p) => ({ boards: p.boards.map((b) => (b.id === id ? { ...b, name } : b)) })),
    [history.push], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Nom de fichier lisible pour le tableau affiché (export SVG / PDF). */
  const baseName = `${exportFileName().replace(/\.json$/, '')}-${active.name.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'tableau'}`;
  const exportSvg = () => {
    const svg = buildSvgString(diagram, computeBoxes(diagram, positions), sceneTheme(theme));
    downloadText(`${baseName}.svg`, svg, 'image/svg+xml');
  };

  // --- Import / export du projet ------------------------------------------------------------
  const fileInput = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const [fitKey, setFitKey] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  /** Export PDF : A4, thème clair, prêt à imprimer ou à joindre à un rapport. */
  const downloadPdf = useCallback(async () => {
    const { svg, width, height } = buildSvg(diagram, computeBoxes(diagram, positions), PRINT);
    setToast({ id: Date.now(), message: 'Préparation du PDF…', tone: 'success' });
    try {
      await exportPdf(svg, width, height, `${baseName}.pdf`, active.name);
      setToast({ id: Date.now(), message: 'PDF exporté (A4, prêt à imprimer).', tone: 'success' });
    } catch {
      setToast({ id: Date.now(), message: 'Impossible de créer le PDF dans ce navigateur.', tone: 'error' });
    }
  }, [diagram, positions, baseName, active.name]);

  const downloadProject = useCallback(() => {
    downloadText(exportFileName(), serializeProject(projectBoards), 'application/json');
    setToast({
      id: Date.now(),
      message: `Projet exporté : ${projectBoards.length} tableau${projectBoards.length > 1 ? 'x' : ''}, code et positions.`,
      tone: 'success',
    });
  }, [projectBoards]);

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

  const editorPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <EditorModeBar
        mode={editorMode}
        onModeChange={setEditorMode}
        focusName={editorMode === 'class' && viewLines.length > 0 ? focusName : null}
        lineCount={viewLines.length}
        totalLines={withRelations ? source.split('\n').length : codeLines(source).length}
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
          />
        )}
      </div>
      {relationMode === 'custom' && (
      <RelationsPanel
        relations={diagram.relations}
        classNames={classNames}
        filter={editorMode === 'class' ? focusName : null}
        onChange={handleRelationChange}
        onDelete={handleRelationDelete}
        onAdd={handleRelationAdd}
      />
      )}
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
            {diagram.classes.length} élément{diagram.classes.length > 1 ? 's' : ''} · {diagram.relations.length} relation
            {diagram.relations.length > 1 ? 's' : ''}
            {diagram.groups?.length ? ` · ${diagram.groups.length} groupe${diagram.groups.length > 1 ? 's' : ''}` : ''}
          </p>
        )}
      </footer>
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
        onExportSvg={exportSvg}
        onDownloadProject={downloadProject}
        onImport={() => fileInput.current?.click()}
        onExportPdf={() => void downloadPdf()}
        saveStatus={saveStatus}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        relationMode={relationMode}
        onRelationModeChange={setRelationMode}
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
            onDrop={handleDrop}
            onDeleteNodes={handleDeleteNodes}
            onCreatePackage={handleCreatePackage}
            onTypeSelection={handleTypeSelection}
            fitKey={fitKey}
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
