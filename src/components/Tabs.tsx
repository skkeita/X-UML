import { useEffect, useRef, useState } from 'react';
import { TEMPLATES, type Template } from '../core/templates';
import type { Board } from '../lib/project';
import { CloseIcon } from './Icons';

interface Props {
  boards: Board[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: (t: Template) => void;
  onRename: (id: string, name: string) => void;
  onClose: (id: string) => void;
}

/**
 * Onglets des tableaux du projet. Double-clic pour renommer ; « + » propose un tableau vide
 * ou un exemple de chaque type de diagramme (on apprend la syntaxe en le modifiant).
 */
export function Tabs({ boards, activeId, onSelect, onAdd, onRename, onClose }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const commit = () => {
    if (editing && draft.trim()) onRename(editing, draft.trim());
    setEditing(null);
  };

  return (
    <nav
      aria-label="Tableaux du projet"
      className="relative flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-slate-200 bg-slate-100 px-2 dark:border-slate-800 dark:bg-slate-900/70"
    >
      <div role="tablist" className="flex items-end gap-0.5">
        {boards.map((b) => {
          const active = b.id === activeId;
          return (
            <div
              key={b.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => onSelect(b.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(b.id)}
              onDoubleClick={() => {
                setEditing(b.id);
                setDraft(b.name);
              }}
              title="Double-clic pour renommer"
              className={`group flex h-8 max-w-[200px] cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-3 text-xs ${
                active
                  ? 'border-slate-200 bg-white font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white'
                  : 'border-transparent text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60'
              }`}
            >
              {editing === b.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Nom du tableau"
                  className="h-6 w-32 rounded border border-indigo-300 bg-white px-1 text-xs text-slate-900 focus:outline-none dark:bg-slate-900 dark:text-white"
                />
              ) : (
                <span className="truncate">{b.name}</span>
              )}
              {boards.length > 1 && editing !== b.id && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(b.id);
                  }}
                  aria-label={`Fermer ${b.name}`}
                  title="Fermer ce tableau (Ctrl+Z pour annuler)"
                  className={`rounded px-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 ${active ? '' : 'opacity-0 group-hover:opacity-100'}`}
                >
                  <CloseIcon size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div ref={menuRef} className="relative self-center">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-haspopup="menu"
          aria-expanded={menu}
          title="Nouveau tableau"
          className="ml-1 flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          + Nouveau
        </button>
        {menu && (
          <div role="menu" className="fixed z-40 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onAdd(t);
                  setMenu(false);
                }}
                className="flex w-full flex-col rounded-md px-2.5 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="text-sm text-slate-800 dark:text-slate-100">{t.label}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{t.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
