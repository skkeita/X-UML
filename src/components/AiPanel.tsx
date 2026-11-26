import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DesktopBridge, manualConfig, type BridgeReply, type BridgeRequest, type BridgeStatus } from '../ai/bridge';
import { compactDiff, diffStats, lineDiff } from '../ai/diff';
import { contextBlock, extractProposal, syntaxReference, systemPrompt, type AiMode, type DiagramContext } from '../ai/prompt';
import { AiError, isConfigured, PROVIDERS, providerInfo, streamChat, type AiSettings, type ChatMessage, type ProviderId } from '../ai/providers';
import { loadAi, saveAi, type StoredAi } from '../ai/settings';
import { CheckIcon, ChatIcon, CloseIcon, GearIcon, ResetIcon, SendIcon, StopIcon } from './Icons';
import { LiquidSwitch } from './LiquidSwitch';
import { Markdown } from './Markdown';

/*
 * Panneau « Assistant IA » : l'élève travaille avec une IA sur le tableau ouvert.
 *
 * - Deux modes : Tuteur (guide, ne fait pas à la place) et Assistant (réalise les modifications).
 * - Deux façons de se connecter : une clé API personnelle (dont des offres gratuites), ou
 *   Claude Desktop via l'extension X-UML (pont local).
 * - Toute modification passe par un aperçu des différences, puis « Appliquer » (annulable).
 *
 * Le panneau reste monté quand il est fermé : la conversation et le pont survivent à la fermeture.
 */

type Stats = { added: number; removed: number };

interface Proposal {
  script: string;
  status: 'pending' | 'applied' | 'ignored';
  /** Ampleur du changement, figée au moment de la décision. */
  stats?: Stats;
}

interface UiMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  /** Message venu de Claude Desktop (et non du chat intégré). */
  desktop?: boolean;
  /** Proposition de Claude Desktop (les propositions du chat sont lues dans le texte). */
  proposal?: Proposal;
  /** Mode actif quand la réponse a été demandée : une proposition reste une proposition même si l'élève change de mode ensuite. */
  mode?: AiMode;
  error?: boolean;
}

interface Props {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  context: DiagramContext;
  /** Remplace le script du tableau actif (une entrée d'historique : Ctrl+Z annule). */
  onApply: (script: string) => void;
}

const QUICK: Record<AiMode, string[]> = {
  tutor: ['Relis mon diagramme et dis-moi ce qui ne va pas', 'Explique-moi mes erreurs', 'Composition ou agrégation : comment choisir ?', 'Quelle est la prochaine étape ?'],
  assistant: ['Corrige les erreurs du script', 'Ajoute les cardinalités manquantes', 'Complète les visibilités des membres'],
};

let nextId = 1;

