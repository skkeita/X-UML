import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOTION, PALETTE, luminance } from './theme';

/** Variables CSS déclarées dans un bloc (`:root { … }` ou `.dark { … }`) de src/index.css. */
function block(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('\n  }', start));
  const vars = new Map<string, string>();
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars.set(m[1], m[2].trim());
  return vars;
}

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const root = block(css, ':root');
const dark = new Map([...root, ...block(css, '.dark')]);

/** Résout `var(--x)` puis convertit « R V B » en #RRGGBB. */
function hex(vars: Map<string, string>, name: string): string {
  let v = vars.get(name) ?? '';
  for (let ref = /^var\(--([\w-]+)\)$/.exec(v); ref; ref = /^var\(--([\w-]+)\)$/.exec(v)) v = vars.get(ref[1]) ?? '';
  return `#${v.split(/\s+/).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('charte : theme.ts ↔ index.css', () => {
  it.each(Object.keys(PALETTE.light) as (keyof typeof PALETTE.light)[])('rôle %s identique dans les deux fichiers', (role) => {
    expect(hex(root, role)).toBe(PALETTE.light[role]);
    expect(hex(dark, role)).toBe(PALETTE.dark[role]);
  });

  it('jetons de mouvement identiques', () => {
    expect(root.get('ease')).toBe(MOTION.ease);
    expect(root.get('dur-fast')).toBe(`${MOTION.fast}ms`);
    expect(root.get('dur-base')).toBe(`${MOTION.base}ms`);
    expect(root.get('dur-slow')).toBe(`${MOTION.slow}ms`);
  });
});

describe('charte : contraste AA', () => {
  it.each(['light', 'dark'] as const)('mode %s', (mode) => {
    const p = PALETTE[mode];
    for (const surface of [p.bg, p.surface, p['surface-2']]) {
      expect(contrast(p.fg, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p['fg-muted'], surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p['accent-strong'], surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(p['accent-strong'], p['accent-soft'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p['accent-ink'], p.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p['accent-ink'], p['accent-hover'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p['line-strong'], p.surface)).toBeGreaterThanOrEqual(3); // contour de champ
  });
});
