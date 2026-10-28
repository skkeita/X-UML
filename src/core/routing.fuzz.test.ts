import { it } from 'vitest';
import { computeBoxes, computeFrames, computeScene, layoutNewClasses } from './layout';
import { relationKey, routeEdges } from './routing';
import { parse } from './parser';
import { TEMPLATES } from './templates';

const others = ['Client', 'Adresse', 'Produit', 'Stock', 'Paiement', 'Facture', 'Livraison', 'Panier'];
let dense = 'class Commande {\n  + id: int\n}\n';
others.forEach((o, i) => { dense += `class ${o}\nCommande "1" ${['--', '-->', '*--', 'o--', '..>', '--|>', '..|>'][i % 7]} "0..*" ${o} : r${i}\n`; });
dense += 'Client --> Adresse\nPanier --> Produit\npackage P "Pk" : Stock, Paiement\ncolor Commande bleu "x"\nCommande --> Commande : self\n';

it('aucune disposition (boîtes superposées, même au pixel près) ne fait échouer le routage', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const sources = [dense, ...TEMPLATES.map((t) => t.source).filter(Boolean)];
  let runs = 0;
  for (const src of sources) {
    const d = parse(src).diagram;
    const base = layoutNewClasses(d, {});
    const names = Object.keys(base);
    for (let k = 0; k < 250; k++) {
      const pos = { ...base };
      // Un élément posé sur un autre (décalages faibles, parfois nuls), au pixel ou sur la grille.
      const a = names[Math.floor(rnd() * names.length)];
      const t = names[Math.floor(rnd() * names.length)];
      const jitter = () => (rnd() < 0.3 ? 0 : Math.round((rnd() - 0.5) * 120));
      pos[a] = { x: base[t].x + jitter(), y: base[t].y + jitter() };
      if (rnd() < 0.3) { const c = names[Math.floor(rnd() * names.length)]; pos[c] = { x: pos[a].x + jitter() / 4, y: pos[a].y }; }
      try {
        const boxes = computeBoxes(d, pos);
        const frames = computeFrames(d.groups ?? [], boxes);
        const shapes: Record<string, 'ellipse' | 'actor'> = {};
        for (const c of d.classes) if (c.kind === 'usecase') shapes[c.name] = 'ellipse'; else if (c.kind === 'actor') shapes[c.name] = 'actor';
        // Une fois sur deux, des extrémités placées à la main, sur des côtés quelconques.
        const sides = ['top', 'right', 'bottom', 'left'] as const;
        const anchors: Record<string, { start?: { side: (typeof sides)[number]; t: number }; end?: { side: (typeof sides)[number]; t: number } }> = {};
        if (rnd() < 0.5)
          d.relations.forEach((_, i) => {
            if (rnd() < 0.4) anchors[relationKey(d.relations, i)] = { ...(rnd() < 0.5 ? { start: { side: sides[Math.floor(rnd() * 4)], t: rnd() } } : {}), end: { side: sides[Math.floor(rnd() * 4)], t: rnd() } };
          });
        const edges = routeEdges(d.relations, { ...boxes, ...frames }, { frames: new Set(Object.keys(frames)), shapes, anchors });
        for (const e of edges) if (e.points.length < 2 || e.points.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) throw new Error('tracé invalide');
        runs++;
      } catch (e) {
        console.log('ÉCHEC', src.split('\n')[0], a, 'sur', t, JSON.stringify(pos));
        throw e;
      }
    }
  }

}, 120000);

it('cas signalé : trois classes reliées empilées au même endroit', () => {
  const d = parse(dense).diagram;
  const pos = { Commande: { x: 840, y: 330 }, Client: { x: 540, y: 40 }, Adresse: { x: 740, y: 40 }, Produit: { x: 940, y: 40 }, Stock: { x: 840, y: 330 }, Paiement: { x: 260, y: 210 }, Facture: { x: 840, y: 330 }, Livraison: { x: 740, y: 190 }, Panier: { x: 940, y: 190 } };
  const scene = computeScene(d, pos);
  for (const e of scene.edges) {
    if (e.points.length < 2) throw new Error('tracé incomplet');
  }
});
