import { describe, it, expect } from 'vitest';
import { itemService } from '$lib/game/services/ItemService';
import { allItemDefs } from '$lib/game/core/defs/items';
import type { Item } from '$lib/game/core/types';

describe('medicine — dressings are automatic, condition cures are not', () => {
  const meds = () => allItemDefs().filter((i: Item) => (i.medicineQuality ?? 0) > 0);

  it('every condition medicine names what it clears, and every dressing names nothing', () => {
    const bad: string[] = [];
    for (const m of meds()) {
      const cures = m.curesConditions ?? [];
      if (cures.length && (m.medicineQuality ?? 0) > 1.4)
        bad.push(`${m.id} cures ${cures.join('/')} AND is a top dressing — it will be auto-spent`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('the tier ladder has a dressing at every age below runed', () => {
    const dressings = meds().filter((m) => !(m.curesConditions ?? []).length);
    for (const tier of [1, 2, 3])
      expect(
        dressings.some((d) => (d.tier ?? 0) === tier),
        `no wound dressing at tier ${tier}`
      ).toBe(true);
  });

  it('conditions the game can inflict are actually treatable by something', () => {
    const all = allItemDefs();
    const cured = new Set(all.flatMap((m: Item) => m.curesConditions ?? []));
    const mended = new Set(all.flatMap((m: Item) => m.mendsWounds ?? []));
    const splinted = all.some((m: Item) => (m.armorProperties?.boneHealMultiplier ?? 0) > 1);
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
