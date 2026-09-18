import { describe, it, expect, vi } from 'vitest';
import {
  servingL,
  carriedQuantities,
  carrierOf,
  doseOf,
  drainDose,
  takeCarriedDose,
  contentVolumeL,
  contentWeightKg,
  usedCapacityL,
  usedWeightKg,
  roomFor,
  vesselAllows,
  defaultFilterFor,
  takeOut,
  hydrationOf,
  carriedDrinkVessel,
  pickVesselFor,
  fluidLitres
} from '$lib/game/core/rules/gear/vessels';
import * as itemDefsModule from '$lib/game/core/defs/items';
import type { ItemInstance, Pawn, VesselContent } from '$lib/game/core/types';

function pawnWith(overrides: {
  items?: Record<string, number>;
  instances?: ItemInstance[];
  equipment?: Record<string, ItemInstance>;
}): Pawn {
  return {
    inventory: {
      items: overrides.items ?? {},
      instances: overrides.instances ?? [],
      weightKg: 0,
      maxWeightKg: 999,
      volumeL: 0,
      maxVolumeL: 999
    },
    equipment: overrides.equipment ?? {}
  } as unknown as Pawn;
}

function inst(instanceId: string, itemId: string, contents?: VesselContent[]): ItemInstance {
  return { instanceId, itemId, durability: 100, contents };
}

describe('servingL', () => {
  it('returns the fluid item volumeL', () => {
    expect(servingL('antivenin_tonic')).toBe(0.3);
  });

  it('falls back to 1 for an unknown id', () => {
    expect(servingL('not_a_real_item_xyz')).toBe(1);
  });
});

describe('carriedQuantities', () => {
  it('merges loose inventory.items with no vessel involved', () => {
    const pawn = pawnWith({ items: { x: 2 } });
    expect(carriedQuantities(pawn).x).toBe(2);
  });

  it('adds nested vessel contents on top of loose stock', () => {
    const pawn = pawnWith({
      items: { water: 1 },
      instances: [inst('v1', 'glassware', [{ itemId: 'water', litres: 0.5 }])]
    });
    expect(carriedQuantities(pawn).water).toBeCloseTo(1.5, 6);
  });
});

describe('carrierOf', () => {
  it('returns the instance holding the LARGER quantity when two carry the same item', () => {
    const small = inst('v-small', 'glassware', [{ itemId: 'antivenin_tonic', litres: 0.3 }]);
    const large = inst('v-large', 'waterskin', [{ itemId: 'antivenin_tonic', litres: 1.2 }]);
    const pawn = pawnWith({ instances: [small, large] });
    expect(carrierOf(pawn, 'antivenin_tonic')).toBe(large);
  });

  it('returns null when the pawn carries none of that item', () => {
    const pawn = pawnWith({
      instances: [inst('v1', 'glassware', [{ itemId: 'antivenin_tonic', litres: 0.3 }])]
    });
    expect(carrierOf(pawn, 'water')).toBeNull();
  });
});

describe('doseOf', () => {
  it('equals servingL for a fluid item', () => {
    expect(doseOf('antivenin_tonic')).toBe(servingL('antivenin_tonic'));
    expect(doseOf('antivenin_tonic')).toBe(0.3);
  });

  it('is 1 for a non-fluid item', () => {
    expect(doseOf('storage_bin')).toBe(1);
  });
});

describe('drainDose', () => {
  it('removes exactly doseOf(itemId) from the named instance, leaving other entries and instances untouched', () => {
    const target = inst('v1', 'glassware', [
      { itemId: 'antivenin_tonic', litres: 1.0 },
      { itemId: 'water', litres: 2 }
    ]);
    const other = inst('v2', 'storage_bin', [{ itemId: 'wild_berries', amount: 5 }]);
    const pawn = pawnWith({ instances: [target, other] });

    const out = drainDose(pawn, 'v1', 'antivenin_tonic');

    const drained = out.inventory!.instances.find((i) => i.instanceId === 'v1')!;
    const untouched = out.inventory!.instances.find((i) => i.instanceId === 'v2')!;

    expect(drained.contents!.find((e) => e.itemId === 'antivenin_tonic')!.litres).toBeCloseTo(
      0.7,
      6
    );
    expect(drained.contents!.find((e) => e.itemId === 'water')!.litres).toBe(2);
    expect(untouched.contents).toEqual([{ itemId: 'wild_berries', amount: 5 }]);
  });
});

