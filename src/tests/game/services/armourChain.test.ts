import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { recipeService } from '$lib/game/services/RecipeService';
import { itemService } from '$lib/game/services/ItemService';
import { completeCraftOrder } from '$lib/game/services/jobs/craft';
import { getEquipmentSlot } from '$lib/game/core/rules/gear/equipment';
import { ARMOUR_SLOTS } from '$lib/game/core/rules/gear/armorCoverage';
import type { EquipmentSlot, GameState, Item } from '$lib/game/core/types';

// The armour expansion, verified where it actually matters: can a colony REACH these pieces.
// Every limb line (bracers/greaves) previously had an items.jsonc entry and no recipe, so
// the combat probes measured armour no pawn could ever put on.

const ARMOUR = itemService
  .getItemsByType('armor')
  .filter((i) => i.armorProperties?.armorType && i.armorProperties.armorType !== 'shield');

/** Provision a colony that can afford everything, so only the station/research/tool gates are live. */
function provisioned(): GameState {
  const stations = new Set<string>();
  for (const i of ARMOUR) {
    const r = recipeService.getRecipeForItem(i.id);
    if (r?.station) stations.add(r.station);
  }
  const stock: Record<string, number> = {};
  for (const t of ['material', 'food', 'consumable', 'armor'])
    for (const i of itemService.getItemsByType(t)) stock[i.id] = 999;
  return buildScenario({
    seed: 42,
    map: { w: 40, h: 40 },
    researchMaxTier: 9,
    toolTier: 3,
    infiniteFuel: true,
    buildings: [...stations].map((id) => ({ id })),
    items: stock,
    seedEntities: false
  });
}

const makeOrder = (itemId: string, state: GameState) => {
  const r = recipeService.getRecipeForItem(itemId)!;
  const bld = (state.buildings ?? []).find((b) => (b as { type?: string }).type === r.station) as {
    id?: string;
  };
  return {
    id: 'o1',
    item: { id: itemId, name: 'x', amount: 0 },
    quantity: 1,
    workRequired: r.workAmount ?? 4,
    workDone: 0,
    inputs: {},
    stationType: r.station,
    stationBuildingId: bld?.id ?? 'b0'
  } as never;
};

describe('armour reaches the craft card (provisioned colony, recipe gating live)', () => {
  const state = provisioned();

  it('every wearable armour piece queues AND produces its output', () => {
    const fail: string[] = [];
    for (const i of ARMOUR) {
      if (!recipeService.getRecipeForItem(i.id)) continue; // loot-only; armourCoverage.test guards that set
      if (!itemService.canQueueCraft(i.id, state)) {
        fail.push(`${i.id}: canQueueCraft=false`);
        continue;
      }
      const order = makeOrder(i.id, state);
      const gs = completeCraftOrder(
        order,
        { ...state, craftingQueue: [order] } as GameState,
        () => 1
      );
      if (!(gs.droppedItems ?? []).some((d) => d.resourceId === i.id))
        fail.push(`${i.id}: no output`);
    }
    console.log(`[ARMOUR-QUEUE] ${ARMOUR.length} wearable pieces, ${fail.length} unreachable`);
    expect(fail, fail.join('\n')).toEqual([]);
  });

  it('every limb and extremity slot has a craftable piece', () => {
    // The regression this file exists for: shoulders/arms/legs had zero craftable pieces at any age.
    const craftableIn = (slot: EquipmentSlot) =>
      ARMOUR.filter(
        (i) => i.armorProperties!.equipmentSlot === slot && recipeService.getRecipeForItem(i.id)
      ).map((i) => i.id);
    for (const slot of ['bracers', 'greaves', 'gloves', 'boots'] as EquipmentSlot[]) {
      const got = craftableIn(slot);
      expect(got.length, `no craftable piece for ${slot}`).toBeGreaterThan(0);
    }
  });

  it('every wearable piece resolves to a slot the mitigation walk visits', () => {
    // A piece whose slot is not in ARMOUR_SLOTS is stored under a key `mitigationAt` never reads, so
    // it soaks nothing however good its `defense` is. `stargazer_circlet` shipped exactly that way.
    // `back` is exempt: a cloak deliberately soaks nothing and pays out in warmth and carry instead.
    const bad = ARMOUR.filter((i) => {
      const slot = getEquipmentSlot(i as Item);
      if (slot === 'back') return false;
      return !slot || !ARMOUR_SLOTS.includes(slot);
    }).map((i) => `${i.id} → ${getEquipmentSlot(i as Item)}`);
    expect(bad, `piece resolves to a slot with no soak: ${bad.join(', ')}`).toEqual([]);
  });
});

