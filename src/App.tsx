import { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from './components/Canvas';
import { CodeEditor } from './components/CodeEditor';
import { SplitPane } from './components/SplitPane';
import { Toolbar } from './components/Toolbar';
import { addRelation, deleteRelation, updateRelation, type RelationChange, type RelationRef } from './core/edit';
import { computeBoxes, layoutNewClasses } from './core/layout';
import { parse } from './core/parser';
import { SAMPLE_SOURCE } from './core/sample';
import { sceneTheme } from './core/theme';
import type { Diagram, Point, Positions, RelationKind } from './core/types';
import { useAutosave } from './hooks/useAutosave';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useHistory } from './hooks/useHistory';
import { useTheme } from './hooks/useTheme';
import { buildSvgString, downloadText } from './lib/exportSvg';
import { loadProject, type ProjectData } from './lib/storage';

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

  const setSourceTyped = useCallback((v: string) => history.type((s) => ({ ...s, source: v })), [history.type]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Un glisser = une seule étape d'annulation : 'push' au premier mouvement, 'merge' ensuite. */
  const handleMove = useCallback(
    (name: string, p: Point, first: boolean) => {
      const apply = (s: DocState): DocState => ({ ...s, positions: { ...s.positions, ...positions, [name]: p } });
      if (first) history.push(apply);
      else history.merge(apply);
    },
    [positions, history.push, history.merge], // eslint-disable-line react-hooks/exhaustive-deps
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

  // 4) Persistance locale automatique.
  const project = useMemo<ProjectData>(() => ({ version: 1, source, positions }), [source, positions]);
  const saveStatus = useAutosave(project);

  const exportSvg = () => {
    const svg = buildSvgString(diagram, computeBoxes(diagram, positions), sceneTheme(theme));
    downloadText('diagramme.svg', svg, 'image/svg+xml');
  };
  const downloadProject = () => downloadText('projet.x-uml.json', JSON.stringify(project, null, 2), 'application/json');

  // Raccourcis globaux. Ctrl+Z est intercepté AUSSI dans l'éditeur : l'annulation native du
  // <textarea> ignorerait les modifications faites depuis le canevas et désynchroniserait tout.
  const { undo, redo } = history;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) undo();
      else if ((k === 'z' && e.shiftKey) || k === 'y') redo();
      else if (k === 'b') setEditorOpen((o) => !o);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const hasErrors = result.errors.length > 0;

  const editorPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <CodeEditor value={source} onChange={setSourceTyped} errors={result.errors} />
      </div>
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
    <div className="flex h-full flex-col">
      <Toolbar
        theme={theme}
        onToggleTheme={toggle}
        editorOpen={editorOpen}
        onToggleEditor={() => setEditorOpen((o) => !o)}
        onExportSvg={exportSvg}
        onDownloadProject={downloadProject}
        saveStatus={saveStatus}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
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
          />
        }
      />
    </div>
  );
}
