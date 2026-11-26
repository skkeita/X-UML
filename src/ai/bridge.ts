/*
 * Pont Claude Desktop, côté page.
 *
 * L'extension X-UML (serveur MCP local, lancé par Claude Desktop) écoute sur 127.0.0.1.
 * La page s'y abonne (EventSource) : quand Claude appelle un outil, le serveur pousse la
 * requête ici, la page y répond par un POST. Rien ne passe par Internet : tout reste sur
 * l'ordinateur de l'élève, et le serveur n'accepte que la page X-UML (vérification d'origine).
 */

export const BRIDGE_PORT = 47811;
export const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;

export type BridgeStatus = 'off' | 'waiting' | 'connected';

export interface BridgeRequest {
  id: string;
  method: 'get_diagram' | 'propose_diagram' | 'get_syntax';
  params?: { script?: string; explanation?: string };
}

/** Réponse renvoyée à Claude : du texte, marqué comme erreur ou non. */
export interface BridgeReply {
  ok: boolean;
  text: string;
}

export type BridgeHandler = (req: BridgeRequest) => Promise<BridgeReply>;

export class DesktopBridge {
  private source: EventSource | null = null;

  constructor(
    private readonly handle: BridgeHandler,
    private readonly onStatus: (s: BridgeStatus) => void,
  ) {}

  start() {
    if (this.source || typeof EventSource === 'undefined') return;
    this.onStatus('waiting');
    const es = new EventSource(`${BRIDGE_URL}/events`);
    this.source = es;
    es.onopen = () => this.onStatus('connected');
    // Serveur absent (Claude Desktop fermé, extension non installée) : EventSource réessaie seul.
    es.onerror = () => this.onStatus('waiting');
    es.onmessage = (ev: MessageEvent<string>) => {
      let req: BridgeRequest;
      try {
        req = JSON.parse(ev.data) as BridgeRequest;
      } catch {
        return;
      }
      void this.handle(req)
        .catch((e: unknown) => ({ ok: false, text: `Erreur dans X-UML : ${(e as Error).message}` }))
        .then((reply) =>
          // text/plain : requête « simple », sans pré-vérification CORS supplémentaire.
          fetch(`${BRIDGE_URL}/reply`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ id: req.id, ...reply }) }),
        )
        .catch(() => {
          /* serveur arrêté entre-temps : Claude recevra un délai dépassé */
        });
    };
  }

  stop() {
    this.source?.close();
    this.source = null;
    this.onStatus('off');
  }
}

/** Entrée à ajouter dans claude_desktop_config.json (installation manuelle, avec Node.js). */
export const manualConfig = (path: string) =>
  JSON.stringify({ mcpServers: { 'x-uml': { command: 'node', args: [path] } } }, null, 2);
