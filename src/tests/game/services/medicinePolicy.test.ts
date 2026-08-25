import { describe, it, expect } from 'vitest';
import { itemService } from '$lib/game/services/ItemService';
import { allItemDefs } from '$lib/game/core/defs/items';
import type { Item } from '$lib/game/core/types';

/**
 * Two halves, deliberately split: WOUNDS are dressed automatically under a ceiling the player sets per
 * pawn, CONDITIONS are administered by hand out of a caretaker's own pack. The sim never guesses which
 * of thirteen conditions the player wanted cleared, or which of their few phials to spend on it.
 */
describe('medicine — dressings are automatic, condition cures are not', () => {
  const meds = () => allItemDefs().filter((i: Item) => (i.medicineQuality ?? 0) > 0);

  it('every condition medicine names what it clears, and every dressing names nothing', () => {
    const bad: string[] = [];
    for (const m of meds()) {
      const cures = m.curesConditions ?? [];
      // A medicine is one or the other. Something that both dressed wounds well AND cured a condition
      // would be picked up by the auto-tend and spent on a graze.
      if (cures.length && (m.medicineQuality ?? 0) > 1.4)
        bad.push(`${m.id} cures ${cures.join('/')} AND is a top dressing — it will be auto-spent`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('the tier ladder has a dressing at every age below runed', () => {
    // The gap this exists to prevent: a colony that advances and still tends with chewed leaves.
    const dressings = meds().filter((m) => !(m.curesConditions ?? []).length);
    for (const tier of [1, 2, 3])
      expect(
        dressings.some((d) => (d.tier ?? 0) === tier),
        `no wound dressing at tier ${tier}`
      ).toBe(true);
  });

  it('conditions the game can inflict are actually treatable by something', () => {
    // The answer pool is every item, not just the ones carrying a `medicineQuality` — an antidote
    // tonic and a bone-knitting draught are neither of them dressings. And the answer to a broken
    // bone is not a condition cure at all: `fractured` is re-derived from the limb tree every tick, so
    // the only things that reach it are a dose that MENDS the fracture wound and a splint worn over it.
    const all = allItemDefs();
    const cured = new Set(all.flatMap((m: Item) => m.curesConditions ?? []));
    const mended = new Set(all.flatMap((m: Item) => m.mendsWounds ?? []));
    const splinted = all.some((m: Item) => (m.armorProperties?.boneHealMultiplier ?? 0) > 1);
    // The ones a fight or a wound produces — each needs an answer somewhere in the ladder.
    for (const c of ['bleeding', 'infection', 'nausea', 'envenomed', 'burning'])
      expect(cured.has(c), `nothing treats "${c}"`).toBe(true);
    expect(mended.has('fracture'), 'no dose knits a broken bone').toBe(true);
    expect(splinted, 'nothing worn speeds a broken bone').toBe(true);
  });

  it('a battlefield styptic trades tending quality for stopping the bleed', () => {
    const styptic = itemService.getItemById('styptic_pack')!;
    const dressing = itemService.getItemById('surgeons_dressing')!;
    expect(styptic.curesConditions).toContain('bleeding');
    expect(styptic.medicineQuality!, 'it is a bad dressing — that is the trade').toBeLessThan(
      dressing.medicineQuality!
    );
  });
});
