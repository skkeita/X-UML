import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * Test de bout en bout du serveur MCP : Claude Desktop est simulé sur stdin/stdout,
 * la page X-UML est simulée par un client HTTP (abonnement SSE + réponses POST).
 */
const PORT = 47900 + Math.floor(Math.random() * 90);
const ORIGIN = 'https://skkeita.github.io';
let proc: ChildProcessWithoutNullStreams;
let out = '';
const waiters: ((m: Record<string, unknown>) => void)[] = [];
const byId = new Map<number, (m: Record<string, unknown>) => void>();

function rpc(id: number, method: string, params?: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    byId.set(id, resolve);
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

beforeAll(async () => {
  proc = spawn(process.execPath, ['mcp/server.mjs'], { env: { ...process.env, X_UML_PORT: String(PORT) } });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (c: string) => {
    out += c;
    let nl = out.indexOf('\n');
    while (nl >= 0) {
      const msg = JSON.parse(out.slice(0, nl)) as Record<string, unknown>;
      out = out.slice(nl + 1);
      const cb = byId.get(msg.id as number);
      if (cb) cb(msg);
      else waiters.shift()?.(msg);
      nl = out.indexOf('\n');
    }
  });
  // Attend que le port soit ouvert.
  for (let i = 0; i < 50; i++) {
    const ok = await new Promise<boolean>((r) => http.get({ port: PORT, path: '/status', headers: { origin: ORIGIN } }, (res) => r(res.statusCode === 200)).on('error', () => r(false)));
    if (ok) break;
    await new Promise((r) => setTimeout(r, 50));
  }
});
afterAll(() => proc.kill());

/** Page X-UML simulée : s'abonne et répond à chaque demande via `answer`. */
function fakePage(answer: (req: { id: string; method: string; params?: Record<string, string> }) => { ok: boolean; text: string }) {
  return new Promise<http.ClientRequest>((resolve) => {
    const req = http.get({ port: PORT, path: '/events', headers: { origin: ORIGIN } }, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (c: string) => {
        buf += c;
        let end = buf.indexOf('\n\n');
        while (end >= 0) {
          const block = buf.slice(0, end);
          buf = buf.slice(end + 2);
          if (block.includes('event: hello')) resolve(req);
          const data = block.split('\n').find((l) => l.startsWith('data: ') && !block.includes('event:'));
          if (data) {
            const r = JSON.parse(data.slice(6));
            const body = JSON.stringify({ id: r.id, ...answer(r) });
            const post = http.request({ port: PORT, path: '/reply', method: 'POST', headers: { origin: ORIGIN, 'content-type': 'text/plain' } });
            post.end(body);
          }
          end = buf.indexOf('\n\n');
        }
      });
    });
  });
}

describe('serveur MCP X-UML', () => {
  it('initialize et tools/list', async () => {
    const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect((init.result as { serverInfo: { name: string } }).serverInfo.name).toBe('x-uml');
    expect((init.result as { protocolVersion: string }).protocolVersion).toBe('2025-06-18');
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const list = await rpc(2, 'tools/list');
    expect((list.result as { tools: { name: string }[] }).tools.map((t) => t.name)).toEqual(['get_diagram', 'get_syntax', 'propose_diagram']);
  });

  it('sans page connectée : message clair, marqué comme erreur', async () => {
    const r = await rpc(3, 'tools/call', { name: 'get_diagram', arguments: {} });
    const res = r.result as { isError: boolean; content: { text: string }[] };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Connexion à Claude Desktop/);
  });

  it('refuse une origine inconnue', async () => {
    const code = await new Promise<number | undefined>((r) => http.get({ port: PORT, path: '/events', headers: { origin: 'https://pirate.example' } }, (res) => r(res.statusCode)));
    expect(code).toBe(403);
  });

  it('relaie lecture et proposition entre Claude et la page', async () => {
    const page = await fakePage((req) =>
      req.method === 'get_diagram'
        ? { ok: true, text: 'class A' }
        : { ok: true, text: `appliqué : ${req.params?.script} / ${req.params?.explanation}` },
    );
    const read = await rpc(4, 'tools/call', { name: 'get_diagram', arguments: {} });
    expect((read.result as { content: { text: string }[] }).content[0].text).toBe('class A');
    const prop = await rpc(5, 'tools/call', { name: 'propose_diagram', arguments: { script: 'class B', explanation: 'ajout' } });
    const res = prop.result as { isError: boolean; content: { text: string }[] };
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toBe('appliqué : class B / ajout');
    page.destroy();
  });

  it('méthode inconnue → erreur JSON-RPC', async () => {
    const r = await rpc(6, 'resources/list');
    expect((r.error as { code: number }).code).toBe(-32601);
  });
});
