import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { RelationChange, RelationRef } from '../core/edit';
import { displayName } from '../core/layout';
import type { MemberDraft } from '../core/modelEdit';
import { NAMED_COLORS } from '../core/parser';
import type { ClassNode, Diagram, DiagramType, Group, Member, RelationKind, Visibility } from '../core/types';
import { DIAGRAM_TYPE_ORDER, ELEMENT_LABEL, NAME_OF, VOCABULARIES, elementKindOf, type ElementKind, type Vocabulary } from '../core/vocabulary';
import { CloseIcon, CopyIcon, TrashIcon } from './Icons';
import { RelationsPanel } from './RelationsPanel';

/*
 * Panneau « Visuel » : tout le diagramme se construit sans écrire une ligne de code.
 * On ajoute un élément en tapant son nom, on règle le reste avec des menus et des champs.
 * Chaque action réécrit le script : le mode Code montre exactement ce qui a été construit.
 */

export interface InspectorActions {
  onTypeChange: (type: DiagramType) => void;
  onAdd: (kind: ElementKind, name: string) => string;
  onRename: (name: string, next: string) => void;
  onLabel: (name: string, label: string) => void;
  onKind: (name: string, kind: ElementKind) => void;
  onParents: (name: string, parents: string[], interfaces: string[]) => void;
  onMembers: (name: string, members: MemberDraft[]) => void;
  onObjectType: (name: string, type: string) => void;
  onGroup: (name: string, group: string | null) => void;
  onRenameGroup: (group: Group, title: string) => void;
  onUngroup: (group: Group) => void;
  onColor: (names: string[], color: string | null, label: string) => void;
  onDelete: (names: string[]) => void;
  onDuplicate: (names: string[]) => string[];
  onRelationChange: (ref: RelationRef, change: RelationChange) => void;
  onRelationDelete: (ref: RelationRef) => void;
  onRelationAdd: (from: string, to: string, kind: RelationKind, label?: string) => void;
}

interface Props extends InspectorActions {
  diagram: Diagram;
  vocab: Vocabulary;
  /** Type choisi explicitement pour le tableau (sinon déduit du contenu). */
  chosenType?: DiagramType;
  selected: string | null;
  onSelect: (name: string | null) => void;
}

const FIELD =
  'h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const VISIBILITY: { v: Visibility; label: string }[] = [
  { v: '+', label: '+ public' },
  { v: '-', label: '- privé' },
  { v: '#', label: '# protégé' },
  { v: '~', label: '~ paquetage' },
];

const isClassFamily = (k: ElementKind) => k === 'class' || k === 'abstract' || k === 'interface' || k === 'enum';

/** Pastille de la nature d'un élément (lisible d'un coup d'œil dans la liste). */
function KindIcon({ kind }: { kind: ElementKind }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true } as const;
  switch (kind) {
    case 'actor':
      return (
        <svg {...common}>
          <circle cx="12" cy="5" r="3" />
          <path d="M12 8v7M6 11h12M12 15l-4 6M12 15l4 6" strokeLinecap="round" />
        </svg>
      );
    case 'usecase':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="10" ry="6" />
        </svg>
      );
    case 'system':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
        </svg>
      );
    case 'package':
      return (
        <svg {...common}>
          <path d="M3 8V5h7l1 3h10v11H3z" />
        </svg>
      );
    case 'object':
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="10" rx="1" />
          <path d="M7 14h10" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M3 15h18" />
        </svg>
      );
  }
}

