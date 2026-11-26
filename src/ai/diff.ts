/*
 * Différence ligne à ligne entre deux scripts (plus longue sous-séquence commune).
 * Sert à l'aperçu « Modification proposée » : l'élève voit exactement ce que l'IA change
 * avant de cliquer sur Appliquer.
 */

export type DiffOp = 'same' | 'add' | 'del';

export interface DiffLine {
  op: DiffOp;
  text: string;
}

/** Au-delà, la table LCS deviendrait trop lourde : on affiche « tout retiré / tout ajouté ». */
const MAX_CELLS = 4_000_000;

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');

  // Préfixe et suffixe communs retirés d'abord : la table ne couvre que la zone modifiée.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head: DiffLine[] = a.slice(0, start).map((text) => ({ op: 'same', text }));
  const tail: DiffLine[] = a.slice(endA).map((text) => ({ op: 'same', text }));
  const ma = a.slice(start, endA);
  const mb = b.slice(start, endB);

  if (ma.length * mb.length > MAX_CELLS) {
    return [...head, ...ma.map((text) => ({ op: 'del' as const, text })), ...mb.map((text) => ({ op: 'add' as const, text })), ...tail];
  }

  // lcs[i][j] = longueur de la plus longue sous-séquence commune de ma[i:] et mb[j:].
  const w = mb.length + 1;
  const lcs = new Uint32Array((ma.length + 1) * w);
  for (let i = ma.length - 1; i >= 0; i--) {
    for (let j = mb.length - 1; j >= 0; j--) {
      lcs[i * w + j] = ma[i] === mb[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }
  const middle: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < ma.length && j < mb.length) {
    if (ma[i] === mb[j]) {
      middle.push({ op: 'same', text: ma[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      middle.push({ op: 'del', text: ma[i++] });
    } else {
      middle.push({ op: 'add', text: mb[j++] });
    }
  }
  while (i < ma.length) middle.push({ op: 'del', text: ma[i++] });
  while (j < mb.length) middle.push({ op: 'add', text: mb[j++] });
  return [...head, ...middle, ...tail];
}

export type DiffChunk = { kind: 'lines'; lines: DiffLine[] } | { kind: 'skip'; count: number };

/**
 * Regroupe les lignes inchangées éloignées d'une modification en « … n lignes inchangées » :
 * l'aperçu reste court et l'œil va droit aux changements.
 */
export function compactDiff(lines: DiffLine[], context = 2): DiffChunk[] {
  const keep = lines.map(() => false);
  lines.forEach((l, k) => {
    if (l.op === 'same') return;
    for (let d = -context; d <= context; d++) if (lines[k + d]) keep[k + d] = true;
  });
  const chunks: DiffChunk[] = [];
  let k = 0;
  while (k < lines.length) {
    if (keep[k]) {
      const run: DiffLine[] = [];
      while (k < lines.length && keep[k]) run.push(lines[k++]);
      chunks.push({ kind: 'lines', lines: run });
    } else {
      let count = 0;
      while (k < lines.length && !keep[k]) {
        count++;
        k++;
      }
      chunks.push({ kind: 'skip', count });
    }
  }
  return chunks;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.op === 'add') added++;
    else if (l.op === 'del') removed++;
  }
  return { added, removed };
}
