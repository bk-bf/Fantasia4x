import { describe, expect, it } from 'vitest';
import { LOOKS, ensureLooks, rollColouring, rollPawnLook } from '$lib/game/core/rules/body/looks';
import { colouringLine } from '$lib/game/core/gen/cultureDescription';
import { generateCulture } from '$lib/game/core/gen/culture';
import { buildPawnFromCulture } from '$lib/game/core/gen/pawnBuild';
import { CULTURE_LORE } from '$lib/game/core/defs/cultureLore';
import type { ColourPreference } from '$lib/game/core/types';

const WORDS = CULTURE_LORE.phrases.colouring;
const lean = (top: string, keys: string[], weight: number) =>
  Object.fromEntries(keys.map((k) => [k, k === top ? weight : 1]));

describe('culture colouring', () => {
  it('rolls the same preference for the same culture and leans each part one way', () => {
    const a = rollColouring('drakast');
    expect(rollColouring('drakast')).toEqual(a);
    for (const part of ['skin', 'hair', 'eyes'] as const) {
      expect(Object.keys(a[part])).toEqual(LOOKS[part].keys);
      expect(Math.max(...Object.values(a[part]))).toBeGreaterThan(1);
    }
  });

  it('words a strong lean as what most of them are, and no lean as none shared', () => {
    const strong: ColourPreference = {
      skin: lean('dark', LOOKS.skin.keys, 20),
      hair: lean('black', LOOKS.hair.keys, 1),
      eyes: lean('green', LOOKS.eyes.keys, 1)
    };
    expect(colouringLine(strong)).toBe(`Most are ${WORDS.skin.dark}.`);
    const flat: ColourPreference = {
      skin: lean('dark', LOOKS.skin.keys, 1),
      hair: lean('black', LOOKS.hair.keys, 1),
      eyes: lean('green', LOOKS.eyes.keys, 1)
    };
    expect(colouringLine(flat)).toBe(WORDS.lines.none);
  });

  it('a generated culture carries its colouring and words it without numbers', () => {
    const c = generateCulture();
    expect(c.colouring).toBeDefined();
    const line = colouringLine(c.colouring!);
    expect(c.lore.description.endsWith(line)).toBe(true);
    expect(line).not.toMatch(/\d/);
  });
});

describe('pawn looks', () => {
  const pref = rollColouring('marsh');

  it('never gives a woman a beard or a man a style only women wear', () => {
    for (let i = 0; i < 200; i++) {
      const w = rollPawnLook({ id: `p${i}`, name: 'N', sex: 'female', age: 30 }, pref);
      expect(w.beard).toBe('none');
      const m = rollPawnLook({ id: `p${i}`, name: 'N', sex: 'male', age: 30 }, pref);
      expect(LOOKS.styles[m.style].male).toBeGreaterThan(0);
    }
  });

  it('greys only with age', () => {
    const young = Array.from({ length: 200 }, (_, i) =>
      rollPawnLook({ id: `y${i}`, name: 'N', sex: 'male', age: 20 }, pref)
    );
    const old = Array.from({ length: 200 }, (_, i) =>
      rollPawnLook({ id: `o${i}`, name: 'N', sex: 'male', age: 70 }, pref)
    );
    expect(young.some((l) => l.hair === 'grey')).toBe(false);
    expect(old.filter((l) => l.hair === 'grey' || l.hair === 'white').length).toBeGreaterThan(100);
  });

  it('a built pawn has a look drawn from its culture', () => {
    const culture = generateCulture();
    const pawn = buildPawnFromCulture(culture, 0);
    expect(pawn.look).toEqual(rollPawnLook(pawn, culture.colouring!));
  });

  it('a save from before looks rolls them on load and keeps what it has', () => {
    const culture = generateCulture();
    delete culture.colouring;
    culture.lore.description = 'An old people.';
    const old = buildPawnFromCulture(culture, 0);
    delete old.look;
    const kept = { ...buildPawnFromCulture(culture, 1) };
    const keptLook = kept.look;
    ensureLooks([culture], [old, kept], colouringLine);
    expect(culture.colouring).toEqual(rollColouring(culture.id));
    expect(culture.lore.description).toBe(`An old people. ${colouringLine(culture.colouring!)}`);
    expect(old.look).toEqual(rollPawnLook(old, culture.colouring!));
    expect(kept.look).toBe(keptLook);
  });
});