export function AiPanel({ open, onOpen, onClose, context, onApply }: Props) {
  const [stored, setStored] = useState<StoredAi>(loadAi);
  const [view, setView] = useState<'chat' | 'settings'>(() => (isConfigured(loadAi().settings) ? 'chat' : 'settings'));
  const [messages, setMessages] = useState<UiMessage[]>([]);
  /** Statut des propositions du chat intégré, par identifiant de message. */
  const [chatProposals, setChatProposals] = useState<Record<number, { status: Proposal['status']; stats: Stats }>>({});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('off');
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const update = useCallback((patch: Partial<StoredAi>) => {
    setStored((s) => {
      const next = { ...s, ...patch };
      saveAi(next);
      return next;
    });
  }, []);
  const setSettings = (patch: Partial<AiSettings>) => update({ settings: { ...stored.settings, ...patch } });

  // Dernières valeurs, lues par le pont (qui vit hors du cycle de rendu).
  const live = useRef({ context, mode: stored.mode, onApply, onOpen });
  live.current = { context, mode: stored.mode, onApply, onOpen };
  /** Réponses en attente pour les propositions de Claude Desktop. */
  const desktopWaiting = useRef(new Map<number, (r: BridgeReply) => void>());

  // Défile vers le bas à chaque nouveau morceau de réponse.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  /* ------------------------------------------------------------ */
  /* Pont Claude Desktop                                          */
  /* ------------------------------------------------------------ */
  useEffect(() => {
    if (!stored.desktop) return;
    const handle = async (req: BridgeRequest): Promise<BridgeReply> => {
      const { context: ctx, mode } = live.current;
      if (req.method === 'get_syntax') return { ok: true, text: syntaxReference() };
      if (req.method === 'get_diagram') {
        const rule =
          mode === 'tutor'
            ? 'MODE TUTEUR : l’élève veut apprendre. Guide-le par étapes et par questions, sans jamais donner le script complet ni la ligne exacte de la solution. propose_diagram est désactivé.'
            : 'MODE ASSISTANT : tu peux modifier le diagramme avec propose_diagram (script complet) ; l’élève valide ou refuse.';
        return { ok: true, text: `${contextBlock(ctx)}\n\n${rule}` };
      }
      // propose_diagram
      if (mode === 'tutor') {
        return {
          ok: false,
          text: 'Refusé : l’élève est en mode tuteur. Ne modifie pas le diagramme ; explique plutôt le problème et donne un indice. (L’élève peut passer en mode Assistant dans X-UML.)',
        };
      }
      const script = req.params?.script ?? '';
      const id = nextId++;
      live.current.onOpen();
      setView('chat');
      setMessages((m) => [...m, { id, role: 'assistant', desktop: true, content: req.params?.explanation || 'Claude propose une modification du diagramme.', proposal: { script, status: 'pending' } }]);
      return new Promise<BridgeReply>((resolve) => desktopWaiting.current.set(id, resolve));
    };
    const bridge = new DesktopBridge(handle, setBridgeStatus);
    bridge.start();
    return () => bridge.stop();
  }, [stored.desktop]);

  const decideDesktop = (id: number, apply: boolean, stats: Stats) => {
    const msg = messages.find((m) => m.id === id);
    if (!msg?.proposal || msg.proposal.status !== 'pending') return;
    if (apply) onApply(msg.proposal.script);
    setMessages((ms) => ms.map((m) => (m.id === id && m.proposal ? { ...m, proposal: { ...m.proposal, status: apply ? 'applied' : 'ignored', stats } } : m)));
    desktopWaiting.current.get(id)?.({
      ok: true,
      text: apply ? 'L’élève a appliqué la modification. Le diagramme est à jour.' : 'L’élève a refusé la modification ; le diagramme n’a pas changé. Demande-lui ce qu’il souhaite.',
    });
    desktopWaiting.current.delete(id);
  };

  /* ------------------------------------------------------------ */
  /* Chat intégré                                                 */
  /* ------------------------------------------------------------ */
  const configured = isConfigured(stored.settings);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy || !configured) return;
    setInput('');
    const userMsg: UiMessage = { id: nextId++, role: 'user', content: question };
    const reply: UiMessage = { id: nextId++, role: 'assistant', content: '', mode: stored.mode };
    // L'historique envoyé exclut les échanges de Claude Desktop (conversation distincte) et les erreurs.
    const history: ChatMessage[] = [...messages.filter((m) => !m.desktop && !m.error && m.content), userMsg]
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, userMsg, reply]);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      await streamChat(
        stored.settings,
        systemPrompt(stored.mode, context),
        history,
        (chunk) => setMessages((ms) => ms.map((m) => (m.id === reply.id ? { ...m, content: m.content + chunk } : m))),
        ctrl.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        const message = e instanceof AiError ? e.message : `Erreur inattendue : ${(e as Error).message}`;
        setMessages((ms) => ms.map((m) => (m.id === reply.id ? { ...m, content: m.content ? `${m.content}\n\n${message}` : message, error: true } : m)));
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const reset = () => {
    abort.current?.abort();
    for (const [id, resolve] of desktopWaiting.current) {
      resolve({ ok: true, text: 'L’élève a effacé la conversation sans appliquer la modification.' });
      desktopWaiting.current.delete(id);
    }
    setMessages([]);
    setChatProposals({});
  };

  const applyChat = (id: number, script: string, apply: boolean, stats: Stats) => {
    if (apply) onApply(script);
    setChatProposals((p) => ({ ...p, [id]: { status: apply ? 'applied' : 'ignored', stats } }));
  };

  return (
    <aside
      aria-label="Assistant IA"
      // Fermé : masqué mais monté (la conversation et le pont Claude Desktop sont conservés).
      // Petit écran : panneau plein écran par-dessus le diagramme. Grand écran : colonne à droite.
      className={`${open ? 'flex' : 'hidden'} fixed inset-x-0 bottom-0 top-12 z-30 animate-panel-in-right flex-col border-l border-line bg-surface md:static md:z-auto md:w-[380px] md:shrink-0`}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="text-accent-strong">
          <ChatIcon />
        </span>
        <h2 className="text-[13px] font-semibold">Assistant IA</h2>
        {bridgeStatus === 'connected' && (
          <span className="flex items-center gap-1 text-[11px] text-fg-muted" title="Claude Desktop est relié à ce tableau">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-strong" aria-hidden="true" />
            Claude Desktop
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" className="xu-btn !h-7 !px-1.5" title="Nouvelle conversation" onClick={reset} disabled={messages.length === 0}>
            <ResetIcon />
          </button>
          <button type="button" className="xu-btn !h-7 !px-1.5" aria-pressed={view === 'settings'} title="Connexion et réglages" onClick={() => setView((v) => (v === 'settings' ? 'chat' : 'settings'))}>
            <GearIcon />
          </button>
          <button type="button" className="xu-btn !h-7 !px-1.5" title="Fermer le panneau" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </header>

      {/* Mode : le choix pédagogique le plus important, toujours visible. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-2">
        <LiquidSwitch
          ariaLabel="Rôle de l’IA"
          value={stored.mode}
          onChange={(mode) => update({ mode })}
          options={[
            { value: 'tutor', label: 'Tuteur', title: 'L’IA guide par des explications, des indices et des questions, sans faire à votre place.' },
            { value: 'assistant', label: 'Assistant', title: 'L’IA réalise les modifications demandées ; vous les validez avant qu’elles s’appliquent.' },
          ]}
        />
        <p className="min-w-0 text-[11.5px] leading-snug text-fg-muted">
          {stored.mode === 'tutor' ? 'Guide pas à pas, sans donner la solution.' : 'Modifie le diagramme, après votre accord.'}
        </p>
      </div>

      {view === 'settings' ? (
        <Settings stored={stored} update={update} setSettings={setSettings} bridgeStatus={bridgeStatus} onDone={() => setView('chat')} />
      ) : (
        <>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-[13.5px] leading-relaxed" aria-live="polite">
            {messages.length === 0 ? (
              <Welcome mode={stored.mode} configured={configured} desktop={bridgeStatus === 'connected'} onSetup={() => setView('settings')} onAsk={(q) => void send(q)} />
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => (
                  <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
                    {m.role === 'user' ? (
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-surface-2 px-3 py-2">{m.content}</p>
                    ) : (
                      <div className={m.error ? 'text-red-700 dark:text-red-400' : ''}>
                        {m.desktop && <p className="mb-1 text-[11px] font-medium text-fg-muted">Claude Desktop</p>}
                        {m.content ? (
                          <Markdown
                            text={m.content}
                            renderCode={(b, key) => {
                              // Proposition du chat : réponse demandée en mode Assistant, et bloc complet.
                              if (m.desktop || m.mode !== 'assistant' || !b.closed || !['xuml', 'x-uml', 'uml', 'plantuml'].includes(b.lang)) return null;
                              if (extractProposal(m.content) !== b.code) return null; // seul le dernier bloc est proposé
                              return (
                                <ProposalCard
                                  key={key}
                                  current={context.source}
                                  script={b.code}
                                  status={chatProposals[m.id]?.status ?? 'pending'}
                                  frozen={chatProposals[m.id]?.stats}
                                  onDecide={(a, st) => applyChat(m.id, b.code, a, st)}
                                />
                              );
                            }}
                          />
                        ) : (
                          <p className="text-fg-muted">
                            <span className="inline-block animate-pulse">Réflexion…</span>
                          </p>
                        )}
                        {m.proposal && (
                          <ProposalCard current={context.source} script={m.proposal.script} status={m.proposal.status} frozen={m.proposal.stats} onDecide={(a, st) => decideDesktop(m.id, a, st)} />
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form
            className="shrink-0 border-t border-line p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div className="flex items-end gap-2 rounded-lg border border-line bg-canvas p-1.5 focus-within:border-accent-strong">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={Math.min(6, Math.max(1, input.split('\n').length))}
                disabled={!configured}
                aria-label="Message pour l’IA"
                placeholder={
                  !configured
                    ? 'Connectez une IA dans les réglages pour discuter ici'
                    : stored.mode === 'tutor'
                      ? 'Posez une question sur votre diagramme…'
                      : 'Décrivez la modification à faire…'
                }
                className="min-h-[28px] flex-1 resize-none bg-transparent px-1.5 py-1 text-[13.5px] placeholder:text-fg-muted focus:outline-none disabled:cursor-not-allowed"
              />
              {busy ? (
                <button type="button" onClick={() => abort.current?.abort()} className="xu-btn !h-8 !px-2" title="Arrêter la réponse">
                  <StopIcon />
                </button>
              ) : (
                <button type="submit" disabled={!configured || !input.trim()} className="xu-btn-primary !h-8 !px-2.5 disabled:opacity-40" title="Envoyer (Entrée)">
                  <SendIcon />
                </button>
              )}
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-fg-muted">
              {configured ? `${providerInfo(stored.settings.provider).label} · ${stored.settings.model}` : 'Aucune IA connectée'} · l’IA peut se tromper, vérifiez ses réponses.
            </p>
          </form>
        </>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */

function Welcome({ mode, configured, desktop, onSetup, onAsk }: { mode: AiMode; configured: boolean; desktop: boolean; onSetup: () => void; onAsk: (q: string) => void }) {
  if (!configured) {
    return (
      <div className="rounded-lg border border-line p-3.5">
        <p className="font-medium">Connectez une IA pour travailler avec elle</p>
        <p className="mt-1 text-[13px] text-fg-muted">
          Gratuit avec OpenRouter ou Google Gemini (une clé suffit, sans carte bancaire), ou avec Claude Desktop grâce à l’extension X-UML.
        </p>
        {desktop && <p className="mt-2 text-[13px]">Claude Desktop est déjà relié : posez vos questions directement dans l’application Claude.</p>}
        <button type="button" className="xu-btn-primary mt-3" onClick={onSetup}>
          Choisir une IA
        </button>
      </div>
    );
  }
  return (
    <div>
      <p className="text-fg-muted">
        {mode === 'tutor'
          ? 'Je vous aide à comprendre et à corriger votre diagramme, étape par étape. Je ne donne pas la solution : je vous mets sur la piste.'
          : 'Dites-moi ce qu’il faut changer : je prépare la modification, vous voyez les différences, puis vous choisissez de l’appliquer.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUICK[mode].map((q) => (
          <button key={q} type="button" onClick={() => onAsk(q)} className="rounded-full border border-line px-2.5 py-1 text-left text-[12px] text-fg hover:border-accent-strong">
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Aperçu d'une modification : différences ligne à ligne, puis Appliquer / Ignorer.
 * Tant qu'elle attend, la comparaison suit le script actuel (ce que « Appliquer » changerait
 * vraiment). Une fois décidée, la carte se fige et se replie : elle ne compare plus avec un
 * script qui a pu évoluer depuis.
 */
function ProposalCard({
  current,
  script,
  status,
  frozen,
  onDecide,
}: {
  current: string;
  script: string;
  status: Proposal['status'];
  frozen?: Stats;
  onDecide: (apply: boolean, stats: Stats) => void;
}) {
  const diff = useMemo(() => lineDiff(current.replace(/\s+$/, ''), script), [current, script]);
  const liveStats = diffStats(diff);
  const stats = frozen ?? liveStats;
  const chunks = useMemo(() => compactDiff(diff), [diff]);
  const pending = status === 'pending';
  const unchanged = pending && liveStats.added === 0 && liveStats.removed === 0;
  const decide = (apply: boolean) => onDecide(apply, liveStats);
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-line bg-canvas">
      <div className={`flex items-center gap-2 px-2.5 py-1.5 text-[12px] ${pending ? 'border-b border-line' : ''}`}>
        <span className="font-medium">{pending ? 'Modification proposée' : status === 'applied' ? 'Modification appliquée' : 'Modification ignorée'}</span>
        {!unchanged && (
          <span className="font-mono text-fg-muted">
            <span className="text-accent-strong">+{stats.added}</span> −{stats.removed}
          </span>
        )}
        {status === 'applied' && (
          <span className="ml-auto flex items-center gap-1 text-[11.5px] text-fg-muted">
            <span className="text-accent-strong">
              <CheckIcon />
            </span>
            Ctrl+Z pour annuler
          </span>
        )}
      </div>
      {pending &&
        (unchanged ? (
          <p className="px-2.5 py-2 text-[12.5px] text-fg-muted">Identique au script actuel : rien à appliquer.</p>
        ) : (
          <div className="max-h-72 overflow-auto py-1 font-mono text-[11.5px] leading-[1.55]">
            {chunks.map((c, i) =>
              c.kind === 'skip' ? (
                <p key={i} className="px-2.5 py-0.5 font-sans text-[11px] text-fg-muted">
                  … {c.count} ligne{c.count > 1 ? 's' : ''} inchangée{c.count > 1 ? 's' : ''}
                </p>
              ) : (
                c.lines.map((l, j) => (
                  <div
                    key={`${i}-${j}`}
                    className={`flex whitespace-pre px-2.5 ${l.op === 'add' ? 'bg-accent-soft text-fg' : l.op === 'del' ? 'text-fg-muted line-through decoration-fg-muted/60' : 'text-fg-muted'}`}
                  >
                    <span className={`w-4 shrink-0 select-none ${l.op === 'add' ? 'text-accent-strong' : ''}`} aria-label={l.op === 'add' ? 'ajouté' : l.op === 'del' ? 'retiré' : undefined}>
                      {l.op === 'add' ? '+' : l.op === 'del' ? '−' : ' '}
                    </span>
                    {l.text || ' '}
                  </div>
                ))
              ),
            )}
          </div>
        ))}
      {pending && (
        <div className="flex items-center gap-2 border-t border-line px-2.5 py-2">
          <button type="button" className="xu-btn-primary !h-7" disabled={unchanged} onClick={() => decide(true)}>
            Appliquer
          </button>
          <button type="button" className="xu-btn !h-7" onClick={() => decide(false)}>
            Ignorer
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] leading-snug text-fg-muted">{hint}</span>}
    </label>
  );
}

const INPUT = 'h-8 w-full rounded-md border border-line-strong/60 bg-canvas px-2 text-[13px] placeholder:text-fg-muted focus:border-accent-strong focus:outline-none';

function Settings({
  stored,
  update,
  setSettings,
  bridgeStatus,
  onDone,
}: {
  stored: StoredAi;
  update: (p: Partial<StoredAi>) => void;
  setSettings: (p: Partial<AiSettings>) => void;
  bridgeStatus: BridgeStatus;
  onDone: () => void;
}) {
  const s = stored.settings;
  const info = providerInfo(s.provider);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'error'; text?: string }>({ state: 'idle' });

  const choose = (id: ProviderId) => {
    if (id === s.provider) return;
    // Changer de fournisseur : la clé de l'ancien ne vaut rien chez le nouveau.
    setSettings({ provider: id, model: providerInfo(id).defaultModel, apiKey: '' });
    setTest({ state: 'idle' });
  };

  const runTest = async () => {
    setTest({ state: 'running' });
    try {
      const out = await streamChat(s, 'Réponds uniquement par le mot : OK', [{ role: 'user', content: 'Test de connexion' }], () => {});
      setTest({ state: 'ok', text: `Connexion réussie (réponse : « ${out.trim().slice(0, 40)} »).` });
    } catch (e) {
      setTest({ state: 'error', text: (e as Error).message });
    }
  };

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-3 text-[13px]">
      <section>
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-fg-muted">IA dans ce panneau</h3>
        <div role="radiogroup" aria-label="Fournisseur" className="grid grid-cols-2 gap-1.5">
          {PROVIDERS.map((p) => {
            const active = p.id === s.provider;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => choose(p.id)}
                className={`rounded-lg border px-2.5 py-2 text-left ${active ? 'border-accent-strong bg-accent-soft' : 'border-line hover:border-line-strong'}`}
              >
                <span className="block text-[12.5px] font-medium leading-tight">{p.label}</span>
                <span className={`mt-0.5 block text-[11px] ${p.badge === 'Gratuit' ? 'font-medium text-accent-strong' : 'text-fg-muted'}`}>{p.badge}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] leading-snug text-fg-muted">{info.note}</p>

        <div className="mt-3 space-y-3">
          <Field
            label={info.keyRequired ? 'Clé API' : 'Clé API (facultative)'}
            hint={
              info.keyUrl ? (
                <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-strong underline underline-offset-2">
                  Créer une clé {info.badge === 'Gratuit' ? 'gratuite ' : ''}chez {info.label}
                </a>
              ) : undefined
            }
          >
            <div className="flex gap-1.5">
              <input
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={s.apiKey}
                onChange={(e) => setSettings({ apiKey: e.target.value })}
                placeholder={info.keyPlaceholder}
                className={`${INPUT} font-mono`}
              />
              <button type="button" className="xu-btn !h-8 shrink-0" onClick={() => setShowKey((v) => !v)}>
                {showKey ? 'Masquer' : 'Afficher'}
              </button>
            </div>
          </Field>
          {s.provider === 'custom' && (
            <Field label="Adresse de l’API" hint="Doit se terminer par /v1 (format compatible OpenAI).">
              <input value={s.baseUrl} onChange={(e) => setSettings({ baseUrl: e.target.value })} className={`${INPUT} font-mono`} spellCheck={false} />
            </Field>
          )}
          <Field label="Modèle">
            <input list="xu-models" value={s.model} onChange={(e) => setSettings({ model: e.target.value })} className={`${INPUT} font-mono`} spellCheck={false} />
            <datalist id="xu-models">
              {info.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={stored.remember} onChange={(e) => update({ remember: e.target.checked })} className="mt-0.5 accent-[rgb(var(--accent-strong))]" />
            <span>
              Mémoriser la clé sur cet appareil
              <span className="block text-[11.5px] text-fg-muted">Sinon elle est oubliée à la fermeture de l’onglet. À laisser décoché sur un ordinateur partagé.</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="xu-btn-primary" disabled={!isConfigured(s) || test.state === 'running'} onClick={() => void runTest()}>
              {test.state === 'running' ? 'Test en cours…' : 'Tester la connexion'}
            </button>
            {isConfigured(s) && (
              <button type="button" className="xu-btn" onClick={onDone}>
                Ouvrir la discussion
              </button>
            )}
          </div>
          {test.text && (
            <p role="status" className={`text-[12.5px] ${test.state === 'error' ? 'text-red-700 dark:text-red-400' : 'text-fg'}`}>
              {test.text}
            </p>
          )}
          <p className="rounded-md bg-surface-2 px-2.5 py-2 text-[11.5px] leading-snug text-fg-muted">
            Le script du tableau ouvert et vos messages sont envoyés directement depuis votre navigateur à {info.label}, selon ses conditions. X-UML n’a pas de
            serveur : il ne voit ni vos messages ni votre clé.
          </p>
        </div>
      </section>

      <section className="border-t border-line pt-4">
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-fg-muted">Claude Desktop</h3>
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block font-medium">Connexion à Claude Desktop</span>
            <span className="block text-[11.5px] text-fg-muted">
              {bridgeStatus === 'connected'
                ? 'Connecté : Claude peut lire ce tableau et, en mode Assistant, proposer des modifications.'
                : bridgeStatus === 'waiting'
                  ? 'En attente de Claude Desktop (application ouverte et extension installée ?)'
                  : 'Désactivée'}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={stored.desktop}
            aria-label="Connexion à Claude Desktop"
            onClick={() => update({ desktop: !stored.desktop })}
            className={`relative h-5 w-9 shrink-0 rounded-full ${stored.desktop ? 'bg-accent-strong' : 'bg-slate-300 dark:bg-slate-600'}`}
          >
            <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${stored.desktop ? 'translate-x-4' : ''}`} />
          </button>
        </div>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[12.5px] leading-snug">
          <li>
            Téléchargez l’extension{' '}
            <a href="./x-uml.mcpb" download className="font-medium text-accent-strong underline underline-offset-2">
              x-uml.mcpb
            </a>{' '}
            et ouvrez-la : Claude Desktop propose de l’installer.
          </li>
          <li>Activez « Connexion à Claude Desktop » ci-dessus. Si le navigateur demande l’accès aux applications de cet appareil, autorisez-le.</li>
          <li>Dans Claude Desktop, écrivez par exemple : « Aide-moi sur mon diagramme X-UML ».</li>
        </ol>
        <p className="mt-2 text-[11.5px] leading-snug text-fg-muted">
          Tout se passe sur votre ordinateur (connexion locale). Fonctionne dans Chrome, Edge et Firefox ; Safari bloque cette connexion. L’accès aux extensions peut dépendre de
          votre offre Claude : sans abonnement, OpenRouter et Gemini restent gratuits.
        </p>
        <details className="mt-2 text-[12px]">
          <summary className="cursor-pointer text-fg-muted hover:text-fg">Installation manuelle (avec Node.js)</summary>
          <p className="mt-1.5 text-[11.5px] text-fg-muted">
            Téléchargez{' '}
            <a href="./x-uml-mcp.mjs" download className="font-medium text-accent-strong underline underline-offset-2">
              x-uml-mcp.mjs
            </a>
            , puis dans Claude Desktop : Paramètres → Développeur → Modifier la configuration, et ajoutez (en remplaçant le chemin) :
          </p>
          <pre className="mt-1.5 overflow-x-auto rounded-md border border-line bg-canvas p-2 font-mono text-[11px]">{manualConfig('C:\\Users\\vous\\Téléchargements\\x-uml-mcp.mjs')}</pre>
        </details>
      </section>
    </div>
  );
}
