/*
 * Construit l'extension Claude Desktop « x-uml.mcpb » (et une copie du serveur seul) dans public/,
 * pour qu'elles soient téléchargeables depuis le site. Lancé avant chaque build et chaque dev.
 *
 * Un .mcpb est une archive zip contenant manifest.json et le serveur. Le zip est écrit ici à la
 * main (fichiers stockés sans compression) : aucune dépendance à installer.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const server = readFileSync('mcp/server.mjs');

const manifest = {
  manifest_version: '0.3',
  name: 'x-uml',
  display_name: 'X-UML',
  version: '1.0.0',
  description: 'Relie Claude à X-UML : Claude lit le diagramme UML ouvert et, en mode assistant, propose des modifications que l’élève valide.',
  long_description:
    'Ouvrez X-UML dans le navigateur, panneau « Assistant IA », puis activez « Connexion à Claude Desktop ». En mode tuteur, Claude guide sans donner la solution ; en mode assistant, il propose des modifications que l’élève applique ou refuse.',
  author: { name: 'skkeita', url: 'https://github.com/skkeita' },
  homepage: pkg.homepage,
  repository: { type: 'git', url: pkg.repository.url },
  license: 'MIT',
  keywords: ['uml', 'diagramme', 'éducation'],
  server: {
    type: 'node',
    entry_point: 'server/index.mjs',
    mcp_config: { command: 'node', args: ['${__dirname}/server/index.mjs'] },
  },
  tools: [
    { name: 'get_diagram', description: 'Lire le diagramme ouvert dans X-UML (script, erreurs, mode tuteur ou assistant).' },
    { name: 'get_syntax', description: 'Référence de la syntaxe X-UML.' },
    { name: 'propose_diagram', description: 'Proposer une modification, que l’élève applique ou refuse.' },
  ],
  compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: '>=18.0.0' } },
};

/* ---- zip « stocké » (méthode 0) ---- */
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  // Date fixe (1er janvier 2026) : l'archive est identique d'un build à l'autre.
  const time = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version requise
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(0, 8); // stocké
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralSize = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

mkdirSync('public', { recursive: true });
writeFileSync(
  'public/x-uml.mcpb',
  zip([
    { name: 'manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) },
    { name: 'server/index.mjs', data: server },
  ]),
);
writeFileSync('public/x-uml-mcp.mjs', server);
console.log('Extension Claude Desktop : public/x-uml.mcpb');
