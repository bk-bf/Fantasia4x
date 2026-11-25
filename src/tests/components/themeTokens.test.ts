import { describe, expect, it } from 'vitest';
import { THEMES, THEME_IDS, isThemeId } from '$lib/components/UI/theme/themes';
import { ambientPanelVars } from '$lib/components/UI/theme/ambientTokens';

const keys = (id: keyof typeof THEMES) =>
  [...Object.keys(THEMES[id].surface), ...Object.keys(THEMES[id].ink)].sort();

describe('panel themes', () => {
  it('every theme sets the same colour tokens', () => {
    for (const id of THEME_IDS) expect(keys(id)).toEqual(keys('timber'));
  });

  it('accepts only known theme ids', () => {
    expect(isThemeId('vellum')).toBe(true);
    expect(isThemeId('classic')).toBe(false);
  });

  it('passes the theme colours through untouched with the tint off', () => {
    const vars = ambientPanelVars(THEMES.vellum, false, [0.5, 0.6, 0.9], 0.4, 0.2);
    expect(vars).toContain('--bg-panel: #e6d5ad');
    expect(vars).toContain('--text: #2a1b10');
  });

  it('tints every token to a colour with the tint on', () => {
    const vars = ambientPanelVars(THEMES.timber, true, [0.55, 0.62, 0.95], 0.5, 0.2).split('; ');
    expect(vars).toHaveLength(keys('timber').length);
    for (const v of vars) expect(v).toMatch(/^--[a-z-]+: #[0-9a-f]{6}$/);
    expect(vars.find((v) => v.startsWith('--bg-panel:'))).not.toBe('--bg-panel: #24170c');
  });

  it('keeps vellum ink dark and its page light at night', () => {
    const vars = Object.fromEntries(
      ambientPanelVars(THEMES.vellum, true, [0.45, 0.5, 0.9], 0.6, 0.1)
        .split('; ')
        .map((v) => v.split(': '))
    );
    const luma = (hex: string) =>
      [1, 3, 5].reduce(
        (s, i, j) => s + parseInt(hex.slice(i, i + 2), 16) * [0.2126, 0.7152, 0.0722][j],
        0
      );
    expect(luma(vars['--bg-panel']) - luma(vars['--text'])).toBeGreaterThan(110);
    expect(luma(vars['--bg-panel']) - luma(vars['--text-muted'])).toBeGreaterThan(80);
  });
});
