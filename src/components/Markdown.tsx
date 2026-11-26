import { Fragment, type ReactNode } from 'react';

/*
 * Rendu Markdown minimal pour les réponses de l'IA : paragraphes, listes, titres, blocs de
 * code, `code`, **gras** et *italique*. Aucun HTML n'est interprété (tout passe en nœuds texte React) :
 * une réponse ne peut pas injecter de script dans la page.
 */

export interface CodeBlock {
  lang: string;
  code: string;
  /** Faux tant que la réponse arrive et que le bloc n'est pas fermé. */
  closed: boolean;
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|(?<![*\w])\*([^*\n]+)\*(?![*\w])/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      m[1] !== undefined ? (
        <code key={m.index} className="rounded bg-surface-2 px-1 py-px font-mono text-[0.92em]">
          {m[1]}
        </code>
      ) : m[2] !== undefined ? (
        <strong key={m.index} className="font-semibold">
          {m[2]}
        </strong>
      ) : (
        <em key={m.index}>{m[3]}</em>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function prose(text: string, keyBase: number): ReactNode[] {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let k = 0;
  while (k < lines.length) {
    const line = lines[k];
    if (!line.trim()) {
      k++;
      continue;
    }
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (k < lines.length && bullet.test(lines[k])) items.push(lines[k++].replace(bullet, ''));
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={`${keyBase}-${k}`} className={`my-1.5 space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-fg-muted`}>
          {items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </Tag>,
      );
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={`${keyBase}-${k}`} className="mb-1 mt-2.5 font-semibold first:mt-0">
          {inline(heading[1])}
        </p>,
      );
      k++;
      continue;
    }
    const para: string[] = [];
    while (k < lines.length && lines[k].trim() && !bullet.test(lines[k]) && !/^#{1,6}\s/.test(lines[k])) para.push(lines[k++]);
    blocks.push(
      <p key={`${keyBase}-${k}`} className="my-1.5 first:mt-0 last:mb-0">
        {para.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {inline(p)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return blocks;
}

export function Markdown({ text, renderCode }: { text: string; renderCode?: (block: CodeBlock, key: number) => ReactNode | null }) {
  const nodes: ReactNode[] = [];
  const re = /```([\w-]*)[ \t]*\r?\n([\s\S]*?)(```|$)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) nodes.push(...prose(text.slice(last, m.index), m.index));
    const block: CodeBlock = { lang: m[1].toLowerCase(), code: m[2].replace(/\s+$/, ''), closed: m[3] === '```' };
    nodes.push(
      renderCode?.(block, m.index) ?? (
        <pre key={m.index} className="my-2 overflow-x-auto rounded-md border border-line bg-canvas p-2.5 font-mono text-[12px] leading-relaxed">
          {block.code}
        </pre>
      ),
    );
    last = m.index + m[0].length;
    if (m[0].length === 0) break;
  }
  if (last < text.length) nodes.push(...prose(text.slice(last), last));
  return <>{nodes}</>;
}
