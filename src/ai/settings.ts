import type { AiMode } from './prompt';
import { providerInfo, type AiSettings, type ProviderId } from './providers';

/*
 * Réglages de l'assistant, gardés dans ce navigateur uniquement.
 * La clé API est séparée du reste : elle ne va dans le stockage durable (localStorage) que si
 * l'élève coche « Mémoriser sur cet appareil » ; sinon elle disparaît à la fermeture de l'onglet.
 */

const SETTINGS_KEY = 'x-uml:ai';
const API_KEY = 'x-uml:ai-key';

export interface StoredAi {
  settings: AiSettings;
  remember: boolean;
  mode: AiMode;
  desktop: boolean;
}

function read(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, key: string, value: string | null) {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    /* stockage plein ou désactivé : les réglages restent en mémoire pour cette session */
  }
}

const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);

export function loadAi(): StoredAi {
  let saved: Partial<StoredAi & { provider: ProviderId; model: string; baseUrl: string }> = {};
  try {
    saved = JSON.parse(read(local(), SETTINGS_KEY) ?? '{}') as typeof saved;
  } catch {
    saved = {};
  }
  const provider = saved.provider ?? 'openrouter';
  const remember = saved.remember ?? false;
  const apiKey = read(remember ? local() : session(), API_KEY) ?? '';
  return {
    settings: { provider, apiKey, model: saved.model ?? providerInfo(provider).defaultModel, baseUrl: saved.baseUrl ?? providerInfo('custom').baseUrl ?? '' },
    remember,
    mode: saved.mode === 'assistant' ? 'assistant' : 'tutor',
    desktop: saved.desktop ?? false,
  };
}

export function saveAi(s: StoredAi) {
  const { apiKey, ...rest } = s.settings;
  write(local(), SETTINGS_KEY, JSON.stringify({ ...rest, remember: s.remember, mode: s.mode, desktop: s.desktop }));
  // La clé ne vit qu'à un seul endroit : jamais une copie oubliée dans l'autre stockage.
  write(s.remember ? local() : session(), API_KEY, apiKey || null);
  write(s.remember ? session() : local(), API_KEY, null);
}
