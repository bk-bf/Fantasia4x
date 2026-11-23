import { describe, expect, it } from 'vitest';
import { unknownGlyphs } from '$lib/pixelArt/fx/glyphs';
import dialog from '$lib/game/database/social/dialog.json';
import memories from '$lib/game/database/pawns/memories.json';
import conditions from '$lib/game/database/pawns/conditions.json';

const strings = (o: unknown): string[] =>
  typeof o === 'string'
    ? [o]
    : Array.isArray(o)
      ? o.flatMap(strings)
      : o && typeof o === 'object'
        ? Object.values(o).flatMap(strings)
        : [];

interface Def {
  name?: string;
  floater?: boolean;
}

const floaterDefs = (o: unknown): Def[] =>
  Array.isArray(o)
    ? o.flatMap(floaterDefs)
    : o && typeof o === 'object'
      ? [...((o as Def).floater ? [o as Def] : []), ...Object.values(o).flatMap(floaterDefs)]
      : [];

describe('floater lettering', () => {
  it('has a glyph for every condition name', () => {
    const texts = floaterDefs(conditions).map((d) => d.name ?? '');
    expect(texts.length).toBeGreaterThan(50);
    expect(texts.flatMap((t) => unknownGlyphs(t, true))).toEqual([]);
  });

  it('has a glyph for every combat word', () => {
    const words = [
      'PARRY',
      'BLOCK',
      'dodge',
      'Fractured!',
      'Organ hit!',
      'bleed',
      'No ammo',
      '-1234567890!'
    ];
    expect(words.flatMap((w) => unknownGlyphs(w, false))).toEqual([]);
  });

  it('has a glyph for every speech line', () => {
    const lines = [...strings(dialog), ...strings(memories)].filter((s) => !/^[a-z_]+$/.test(s));
    expect(lines.flatMap((t) => unknownGlyphs(t.replace(/\{[a-z]+\}/g, ''), true))).toEqual([]);
  });
});