describe('takeCarriedDose', () => {
  it('removes exactly doseOf(itemId) via the vessel carrying it', () => {
    const vessel = inst('v1', 'glassware', [{ itemId: 'antivenin_tonic', litres: 1.0 }]);
    const pawn = pawnWith({ instances: [vessel] });

    const out = takeCarriedDose(pawn, 'antivenin_tonic');
    const held = out.inventory!.instances.find((i) => i.instanceId === 'v1')!.contents!.find(
      (e) => e.itemId === 'antivenin_tonic'
    )!.litres;
    expect(held).toBeCloseTo(0.7, 6);
  });

  it('decrements loose inventory when the item is not in a vessel, deleting the key at 0', () => {
    const pawn1 = pawnWith({ items: { wild_berries: 2 } });
    const out1 = takeCarriedDose(pawn1, 'wild_berries');
    expect(out1.inventory!.items.wild_berries).toBe(1);

    const pawn2 = pawnWith({ items: { wild_berries: 1 } });
    const out2 = takeCarriedDose(pawn2, 'wild_berries');
    expect(out2.inventory!.items.wild_berries).toBeUndefined();
  });
});

describe('contentVolumeL', () => {
  it('prefers litres over amount when both are set', () => {
    expect(contentVolumeL({ itemId: 'water', litres: 2, amount: 50 })).toBe(2);
  });

  it('is volumeL * amount for an amount-based entry of a known item', () => {
    expect(contentVolumeL({ itemId: 'wild_berries', amount: 3 })).toBeCloseTo(0.06, 6);
  });

  it('falls back to 0.2 per unit when the item has no volumeL', () => {
    expect(contentVolumeL({ itemId: 'not_a_real_item_xyz', amount: 5 })).toBeCloseTo(1.0, 6);
  });
});

describe('contentWeightKg', () => {
  it('is litres * fluid density for a fluid entry', () => {
    expect(contentWeightKg({ itemId: 'tanning_brine', litres: 2 })).toBeCloseTo(1.3334, 6);
  });

  it('is def.weightKg * matWeight * amount for a solid entry', () => {
    const entry: VesselContent = {
      itemId: 'wild_berries',
      amount: 4,
      instance: inst('nested', 'wild_berries')
    };
    entry.instance!.matWeight = 2;
    expect(contentWeightKg(entry)).toBeCloseTo(0.08, 6);
  });

  it('defaults matWeight to 1 when the entry carries no instance', () => {
    expect(contentWeightKg({ itemId: 'wild_berries', amount: 4 })).toBeCloseTo(0.04, 6);
  });
});

describe('usedCapacityL', () => {
  it('sums contentVolumeL over every entry', () => {
    const i = inst('v1', 'storage_bin', [
      { itemId: 'water', litres: 1.5 },
      { itemId: 'wild_berries', amount: 5 }
    ]);
    expect(usedCapacityL(i)).toBeCloseTo(1.6, 6);
  });

  it('is 0 for empty or undefined contents', () => {
    expect(usedCapacityL(inst('v1', 'storage_bin', []))).toBe(0);
    expect(usedCapacityL(undefined)).toBe(0);
  });
});

describe('usedWeightKg', () => {
  it('sums contentWeightKg and recurses one level into a nested vessel', () => {
    const nested = inst('nested', 'glassware', [{ itemId: 'water', litres: 1 }]);
    const outer = inst('v1', 'storage_bin', [{ itemId: 'glassware', amount: 1, instance: nested }]);
    expect(usedWeightKg(outer)).toBeCloseTo(1.4, 6);
  });

  it('is 0 for empty or undefined contents', () => {
    expect(usedWeightKg(inst('v1', 'storage_bin', []))).toBe(0);
    expect(usedWeightKg(undefined)).toBe(0);
  });
});

describe('roomFor', () => {
  it('clamps to the remaining capacity rather than the naive requested quantity', () => {
    const i = inst('v1', 'glassware', [{ itemId: 'water', litres: 1.8 }]);
    expect(roomFor(i, 'water', 5)).toBe(0.2);
  });

  it('is 0 when vesselAccepts rejects the item', () => {
    const i = inst('v1', 'glassware', []);
    expect(roomFor(i, 'wild_berries', 5)).toBe(0);
  });
});

describe('vesselAllows', () => {
  it('is false when the item is in filter but vesselAccepts rejects it', () => {
    const i = inst('v1', 'glassware', []);
    i.filter = ['wild_berries'];
    expect(vesselAllows(i, 'wild_berries')).toBe(false);
  });

  it('is true when the item is both filtered in and accepted', () => {
    const i = inst('v1', 'glassware', []);
    i.filter = ['water'];
    expect(vesselAllows(i, 'water')).toBe(true);
  });
});

