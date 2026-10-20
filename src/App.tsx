import { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from './components/Canvas';
import { CodeEditor } from './components/CodeEditor';
import { SplitPane } from './components/SplitPane';
import { Toolbar } from './components/Toolbar';
import { computeBoxes, layoutNewClasses } from './core/layout';
import { parse } from './core/parser';
import { SAMPLE_SOURCE } from './core/sample';
import { sceneTheme } from './core/theme';
import type { Diagram, Point, Positions } from './core/types';
import { useAutosave } from './hooks/useAutosave';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useTheme } from './hooks/useTheme';
import { buildSvgString, downloadText } from './lib/exportSvg';
import { loadProject, type ProjectData } from './lib/storage';

export default function App() {
  const { theme, toggle } = useTheme();
  const initial = useMemo(loadProject, []);

  const [source, setSource] = useState(initial?.source ?? SAMPLE_SOURCE);
  const [stored, setStored] = useState<Positions>(initial?.positions ?? {});
  const [editorOpen, setEditorOpen] = useState(true);

  // 1) Parsing temps réel avec anti-rebond : la frappe reste fluide, le rendu suit ~150 ms après.
  const debounced = useDebouncedValue(source, 150);
  const result = useMemo(() => parse(debounced), [debounced]);

  // 2) Dernier rendu valide : si le script contient une erreur, le canevas ne « clignote » pas ni ne se vide.
  const [diagram, setDiagram] = useState<Diagram>(() => parse(initial?.source ?? SAMPLE_SOURCE).diagram);
  useEffect(() => {
    if (result.errors.length === 0) setDiagram(result.diagram);
  }, [result]);

  // 3) Positions effectives : celles de l'utilisateur + placement automatique des nouvelles classes seulement.
  const positions = useMemo(() => layoutNewClasses(diagram, stored), [diagram, stored]);

  const handleMove = useCallback(
    (name: string, p: Point) => setStored((s) => ({ ...s, ...positions, [name]: p })),
    [positions],
  );

  // 4) Persistance locale automatique.
  const project = useMemo<ProjectData>(() => ({ version: 1, source, positions }), [source, positions]);
  const saveStatus = useAutosave(project);

  const exportSvg = () => {
    const svg = buildSvgString(diagram, computeBoxes(diagram, positions), sceneTheme(theme));
    downloadText('diagramme.svg', svg, 'image/svg+xml');
  };
  const downloadProject = () => downloadText('projet.x-uml.json', JSON.stringify(project, null, 2), 'application/json');

  // Raccourci : Ctrl/Cmd+B pour escamoter l'éditeur (plus de place pour le canevas).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setEditorOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hasErrors = result.errors.length > 0;

  const editorPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <CodeEditor value={source} onChange={setSource} errors={result.errors} />
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
      />
      <SplitPane
        leftOpen={editorOpen}
        left={editorPanel}
        right={<Canvas diagram={diagram} positions={positions} theme={sceneTheme(theme)} onMove={handleMove} />}
      />
    </div>
  );
}
