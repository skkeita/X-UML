/*
 * Fournisseurs d'IA appelés directement depuis le navigateur (X-UML n'a pas de serveur).
 * Seuls les fournisseurs qui l'autorisent (CORS) sont proposés : OpenAI, par exemple, refuse
 * les appels venant d'une page web et n'est donc pas dans la liste.
 */

export type ProviderId = 'openrouter' | 'gemini' | 'anthropic' | 'custom';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Mention courte affichée sur la carte de choix. */
  badge: string;
  note: string;
  /** Page où l'élève crée sa clé. */
  keyUrl?: string;
  keyPlaceholder: string;
  defaultModel: string;
  /** Modèles suggérés dans le champ (liste non exhaustive). */
  models: string[];
  /** URL de base de l'API compatible OpenAI (absente pour Anthropic, qui a son propre format). */
  baseUrl?: string;
  keyRequired: boolean;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    badge: 'Gratuit',
    note: 'Modèles gratuits, sans carte bancaire (quota quotidien limité). Le modèle « openrouter/free » choisit un modèle gratuit disponible.',
    keyUrl: 'https://openrouter.ai/settings/keys',
    keyPlaceholder: 'sk-or-…',
    defaultModel: 'openrouter/free',
    models: ['openrouter/free'],
    baseUrl: 'https://openrouter.ai/api/v1',
    keyRequired: true,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    badge: 'Gratuit',
    note: 'Offre gratuite avec une clé Google AI Studio (compte Google ; disponibilité selon le pays).',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIza…',
    defaultModel: 'gemini-flash-latest',
    models: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyRequired: true,
  },
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    badge: 'Payant',
    note: 'Clé de la Claude Console, facturée à l’usage (différente d’un abonnement claude.ai).',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    defaultModel: 'claude-haiku-5-5',
    models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
    keyRequired: true,
  },
  {
    id: 'custom',
    label: 'Autre (compatible OpenAI)',
    badge: 'Local ou autre',
    note: 'Ollama, LM Studio ou tout service compatible OpenAI qui accepte les appels depuis une page web. Pour Ollama : lancer avec OLLAMA_ORIGINS=https://skkeita.github.io.',
    keyPlaceholder: 'Facultatif',
    defaultModel: 'llama3.2',
    models: [],
    baseUrl: 'http://localhost:11434/v1',
    keyRequired: false,
  },
];

export const providerInfo = (id: ProviderId): ProviderInfo => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

export interface AiSettings {
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** Pour « Autre » uniquement. */
  baseUrl: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Erreur lisible par l'élève (message en français, sans jargon HTTP). */
export class AiError extends Error {}

export const isConfigured = (s: AiSettings): boolean => Boolean(s.model.trim()) && (!providerInfo(s.provider).keyRequired || Boolean(s.apiKey.trim()));

/** Traduit un échec HTTP en message utile. */
export function explainHttpError(status: number, body: string, provider: ProviderId): string {
  let detail = '';
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    detail = (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.message ?? '';
  } catch {
    detail = body.slice(0, 200);
  }
  const more = detail ? ` (${detail.trim().slice(0, 220)})` : '';
  if (status === 401 || status === 403) return `Clé refusée par ${providerInfo(provider).label} : vérifiez-la dans les réglages${more}.`;
  if (status === 429) return `Quota atteint chez ${providerInfo(provider).label} (offre gratuite limitée). Réessayez dans un moment${more}.`;
  if (status === 404) return `Modèle introuvable : vérifiez son nom dans les réglages${more}.`;
  if (status === 402) return `Crédit insuffisant sur ce compte${more}.`;
  if (status >= 500) return `${providerInfo(provider).label} est momentanément indisponible. Réessayez plus tard${more}.`;
  return `Requête refusée (code ${status})${more}.`;
}

/** Lit un flux « Server-Sent Events » ligne à ligne et rend chaque charge utile `data:`. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
      nl = buffer.indexOf('\n');
    }
  }
  const rest = buffer.trim();
  if (rest.startsWith('data:')) yield rest.slice(5).trim();
}

type FetchLike = typeof fetch;

/**
 * Envoie la conversation et transmet la réponse au fil de l'eau (onDelta reçoit chaque morceau).
 * Renvoie le texte complet. L'annulation passe par `signal` (bouton « Arrêter »).
 */
export async function streamChat(
  settings: AiSettings,
  system: string,
  messages: ChatMessage[],
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
  fetchFn: FetchLike = (...args) => fetch(...args),
): Promise<string> {
  const info = providerInfo(settings.provider);
  const anthropic = settings.provider === 'anthropic';
  const base = (settings.provider === 'custom' ? settings.baseUrl : info.baseUrl ?? '').replace(/\/+$/, '');

  const url = anthropic ? 'https://api.anthropic.com/v1/messages' : `${base}/chat/completions`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (anthropic) {
    headers['x-api-key'] = settings.apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
    // Autorise l'appel direct depuis le navigateur : la clé est celle de l'élève, saisie par lui.
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else if (settings.apiKey.trim()) {
    headers.authorization = `Bearer ${settings.apiKey.trim()}`;
  }
  const body = anthropic
    ? { model: settings.model.trim(), max_tokens: 4096, system, messages, stream: true }
    : { model: settings.model.trim(), stream: true, messages: [{ role: 'system', content: system }, ...messages] };

  let res: Response;
  try {
    res = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiError(
      settings.provider === 'custom'
        ? 'Connexion impossible : le service est-il lancé, et autorise-t-il les appels depuis cette page (CORS) ?'
        : 'Connexion impossible : vérifiez votre connexion Internet (ou un bloqueur de publicités).',
    );
  }
  if (!res.ok || !res.body) throw new AiError(explainHttpError(res.status, await res.text().catch(() => ''), settings.provider));

  let text = '';
  for await (const data of sseData(res.body)) {
    if (!data || data === '[DONE]') continue;
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (json.error) {
      const err = json.error as { message?: string };
      throw new AiError(`Le fournisseur a interrompu la réponse : ${err.message ?? 'erreur inconnue'}.`);
    }
    let chunk = '';
    if (anthropic) {
      const delta = json.delta as { type?: string; text?: string } | undefined;
      if (json.type === 'content_block_delta' && delta?.type === 'text_delta') chunk = delta.text ?? '';
    } else {
      const choices = json.choices as { delta?: { content?: string | null } }[] | undefined;
      chunk = choices?.[0]?.delta?.content ?? '';
    }
    if (chunk) {
      text += chunk;
      onDelta(chunk);
    }
  }
  if (!text.trim()) throw new AiError('Réponse vide du modèle. Réessayez, ou choisissez un autre modèle dans les réglages.');
  return text;
}
