import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Canvas } from './components/Canvas';
import { CodeEditor } from './components/CodeEditor';
import { EditorModeBar, FocusPlaceholder, type EditorMode } from './components/EditorModeBar';
import { RelationsPanel } from './components/RelationsPanel';
import { SplitPane } from './components/SplitPane';
import { Toast, type ToastData } from './components/Toast';
import { Toolbar } from './components/Toolbar';
import { addRelation, deleteRelation, updateRelation, type RelationChange, type RelationRef } from './core/edit';
import { applyFocusEdit, codeLines, focusLines, focusText } from './core/focus';
import { computeBoxes, layoutNewClasses, measureClass, resolveOverlap } from './core/layout';
import { parse } from './core/parser';
import { SAMPLE_SOURCE } from './core/sample';
import { sceneTheme } from './core/theme';
import type { Diagram, Point, Positions, RelationKind } from './core/types';
import { useAutosave } from './hooks/useAutosave';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useHistory } from './hooks/useHistory';
import { useTheme } from './hooks/useTheme';
import { buildSvgString, downloadText } from './lib/exportSvg';
import { exportFileName, parseProjectFile, serializeProject } from './lib/projectFile';
import { loadProject, type ProjectData } from './lib/storage';

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

/** Tout ce que l'utilisateur peut modifier — donc tout ce que Ctrl+Z doit pouvoir restaurer. */
interface DocState {
  source: string;
  /** Positions choisies par l'utilisateur (les autres sont calculées automatiquement). */
  positions: Positions;
}

export default function App() {
  const { theme, toggle } = useTheme();
  const initial = useMemo(loadProject, []);

  const history = useHistory<DocState>(() => ({
    source: initial?.source ?? SAMPLE_SOURCE,
    positions: initial?.positions ?? {},
  }));
  const { source, positions: stored } = history.present;
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

  // 3) Positions effectives : celles de l'utilisateur + placement automatique des nouvelles classes seulement.
  const positions = useMemo(() => layoutNewClasses(diagram, stored), [diagram, stored]);

  // --- Actions (toutes passent par l'historique) -------------------------------------------


  /** Un glisser = une seule étape d'annulation : 'push' au premier mouvement, 'merge' ensuite. */
  const handleMove = useCallback(
    (name: string, p: Point, first: boolean) => {
      const apply = (s: DocState): DocState => ({ ...s, positions: { ...s.positions, ...positions, [name]: p } });
      if (first) history.push(apply);
      else history.merge(apply);
    },
    [positions, history.push, history.merge], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Au lâcher : une classe posée sur une autre glisse vers la place libre la plus proche (même étape d'annulation). */
  const handleDrop = useCallback(
    (name: string) => {
      const node = diagram.classes.find((c) => c.name === name);
      const p = positions[name];
      if (!node || !p) return;
      const others = diagram.classes
        .filter((c) => c.name !== name && positions[c.name])
        .map((c) => ({ ...positions[c.name], ...measureClass(c) }));
      const free = resolveOverlap(p, measureClass(node), others);
      if (free.x !== p.x || free.y !== p.y) history.merge((s) => ({ ...s, positions: { ...s.positions, [name]: free } }));
    },
    [diagram, positions, history.merge], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Édition depuis le canevas : on réécrit le script (le texte reste la source de vérité).
  const editSource = useCallback(
    (fn: (src: string) => string) => history.push((s) => ({ ...s, source: fn(s.source) })),
    [history.push], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const handleRelationChange = useCallback(
    (ref: RelationRef, change: RelationChange) => editSource((src) => updateRelation(src, ref, change)),
    [editSource],
  );
  const handleRelationDelete = useCallback((ref: RelationRef) => editSource((src) => deleteRelation(src, ref)), [editSource]);
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
      history.type((s) => ({ ...s, source: r.source }));
    },
    [source, viewLines, viewKey, editorMode, focusName, relationMode, history.type], // eslint-disable-line react-hooks/exhaustive-deps
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

  // 4) Persistance locale automatique.
  const project = useMemo<ProjectData>(() => ({ version: 1, source, positions }), [source, positions]);
  const saveStatus = useAutosave(project);

  const exportSvg = () => {
    const svg = buildSvgString(diagram, computeBoxes(diagram, positions), sceneTheme(theme));
    downloadText('diagramme.svg', svg, 'image/svg+xml');
  };

  // --- Import / export du projet ------------------------------------------------------------
  const fileInput = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const [fitKey, setFitKey] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const downloadProject = useCallback(() => {
    downloadText(exportFileName(), serializeProject(source, positions), 'application/json');
    setToast({ id: Date.now(), message: 'Projet exporté : code et position des classes.', tone: 'success' });
  }, [source, positions]);

  // Raccourcis globaux. Ctrl+Z est intercepté AUSSI dans l'éditeur : l'annulation native du
  // <textarea> ignorerait les modifications faites depuis le canevas et désynchroniserait tout.
  const { undo, redo } = history;

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
      history.push(() => ({ source: r.source, positions: r.positions }));
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
      else if (k === 'o') fileInput.current?.click();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, downloadProject]);

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
            {diagram.classes.length} classe{diagram.classes.length > 1 ? 's' : ''} · {diagram.relations.length} relation
            {diagram.relations.length > 1 ? 's' : ''}
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
        saveStatus={saveStatus}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        relationMode={relationMode}
        onRelationModeChange={setRelationMode}
      />
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
