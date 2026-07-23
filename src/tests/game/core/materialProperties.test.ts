import { describe, it, expect } from 'vitest';
import { getMaterialProperty, aggregateMaterialMods } from '$lib/game/core/materialProperties';

/**
 * §M material properties — a dynamic build/craft material shifts the finished building's / item's
 * stats. These pin the data + the aggregation used by the building condition tick and craft durability.
 */
describe('material properties', () => {
  it('tougher materials carry a >1 durability mult, flimsy ones <1', () => {
    expect(getMaterialProperty('oak_plank')?.item?.durability).toBeGreaterThan(1);
    expect(getMaterialProperty('ironwood_plank')?.building?.durability).toBeGreaterThan(1.5);
    expect(getMaterialProperty('granite_block')?.building?.durability).toBeGreaterThan(1);
    expect(getMaterialProperty('pine_plank')?.item?.durability).toBeLessThan(1);
    expect(getMaterialProperty('silk_cloth')?.building?.durability).toBeLessThan(1);
  });

  it('every entry has a label + desc for the hover card', () => {
    for (const id of ['oak_plank', 'marble_block', 'silk_cloth', 'oxhide', 'mammoth_wool']) {
      const m = getMaterialProperty(id);
      expect(m?.label, id).toBeTruthy();
      expect(m?.desc, id).toBeTruthy();
    }
  });

  it('aggregateMaterialMods multiplies durability/weight and sums beauty/comfort/insulation', () => {
    const oak = aggregateMaterialMods(['oak_plank'], 'item');
    expect(oak.durability).toBeCloseTo(1.25);
    // two materials' durability multiply together
    const both = aggregateMaterialMods(['oak_plank', 'ash_plank'], 'item');
    expect(both.durability).toBeCloseTo(1.25 * 1.2);
    // beauty is additive on the building target
    const marble = aggregateMaterialMods(['marble_block'], 'building');
    expect(marble.beauty).toBeGreaterThan(0);
  });

  it('unknown / non-material ids are ignored (neutral)', () => {
    const m = aggregateMaterialMods(['iron_bar', 'not_a_material'], 'item');
    expect(m).toEqual({ durability: 1, beauty: 0, comfort: 0, insulation: 0, weight: 1 });
  });
});
