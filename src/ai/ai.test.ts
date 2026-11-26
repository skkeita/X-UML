import { describe, expect, it } from 'vitest';
import { parse } from '../core/parser';
import { compactDiff, diffStats, lineDiff } from './diff';
import { contextBlock, extractProposal, syntaxReference, systemPrompt, type DiagramContext } from './prompt';
import { AiError, explainHttpError, isConfigured, streamChat, type AiSettings } from './providers';

describe('lineDiff', () => {
  it('repère ajouts et suppressions, garde le reste', () => {
    const d = lineDiff('class A\nclass B\nclass C', 'class A\nclass B2\nclass C\nclass D');
    expect(d).toEqual([
      { op: 'same', text: 'class A' },
      { op: 'del', text: 'class B' },
      { op: 'add', text: 'class B2' },
      { op: 'same', text: 'class C' },
      { op: 'add', text: 'class D' },
    ]);
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
  });

  it('textes identiques : aucun changement', () => {
    expect(diffStats(lineDiff('a\nb', 'a\nb'))).toEqual({ added: 0, removed: 0 });
  });

  it('compacte les longues zones inchangées', () => {
    const before = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n');
    const after = before.replace('l15', 'X');
    const chunks = compactDiff(lineDiff(before, after), 2);
    expect(chunks[0]).toEqual({ kind: 'skip', count: 13 });
    expect(chunks[chunks.length - 1]).toEqual({ kind: 'skip', count: 12 });
  });
});

describe('extractProposal', () => {
  it('prend le dernier bloc xuml fermé', () => {
    expect(extractProposal('Voici :\n```xuml\nclass A\n```\npuis\n```xuml\nclass B\n```')).toBe('class B');
  });
  it('ignore un bloc non fermé (réponse en cours) et les autres langages', () => {
    expect(extractProposal('```xuml\nclass A')).toBeNull();
    expect(extractProposal('```java\nclass A {}\n```')).toBeNull();
  });
});

const ctx: DiagramContext = {
  boardName: 'Zoo',
  diagramType: 'class',
  source: 'class Animal {\n  + nom string\n}\nAnimal -- Zoo',
  errors: [{ line: 2, message: 'Membre mal formé' }],
  issues: [{ id: 'x', level: 'warning', message: 'Zoo n’est pas déclaré', elements: ['Zoo'] }],
};

describe('consignes', () => {
  it('la référence de syntaxe contient tous les opérateurs et des exemples valides', () => {
    const ref = syntaxReference();
    for (const op of ['--', '-->', '--|>', '..|>', '..>', '*--', 'o--']) expect(ref).toContain(`\`A ${op} B\``);
    const blocks = [...ref.matchAll(/```xuml\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(blocks.length).toBeGreaterThan(4);
    for (const b of blocks) expect(parse(b).errors).toEqual([]);
  });

  it('le contexte cite les erreurs avec leur ligne et protège contre les consignes cachées', () => {
    const c = contextBlock(ctx);
    expect(c).toContain('ligne 2 : Membre mal formé');
    expect(c).toContain('+ nom string');
    expect(c).toMatch(/DONNÉE/);
    expect(c).toContain('Zoo n’est pas déclaré');
  });

  it('tuteur : jamais de solution complète ; assistant : script complet dans un bloc xuml', () => {
    const tutor = systemPrompt('tutor', ctx);
    expect(tutor).toMatch(/TUTEUR/);
    expect(tutor).toMatch(/Ne donne JAMAIS le script complet/);
    expect(tutor).not.toMatch(/## Ton rôle : ASSISTANT/);
    const assistant = systemPrompt('assistant', ctx);
    expect(assistant).toMatch(/script COMPLET mis à jour dans UN SEUL bloc ```xuml/);
  });
});

/** Réponse SSE simulée, découpée en morceaux arbitraires (comme sur le réseau). */
function sse(lines: string[], cut = 7): Response {
  const text = lines.map((l) => `${l}\n\n`).join('');
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += cut) c.enqueue(bytes.slice(i, i + cut));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const base: AiSettings = { provider: 'openrouter', apiKey: 'sk-or-test', model: 'openrouter/free', baseUrl: '' };

describe('streamChat', () => {
  it('format compatible OpenAI (OpenRouter) : URL, clé, messages, flux', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return sse([
        'data: {"choices":[{"delta":{"role":"assistant"}}]}',
        ': commentaire',
        'data: {"choices":[{"delta":{"content":"Bon"}}]}',
        'data: {"choices":[{"delta":{"content":"jour"}}]}',
        'data: [DONE]',
      ]);
    }) as unknown as typeof fetch;
    const chunks: string[] = [];
    const out = await streamChat(base, 'SYS', [{ role: 'user', content: 'Salut' }], (c) => chunks.push(c), undefined, fetchFn);
    expect(out).toBe('Bonjour');
    expect(chunks).toEqual(['Bon', 'jour']);
    expect(seen?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((seen?.init.headers as Record<string, string>).authorization).toBe('Bearer sk-or-test');
    const body = JSON.parse(seen?.init.body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(body.stream).toBe(true);
  });

  it('format Anthropic : en-têtes navigateur, system séparé, événements text_delta', async () => {
    let headers: Record<string, string> = {};
    let body: Record<string, unknown> = {};
    const fetchFn = (async (_url: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      body = JSON.parse(init.body as string);
      return sse([
        'event: message_start\ndata: {"type":"message_start"}',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}',
        'event: message_stop\ndata: {"type":"message_stop"}',
      ]);
    }) as unknown as typeof fetch;
    const out = await streamChat({ ...base, provider: 'anthropic', apiKey: 'sk-ant-x', model: 'claude-haiku-5-5' }, 'SYS', [{ role: 'user', content: 'Hi' }], () => {}, undefined, fetchFn);
    expect(out).toBe('OK');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers['x-api-key']).toBe('sk-ant-x');
    expect(body.system).toBe('SYS');
  });

  it('Gemini passe par son point d’accès compatible OpenAI', async () => {
    let url = '';
    const fetchFn = (async (u: string) => {
      url = u;
      return sse(['data: {"choices":[{"delta":{"content":"x"}}]}']);
    }) as unknown as typeof fetch;
    await streamChat({ ...base, provider: 'gemini', model: 'gemini-flash-latest' }, 'S', [], () => {}, undefined, fetchFn);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  });

  it('erreurs HTTP traduites pour l’élève', async () => {
    const fetchFn = (async () => new Response('{"error":{"message":"Rate limit"}}', { status: 429 })) as unknown as typeof fetch;
    await expect(streamChat(base, 'S', [], () => {}, undefined, fetchFn)).rejects.toThrow(/Quota atteint chez OpenRouter/);
    expect(explainHttpError(401, '', 'gemini')).toMatch(/Clé refusée par Google Gemini/);
  });

  it('réseau coupé ou CORS : message clair, de type AiError', async () => {
    const fetchFn = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(streamChat(base, 'S', [], () => {}, undefined, fetchFn)).rejects.toBeInstanceOf(AiError);
  });

  it('configuration : clé obligatoire sauf pour un service local', () => {
    expect(isConfigured({ ...base, apiKey: '' })).toBe(false);
    expect(isConfigured({ ...base, provider: 'custom', apiKey: '', model: 'llama3.2' })).toBe(true);
  });
});