describe('armour chain — physical pawn pipeline (HeadlessSession, real ticks)', () => {
  it('pawns craft a primitive limb piece and wear it', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 7,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 12 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'makers_bench' }, { id: 'craft_spot' }],
        items: {
          cured_deer_hide: 20,
          deer_hide: 20,
          cordage: 20,
          thread: 20,
          branch: 30,
          jackal_leather: 20,
          sinew: 20
        },
        seedEntities: false
      })
    );
    const stk = () => (session.getState().stockpile ?? {}) as Record<string, number>;
    session.command({
      type: 'craftItem',
      payload: { itemId: 'branch_bracers', quantity: 1 }
    } as never);
    for (let i = 0; i < 16 && !(stk().branch_bracers > 0); i++) session.tick(400);
    // …and a piece from the new species-named Bronze light set, to prove the rework is craftable.
    session.command({
      type: 'craftItem',
      payload: { itemId: 'jackal_bracers', quantity: 1 }
    } as never);
    for (let i = 0; i < 16 && !(stk().jackal_bracers > 0); i++) session.tick(400);
    expect(stk().jackal_bracers ?? 0, 'a species-named set piece is craftable').toBeGreaterThan(0);

    const made = stk().branch_bracers ?? 0;
    const pawn = session.getState().pawns[0];
    session.command({
      type: 'equipPawnItem',
      payload: { pawnId: pawn.id, itemId: 'branch_bracers' }
    } as never);
    const worn = session.getState().pawns.find((p) => p.id === pawn.id)?.equipment?.bracers;
    console.log(
      `[ARMOUR-PIPELINE] turn=${session.getState().turn} branch_bracers=${made} ` +
        `(branch ${stk().branch}/30, cordage ${stk().cordage}/20) worn in bracers=${worn?.itemId ?? 'none'}`
    );
    expect(made, 'pawns crafted a limb piece over real ticks').toBeGreaterThan(0);
    expect(stk().branch, 'branches consumed — arms are wicker work at this age').toBeLessThan(30);
    expect(worn?.itemId, 'the crafted piece equips into the bracers slot').toBe('branch_bracers');
  });

  it('pawns craft the iron limb line at an anvil', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 11,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 16 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'anvil' }],
        items: { iron_bar: 30, buckskin: 20, boarhide: 20, cordage: 20, thread: 20, sinew: 20 },
        seedEntities: false
      })
    );
    const stk = () => (session.getState().stockpile ?? {}) as Record<string, number>;
    for (const id of ['iron_bracers', 'iron_greaves'])
      session.command({ type: 'craftItem', payload: { itemId: id, quantity: 1 } } as never);
    for (let i = 0; i < 24 && !(stk().iron_bracers > 0 && stk().iron_greaves > 0); i++)
      session.tick(400);
    console.log(
      `[ARMOUR-PIPELINE] turn=${session.getState().turn} ` +
        `bracers=${stk().iron_bracers} greaves=${stk().iron_greaves} (iron_bar ${stk().iron_bar}/30)`
    );
    expect(stk().iron_bracers ?? 0, 'arms are protectable in play').toBeGreaterThan(0);
    expect(stk().iron_greaves ?? 0, 'legs are protectable in play').toBeGreaterThan(0);
  });

  it('pawns craft a copper-age piece at the stone forge', async () => {
    const session = new HeadlessSession();
    await session.start(
      buildScenario({
        seed: 13,
        map: { w: 20, h: 20 },
        research: ['copper_smelting'],
        toolTier: 3,
        infiniteFuel: true,
        workReady: true,
        pawns: [{ count: 6, skillLevel: 16 }],
        needsDisabled: ['hunger', 'fatigue'],
        buildings: [{ id: 'stone_forge' }],
        items: { copper_bar: 20, thread: 20, buckskin: 20, sinew: 20 },
        seedEntities: false
      })
    );
    const stk = () => (session.getState().stockpile ?? {}) as Record<string, number>;
    session.command({
      type: 'craftItem',
      payload: { itemId: 'copper_scale_bracers', quantity: 1 }
    } as never);
    for (let i = 0; i < 20 && !(stk().copper_scale_bracers > 0); i++) session.tick(400);
    console.log(
      `[ARMOUR-PIPELINE] turn=${session.getState().turn} copper_scale_bracers=${stk().copper_scale_bracers} ` +
        `(copper_bar ${stk().copper_bar}/20)`
    );
    expect(stk().copper_scale_bracers ?? 0, 'the copper age has wearable armour').toBeGreaterThan(
      0
    );
  });
});