/** Champ texte validé à la sortie ou avec Entrée (une étape d'annulation par modification). */
function CommitInput({
  value,
  onCommit,
  placeholder,
  label,
  className = FIELD,
  autoFocus,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft.trim() !== value.trim()) onCommit(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setDraft(value);
      const el = e.currentTarget;
      requestAnimationFrame(() => el.blur());
    }
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      placeholder={placeholder}
      aria-label={label}
      autoFocus={autoFocus}
      className={className}
    />
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-3 py-3 dark:border-slate-800/80">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Liste de membres (attributs, opérations ou valeurs) éditable ligne par ligne. */
function MemberList({
  title,
  members,
  placeholder,
  addLabel,
  withVisibility,
  onChange,
}: {
  title: string;
  members: Member[];
  placeholder: string;
  addLabel: string;
  withVisibility: boolean;
  onChange: (members: MemberDraft[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const drafts: MemberDraft[] = members.map((m) => ({ visibility: m.visibility, text: m.text }));
  const update = (i: number, patch: Partial<MemberDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className={LABEL}>{title}</span>
        <button type="button" onClick={() => setAdding(true)} className="rounded px-1.5 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
          {addLabel}
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {drafts.map((d, i) => (
          <li key={`${i}-${d.text}`} className="flex items-center gap-1">
            {withVisibility && (
              <select
                value={d.visibility}
                onChange={(e) => update(i, { visibility: e.target.value as Visibility })}
                aria-label={`Visibilité de ${d.text}`}
                title="Visibilité"
                className="h-8 w-[104px] shrink-0 rounded-md border border-slate-200 bg-white px-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                {VISIBILITY.map((v) => (
                  <option key={v.v} value={v.v}>
                    {v.label}
                  </option>
                ))}
              </select>
            )}
            <CommitInput value={d.text} onCommit={(text) => update(i, { text })} label={`${title} : ${d.text}`} className={`${FIELD} font-mono text-[13px]`} />
            <button
              type="button"
              onClick={() => onChange(drafts.filter((_, j) => j !== i))}
              aria-label={`Retirer ${d.text}`}
              title="Retirer"
              className="flex h-8 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
            >
              <CloseIcon />
            </button>
          </li>
        ))}
        {adding && (
          <li className="flex items-center gap-1">
            <CommitInput
              value=""
              autoFocus
              placeholder={placeholder}
              label={`Nouveau : ${title}`}
              className={`${FIELD} font-mono text-[13px]`}
              onCommit={(text) => {
                setAdding(false);
                if (text.trim()) onChange([...drafts, { visibility: withVisibility ? (title === 'Attributs' ? '-' : '+') : '+', text: text.trim() }]);
              }}
            />
          </li>
        )}
        {drafts.length === 0 && !adding && <li className="text-xs text-slate-400">Aucun pour l’instant.</li>}
      </ul>
    </div>
  );
}

export function Inspector(p: Props) {
  const { diagram, vocab, selected } = p;
  const [adding, setAdding] = useState<ElementKind | null>(null);
  const [query, setQuery] = useState('');
  const pending = useRef<string | null>(null);
  const node = selected ? diagram.classes.find((c) => c.name === selected) : undefined;

  // L'élément créé apparaît après l'analyse du script (~150 ms) : on le sélectionne dès qu'il existe.
  useEffect(() => {
    if (pending.current && diagram.classes.some((c) => c.name === pending.current)) {
      p.onSelect(pending.current);
      pending.current = null;
    }
  }, [diagram]); // eslint-disable-line react-hooks/exhaustive-deps

  const elements = diagram.classes.map((c) => ({ name: c.name, label: displayName(c) }));
  const list = diagram.classes.filter((c) => !query.trim() || displayName(c).toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950" data-inspector="">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Type de diagramme : il décide des éléments et des relations proposés */}
        <Section title="Diagramme">
          <select
            value={vocab.type}
            onChange={(e) => p.onTypeChange(e.target.value as DiagramType)}
            aria-label="Type de diagramme"
            className={FIELD}
          >
            {DIAGRAM_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {VOCABULARIES[t].title}
              </option>
            ))}
          </select>
          {!p.chosenType && <p className="mt-1 text-[11px] text-slate-400">Déduit du contenu du tableau.</p>}
        </Section>

        {node ? (
          <ElementSheet {...p} node={node} elements={elements} />
        ) : (
          <>
            <Section title="Ajouter">
              <div className="flex flex-wrap gap-1.5">
                {vocab.create.map((c) => (
                  <button
                    key={c.kind}
                    type="button"
                    title={c.hint}
                    onClick={() => setAdding(c.kind)}
                    aria-pressed={adding === c.kind}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                      adding === c.kind
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                        : 'border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900'
                    }`}
                  >
                    <KindIcon kind={c.kind} />+ {c.label}
                  </button>
                ))}
              </div>
              {adding && (
                <form
                  className="mt-2 flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = (e.currentTarget.elements.namedItem('name') as HTMLInputElement | null)?.value ?? '';
                    if (!input.trim()) return;
                    pending.current = p.onAdd(adding, input);
                    setAdding(null);
                  }}
                >
                  <input
                    name="name"
                    autoFocus
                    placeholder={NAME_OF[adding]}
                    aria-label={NAME_OF[adding]}
                    onKeyDown={(e) => e.key === 'Escape' && setAdding(null)}
                    className={FIELD}
                  />
                  <button type="submit" className="h-8 shrink-0 rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-500">
                    Ajouter
                  </button>
                </form>
              )}
            </Section>

            <Section
              title={`${vocab.elements.charAt(0).toUpperCase()}${vocab.elements.slice(1)} (${diagram.classes.length})`}
              aside={
                diagram.classes.length > 6 ? (
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filtrer…"
                    aria-label="Filtrer la liste"
                    className="h-6 w-28 rounded border border-slate-200 bg-white px-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                ) : undefined
              }
            >
              {diagram.classes.length === 0 ? (
                <p className="text-xs leading-relaxed text-slate-400">Le tableau est vide. Commencez par ajouter {vocab.create[0]?.withArticle} ci-dessus.</p>
              ) : (
                <ul className="flex flex-col">
                  {list.map((c) => {
                    const k = elementKindOf(c);
                    return (
                      <li key={c.name}>
                        <button
                          type="button"
                          onClick={() => p.onSelect(c.name)}
                          data-element-row={c.name}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                        >
                          <span className="text-slate-400">
                            <KindIcon kind={k} />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{displayName(c)}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">{ELEMENT_LABEL[k]}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            {(diagram.groups?.length ?? 0) > 0 && (
              <Section title={`Groupes (${diagram.groups?.length})`}>
                <ul className="flex flex-col gap-1.5">
                  {diagram.groups?.map((g) => (
                    <li key={`${g.name}-${g.line}`} data-group-row={g.title} className="flex items-center gap-1.5">
                      <span className="w-[74px] shrink-0 text-[11px] text-slate-400">
                        {g.kind === 'package' ? 'Paquetage' : g.kind === 'system' ? 'Système' : 'Cadre'}
                      </span>
                      <CommitInput value={g.title} onCommit={(v) => v.trim() && p.onRenameGroup(g, v)} label={`Titre du groupe ${g.title}`} className={`${FIELD} h-7 text-[13px]`} />
                      <button
                        type="button"
                        onClick={() => p.onUngroup(g)}
                        title={`Dégrouper : le cadre disparaît, ses ${g.members.length} élément${g.members.length > 1 ? 's' : ''} restent`}
                        className="h-7 shrink-0 rounded-md border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                      >
                        Dégrouper
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <div className="px-3 py-3">
              <RelationsPanel
                embedded
                relations={diagram.relations}
                elements={elements}
                filter={null}
                vocab={vocab}
                onChange={p.onRelationChange}
                onDelete={p.onRelationDelete}
                onAdd={p.onRelationAdd}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Fiche de l'élément sélectionné : nom, nature, héritage, membres, appartenance, couleur, relations. */
function ElementSheet(p: Props & { node: ClassNode; elements: { name: string; label: string }[] }) {
  const { node, diagram, vocab } = p;
  const kind = elementKindOf(node);
  const classLike = isClassFamily(kind);
  const name = node.name;
  const color = diagram.style?.colors[name];
  const legend = diagram.style?.legend ?? [];

  // Généralisations et réalisations déclarées (relations déduites de « extends » / « implements »).
  const parents = diagram.relations.filter((r) => r.from === name && r.via === 'extends').map((r) => r.to);
  const interfaces = diagram.relations.filter((r) => r.from === name && r.via === 'implements').map((r) => r.to);
  const classes = diagram.classes.filter((c) => c.name !== name && isClassFamily(elementKindOf(c)));
  const interfaceNames = classes.filter((c) => c.stereotype === 'interface').map((c) => c.name);
  const parentCandidates = classes.filter((c) => (kind === 'interface' ? c.stereotype === 'interface' : c.stereotype !== 'interface' && c.stereotype !== 'enum'));

  // Conteneurs possibles : paquetages / systèmes existants (groupes, ou éléments qui le deviendront).
  const groups = (diagram.groups ?? []).filter((g) => g.kind !== 'frame' && g.name !== name);
  const containerNodes = diagram.classes.filter(
    (c) => c.name !== name && (c.kind === 'system' || c.kind === 'package') && !groups.some((g) => g.name === c.name) && vocab.type !== 'context',
  );
  const containers = [...groups.map((g) => ({ name: g.name, label: g.title })), ...containerNodes.map((c) => ({ name: c.name, label: displayName(c) }))];
  const currentGroup = groups.find((g) => g.members.includes(name))?.name ?? '';

  // Natures proposées : celles du diagramme, dans la même famille (on ne perd jamais de membres).
  const kindChoices = [...new Set<ElementKind>([kind, ...vocab.create.map((c) => c.kind), ...(classLike ? (['class', 'abstract', 'interface', 'enum'] as ElementKind[]) : [])])].filter(
    (k) => isClassFamily(k) === classLike || node.members.length === 0,
  );

  const { attrs, methods } = { attrs: node.members.filter((m) => m.kind === 'attribute'), methods: node.members.filter((m) => m.kind === 'method') };
  const setMembers = (nextAttrs: MemberDraft[], nextMethods: MemberDraft[]) => p.onMembers(name, [...nextAttrs, ...nextMethods]);
  const draft = (ms: Member[]): MemberDraft[] => ms.map((m) => ({ visibility: m.visibility, text: m.text }));

  return (
    <div data-element-sheet={name}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => p.onSelect(null)}
          className="rounded px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-200"
        >
          ← Tous les {vocab.elements}
        </button>
        <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          <KindIcon kind={kind} />
          {ELEMENT_LABEL[kind]}
        </span>
      </div>

      <Section title="Identité">
        <label className={LABEL} htmlFor="sheet-name">
          Nom
        </label>
        {classLike || kind === 'object' ? (
          <CommitInput key={name} value={name} onCommit={(v) => p.onRename(name, v)} label="Nom" placeholder="Nom" />
        ) : (
          <CommitInput key={name} value={displayName(node)} onCommit={(v) => p.onLabel(name, v)} label="Nom" placeholder="Nom" />
        )}
        {classLike && <p className="mt-1 text-[11px] text-slate-400">Sans espace : « compte client » devient « CompteClient ».</p>}

        {kind === 'object' && (
          <div className="mt-3">
            <label className={LABEL}>Classe de l’objet</label>
            <CommitInput key={`${name}-type`} value={node.classifier ?? ''} onCommit={(v) => p.onObjectType(name, v)} label="Classe de l’objet" placeholder="ex. Commande" />
          </div>
        )}

        <div className="mt-3">
          <label className={LABEL}>Nature</label>
          <select value={kind} onChange={(e) => p.onKind(name, e.target.value as ElementKind)} aria-label="Nature" className={FIELD}>
            {kindChoices.map((k) => (
              <option key={k} value={k}>
                {ELEMENT_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </Section>

      {classLike && kind !== 'enum' && (
        <Section title="Héritage">
          <label className={LABEL}>{kind === 'interface' ? 'Spécialise l’interface' : 'Hérite de'}</label>
          <select
            value={parents[0] ?? ''}
            onChange={(e) => p.onParents(name, e.target.value ? [e.target.value] : [], interfaces)}
            aria-label={kind === 'interface' ? 'Interface parente' : 'Classe parente'}
            className={FIELD}
          >
            <option value="">— aucune —</option>
            {parentCandidates.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          {kind !== 'interface' && interfaceNames.length > 0 && (
            <div className="mt-3">
              <span className={LABEL}>Réalise les interfaces</span>
              <div className="flex flex-col gap-1">
                {interfaceNames.map((i) => (
                  <label key={i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={interfaces.includes(i)}
                      onChange={(e) => p.onParents(name, parents, e.target.checked ? [...interfaces, i] : interfaces.filter((x) => x !== i))}
                      className="h-3.5 w-3.5 accent-indigo-600"
                    />
                    {i}
                  </label>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {classLike && (
        <Section title={kind === 'enum' ? 'Valeurs' : 'Membres'}>
          {kind === 'enum' ? (
            <MemberList title="Valeurs" members={node.members} placeholder="ex. EN_ATTENTE" addLabel="+ Valeur" withVisibility={false} onChange={(m) => p.onMembers(name, m)} />
          ) : (
            <>
              {kind !== 'interface' && (
                <MemberList title="Attributs" members={attrs} placeholder="nom : Type   (ex. prix: double)" addLabel="+ Attribut" withVisibility onChange={(m) => setMembers(m, draft(methods))} />
              )}
              <MemberList
                title="Opérations"
                members={methods}
                placeholder="nom(paramètre: Type): Retour"
                addLabel="+ Opération"
                withVisibility
                onChange={(m) => setMembers(draft(attrs), m.map((d) => ({ ...d, text: d.text.includes('(') ? d.text : `${d.text}()` })))}
              />
            </>
          )}
        </Section>
      )}

      {containers.length > 0 && (
        <Section title="Appartenance">
          <label className={LABEL}>Contenu dans</label>
          <select value={currentGroup} onChange={(e) => p.onGroup(name, e.target.value || null)} aria-label="Contenu dans" className={FIELD}>
            <option value="">— aucun —</option>
            {containers.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
          </select>
        </Section>
      )}

      <Section title="Couleur">
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Couleur">
          {Object.entries(NAMED_COLORS).map(([cname, hex]) => (
            <button
              key={cname}
              type="button"
              role="radio"
              aria-checked={color === hex}
              aria-label={cname}
              title={cname}
              onClick={() => p.onColor([name], hex, legend.find((e) => e.color === hex)?.label ?? legend.find((e) => e.color === color)?.label ?? '')}
              className={`h-6 w-6 rounded-md border ${color === hex ? 'border-indigo-600 ring-2 ring-indigo-400' : 'border-slate-300 dark:border-slate-600'}`}
              style={{ background: hex }}
            />
          ))}
          {color && (
            <button type="button" onClick={() => p.onColor([name], null, '')} className="ml-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
              Aucune
            </button>
          )}
        </div>
        {color && (
          <div className="mt-2">
            <CommitInput
              key={`${name}-${color}`}
              value={legend.find((e) => e.color === color)?.label ?? ''}
              onCommit={(v) => p.onColor([name], color, v)}
              label="Nom dans la légende"
              placeholder="Nom dans la légende (facultatif)"
            />
          </div>
        )}
      </Section>

      <div className="border-b border-slate-100 px-3 py-3 dark:border-slate-800/80">
        <RelationsPanel
          embedded
          relations={diagram.relations}
          elements={p.elements}
          filter={name}
          vocab={vocab}
          onChange={p.onRelationChange}
          onDelete={p.onRelationDelete}
          onAdd={p.onRelationAdd}
        />
      </div>

      <div className="flex gap-2 px-3 py-3">
        <button
          type="button"
          onClick={() => {
            const [copy] = p.onDuplicate([name]);
            if (copy) p.onSelect(copy);
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          <CopyIcon /> Dupliquer
        </button>
        <button
          type="button"
          onClick={() => {
            p.onDelete([name]);
            p.onSelect(null);
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <TrashIcon /> Supprimer
        </button>
      </div>
    </div>
  );
}
