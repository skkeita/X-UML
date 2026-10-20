import { describe, expect, it } from 'vitest';
import { setColor, setCorners, setLegendVisible } from './edit';
import { parse } from './parser';

describe('apparence décrite dans le code', () => {
  it('couleurs, légende, coins', () => {
    const { diagram, errors } = parse(`class A
class B
actor C
color A, B #FCA5A5 "Métier"
color C bleu "Acteurs"
color B #fca5a5 "Métier"
style square
legend "Légende du projet"`);
    expect(errors).toHaveLength(0);
    expect(diagram.style?.colors).toEqual({ A: '#fca5a5', B: '#fca5a5', C: '#bfdbfe' });
    expect(diagram.style?.legend).toEqual([
      { color: '#fca5a5', label: 'Métier' },
      { color: '#bfdbfe', label: 'Acteurs' },
    ]);
    expect(diagram.style?.corners).toBe('square');
    expect(diagram.style?.legendTitle).toBe('Légende du projet');
    // Une ligne de couleur ne crée pas d'élément
    expect(diagram.classes.map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });

  it('sans directive : pas de style', () => {
    expect(parse('class A').diagram.style).toBeUndefined();
  });

  it('legend off masque la légende ; #abc est accepté', () => {
    const d = parse('class A\ncolor A #abc "x"\nlegend off').diagram;
    expect(d.style?.legendHidden).toBe(true);
    expect(d.style?.colors.A).toBe('#aabbcc');
  });
});

describe('édition de l’apparence depuis l’interface', () => {
  it('colorer, regrouper sur la même ligne, déplacer, retirer', () => {
    let s = 'class A\nclass B\nclass C';
    s = setColor(s, ['A'], '#fecaca', 'Métier');
    expect(s).toContain('color A #fecaca "Métier"');
    s = setColor(s, ['B'], '#fecaca', 'Métier');
    expect(s).toContain('color A, B #fecaca "Métier"');
    s = setColor(s, ['A'], '#bfdbfe');
    expect(s).toContain('color B #fecaca "Métier"');
    expect(s).toContain('color A #bfdbfe');
    s = setColor(s, ['B'], null);
    expect(s).not.toContain('#fecaca');
    expect(parse(s).diagram.style?.colors).toEqual({ A: '#bfdbfe' });
  });

  it('coins et légende', () => {
    let s = setCorners('class A', 'square');
    expect(parse(s).diagram.style?.corners).toBe('square');
    s = setCorners(s, 'rounded');
    expect(s.trim()).toBe('class A');
    s = setLegendVisible(s, false);
    expect(parse(s).diagram.style?.legendHidden).toBe(true);
    expect(setLegendVisible(s, true).trim()).toBe('class A');
  });
});