describe('defaultFilterFor', () => {
  it('looks the vessel id up in the defaults map', () => {
    expect(defaultFilterFor('storage_bin', { storage_bin: ['branch'] })).toEqual(['branch']);
  });

  it('returns a fresh copy, not the stored array', () => {
    const defaults = { storage_bin: ['branch'] };
    const result = defaultFilterFor('storage_bin', defaults);
    expect(result).not.toBe(defaults.storage_bin);
    result.push('stone');
    expect(defaults.storage_bin).toEqual(['branch']);
  });

  it('returns an empty array when there are no defaults', () => {
    expect(defaultFilterFor('storage_bin', undefined)).toEqual([]);
  });
});

describe('takeOut', () => {
  it('clamps the return value to what was actually held', () => {
    const i = inst('v1', 'glassware', [{ itemId: 'water', litres: 2 }]);
    const got = takeOut(i, 'water', 10);
    expect(got).toBe(2);
  });

  it('prunes contents once emptied to 0', () => {
    const i = inst('v1', 'glassware', [{ itemId: 'water', litres: 2 }]);
    takeOut(i, 'water', 10);
    expect(i.contents).toBeUndefined();
  });
});

describe('hydrationOf', () => {
  it('is 0 for a fluid item with no hydration field', () => {
    expect(hydrationOf('antivenin_tonic')).toBe(0);
  });

  it('is 0 for an unknown id', () => {
    expect(hydrationOf('not_a_real_item_xyz')).toBe(0);
  });
});

describe('carriedDrinkVessel', () => {
  it('picks the candidate with the higher litres*hydration worth, not the first found', () => {
    const water = inst('v-water', 'glassware', [{ itemId: 'water', litres: 1 }]);
    const stock = inst('v-stock', 'waterskin', [{ itemId: 'bone_stock', litres: 2 }]);
    const pawn = { inventory: { instances: [water, stock] }, equipment: {} };
    const picked = carriedDrinkVessel(pawn);
    expect(picked?.itemId).toBe('bone_stock');
    expect(picked?.litres).toBe(2);
  });

  it('also considers a filled vessel worn in equipment, not just inventory', () => {
    const worn = inst('v-worn', 'glassware', [{ itemId: 'water', litres: 1 }]);
    const pawn = { inventory: { instances: [] }, equipment: { mainHand: worn } };
    const picked = carriedDrinkVessel(pawn);
    expect(picked?.inst).toBe(worn);
    expect(picked?.itemId).toBe('water');
  });
});

describe('pickVesselFor', () => {
  it('returns the SMALLEST accepting vessel whose capacityL >= requested litres, not the largest', () => {
    const real = itemDefsModule.allItemDefs();
    const subset = real.filter((d) =>
      ['fireclay_crucible', 'rune_sealed_flask', 'storage_bin'].includes(d.id)
    );
    const spy = vi.spyOn(itemDefsModule, 'allItemDefs').mockReturnValue(subset);
    try {
      expect(pickVesselFor('water', 1.5)).toBe('fireclay_crucible');
    } finally {
      spy.mockRestore();
    }
  });

  it('falls back to the LARGEST accepting vessel when none fits', () => {
    const real = itemDefsModule.allItemDefs();
    const subset = real.filter((d) =>
      ['fireclay_crucible', 'rune_sealed_flask', 'storage_bin'].includes(d.id)
    );
    const spy = vi.spyOn(itemDefsModule, 'allItemDefs').mockReturnValue(subset);
    try {
      expect(pickVesselFor('water', 200)).toBe('storage_bin');
    } finally {
      spy.mockRestore();
    }
  });

  it('returns null when nothing accepts the item', () => {
    const spy = vi.spyOn(itemDefsModule, 'allItemDefs').mockReturnValue([]);
    try {
      expect(pickVesselFor('water', 1)).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('fluidLitres', () => {
  it('sums multiple fluid entries', () => {
    const i = inst('v1', 'storage_bin', [
      { itemId: 'water', litres: 1.2 },
      { itemId: 'bone_stock', litres: 0.3 }
    ]);
    expect(fluidLitres(i)).toBeCloseTo(1.5, 6);
  });

  it('skips amount-based (non-fluid) entries', () => {
    const i = inst('v1', 'storage_bin', [
      { itemId: 'water', litres: 1 },
      { itemId: 'wild_berries', amount: 5 }
    ]);
    expect(fluidLitres(i)).toBe(1);
  });

  it('is 0 for null or undefined', () => {
    expect(fluidLitres(null)).toBe(0);
    expect(fluidLitres(undefined)).toBe(0);
  });
});
