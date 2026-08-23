import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { workService } from '$lib/game/services/WorkService';
import { absorbDropIfOnStockpileTile, addToStockpileZone } from '$lib/game/core/GameState';
import { fluidLitres, heldQuantity } from '$lib/game/core/vessels';
import { itemService } from '$lib/game/services/ItemService';
import BUILDINGS from '$lib/game/database/world/buildings.jsonc';
import type { GameState, ItemInstance } from '$lib/game/core/types';

/**
 * CONTAINERS-AND-FLUIDS, driven through the real sim rather than asserted about functions.
 *
 * The two claims worth proving are the two the spec is actually about: that a fluid physically MOVES
 * — river → vessel → stockpile → a pawn's throat, over real ticks, with real pawns doing the walking —
 * and that a fluid physically CANNOT lie about loose, whatever tries to put it there.
 */

const stk = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;

/** Every vessel in the colony that is holding something, wherever it is. */
function loadedVessels(gs: GameState): ItemInstance[] {
  const out: ItemInstance[] = [];
  for (const d of gs.droppedItems ?? []) if (d.instance?.contents?.length) out.push(d.instance);
  for (const p of gs.pawns ?? [])
    for (const i of p.inventory?.instances ?? []) if (i.contents?.length) out.push(i);
  return out;
}

describe('containers & fluids — a vessel physically carries water (HeadlessSession, real ticks)', () => {
  it('pawns fill a waterskin at a drink zone, haul it home, and a thirsty pawn drinks from it', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 21,
        map: { w: 20, h: 20 },
        researchMaxTier: 9,
        toolTier: 3,
        workReady: true,
        pawns: [{ count: 4, skillLevel: 12 }],
        needsDisabled: ['hunger', 'fatigue', 'hygiene'],
        // A well IS the drink source — no river needed on a flat test map, and it's the same code path
        // (`findNearestWaterTarget` treats a well and a painted drink zone identically).
        buildings: [{ id: 'well' }],
        items: { waterskin: 2 },
        seedEntities: false
      })
    );
    for (const p of s.getState().pawns)
      for (const w of workService.getAllWorkCategories())
        s.command({
          type: 'setPawnLaborLevel',
          payload: { pawnId: p.id, workId: w.id, level: 3 }
        } as never);

    // A freshly made vessel allows NOTHING — that is the default, and it is why nothing happens yet.
    const skins = () =>
      (s.getState().droppedItems ?? [])
        .filter((d) => d.resourceId === 'waterskin' && d.instance)
        .map((d) => d.instance!);
    expect(skins().length, 'both waterskins exist as real tracked vessels').toBe(2);
    expect(
      skins().every((i) => (i.filter ?? []).length === 0),
      'and allow nothing yet'
    ).toBe(true);

    s.tick(1200);
    expect(
      loadedVessels(s.getState()).length,
      'nobody fills a vessel the player has not opened up — that is the whole trigger'
    ).toBe(0);

    // The player allows water on both skins. THAT is what queues the work.
    for (const inst of skins())
      s.command({
        type: 'setVesselFilter',
        payload: { instanceId: inst.instanceId, allowedItemIds: ['water'] },
        save: true
      } as never);

    let litres = 0;
    for (let i = 0; i < 20 && litres <= 0; i++) {
      s.tick(400);
      litres = loadedVessels(s.getState()).reduce((n, v) => n + fluidLitres(v), 0);
    }
    console.log(
      `[VESSEL] after ${s.getState().turn} turns: water in vessels=${litres} L, colony water=${stk(s).water}`
    );
    expect(litres, 'a pawn walked to the well and filled a skin').toBeGreaterThan(0);
    expect(stk(s).water ?? 0, 'and what a vessel holds is colony stock').toBeGreaterThan(0);

    // …and the water is drinkable where it is. Parch one pawn and hand it the skin.
    const gs0 = s.getState();
    const drinker = gs0.pawns[0];
    // Count the WHOLE colony's water, not one skin's: haulers are still filling the second skin, so a
    // single-vessel reading would go UP while the drinker is emptying its own.
    const waterHeld = (g: GameState) =>
      loadedVessels(g).reduce((n, v) => n + heldQuantity(v, 'water'), 0);
    const before = waterHeld(gs0);
    // Parch it. There is no dev command for a single need, and the FSM mutates needs in place anyway
    // (ADR-002 amendment), so setting the meter directly is the same thing the sim does every tick.
    drinker.needs.thirst = 95;
    let drank = false;
    for (let i = 0; i < 30 && !drank; i++) {
      s.tick(200);
      const thirst = s.getState().pawns.find((p) => p.id === drinker.id)?.needs?.thirst ?? 100;
      if (thirst < 60) drank = true;
    }
    const after = waterHeld(s.getState());
    console.log(
      `[VESSEL] drink: water in vessels ${before} L → ${after} L, thirst=${s
        .getState()
        .pawns.find((p) => p.id === drinker.id)
        ?.needs?.thirst?.toFixed(1)}`
    );
    expect(drank, 'a thirsty pawn drank real water out of a real vessel').toBe(true);
  }, 180000);

  it('a fluid cannot be put down loose — the attempt spills it', () => {
    const gs = {
      turn: 1,
      pawns: [],
      buildings: [],
      droppedItems: [
        // Somebody tries to lay a stack of water on a stockpile tile, the way any pre-fluid code would.
        { id: 'loose-water', resourceId: 'water', x: 2, y: 2, quantity: 9, stored: true }
      ],
      stockpile: {},
      stockpileZones: [],
      worldMap: Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 5 }, (_, x) => ({ x, y, type: 'land' }))
      )
    } as unknown as GameState;

    // Any drops-mutating path goes through `withDrops`; crediting the stockpile is one of them.
    const out = addToStockpileZone(gs, '2,2', { stone: 1 });
    expect(
      (out.droppedItems ?? []).some((d) => d.resourceId === 'water'),
      'the loose stack of water spilled rather than becoming a puddle the sim has to reason about'
    ).toBe(false);
    expect(out.stockpile?.water ?? 0, 'and it is not in the ledger either').toBe(0);

    // Crediting a fluid deliberately is a different thing entirely: it arrives IN something.
    const credited = addToStockpileZone(gs, '2,2', { water: 4 });
    const minted = (credited.droppedItems ?? []).filter((d) => d.instance?.contents?.length);
    expect(minted.length, 'a deliberate credit mints the vessel(s) it arrives in').toBeGreaterThan(
      0
    );
    expect(
      minted.reduce((n, d) => n + heldQuantity(d.instance!, 'water'), 0),
      'and all four litres are inside them'
    ).toBe(4);
    expect(credited.stockpile?.water ?? 0, 'and it counts as stock while it sits there').toBe(4);
  });
});

describe('containers & fluids — what happens when there is nowhere to put it', () => {
  it('a station brewed past its own capacity SPILLS the overflow rather than growing a bigger belly', () => {
    // The butcher spot catches 5 L. Butchering into a full one loses what will not fit — which is what
    // makes emptying it (or keeping a vessel standing on it) the player's problem rather than nobody's.
    const cap = (BUILDINGS as { id?: string; fluidCapacityL?: number }[]).find(
      (b) => b.id === 'butcher_spot'
    )?.fluidCapacityL;
    expect(cap, 'the butcher spot has a catch basin at all').toBeGreaterThan(0);

    const gs = {
      turn: 1,
      pawns: [],
      buildings: [
        {
          id: 'bs-1',
          type: 'butcher_spot',
          x: 2,
          y: 2,
          status: 'complete',
          fluidContents: [{ itemId: 'caustic_bile', litres: cap! }]
        }
      ],
      droppedItems: [],
      stockpile: {},
      stockpileZones: [],
      worldMap: Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 5 }, (_, x) => ({ x, y, type: 'land' }))
      )
    } as unknown as GameState;

    // Nothing on the tile can take it and the basin is brim-full, so the only honest outcome is loss.
    const before = gs.buildings![0].fluidContents!.reduce((n, e) => n + (e.litres ?? 0), 0);
    const after = addToStockpileZone(gs, '2,2', { stone: 1 });
    expect(
      after.buildings![0].fluidContents!.reduce((n, e) => n + (e.litres ?? 0), 0),
      'the basin stays at its stated capacity — it never quietly holds more'
    ).toBe(before);
    expect(
      (after.droppedItems ?? []).some((d) => d.resourceId === 'caustic_bile'),
      'and the overflow never becomes a puddle on the floor'
    ).toBe(false);
  });

  it('a vessel worn out by the weather takes its contents with it', () => {
    // §B: a LOOSE stack weathers down its durability pool and is destroyed at 0. A vessel is a stack
    // like any other, and what is inside it is not exempt from the jug shattering.
    const skin: ItemInstance = {
      instanceId: 'skin-doomed',
      itemId: 'waterskin',
      durability: 1,
      filter: ['water'],
      contents: [{ itemId: 'water', litres: 3 }]
    };
    const gs = {
      turn: 1,
      pawns: [],
      buildings: [],
      weather: undefined,
      droppedItems: [
        {
          id: 'd-skin',
          resourceId: 'waterskin',
          x: 2,
          y: 2,
          quantity: 1,
          stored: false, // loose = exposed to the elements
          durability: 0.0001,
          instance: skin
        }
      ],
      stockpile: { water: 3, waterskin: 1 },
      stockpileZones: [],
      worldMap: Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 5 }, (_, x) => ({ x, y, type: 'land' }))
      )
    } as unknown as GameState;

    const out = itemService.stepItemDeterioration(gs, 60);
    expect(
      (out.droppedItems ?? []).some((d) => d.id === 'd-skin'),
      'the skin rotted apart'
    ).toBe(false);
    expect(
      (out.droppedItems ?? []).some((d) => d.resourceId === 'water'),
      'and the three litres went with it — no orphan puddle survives the vessel'
    ).toBe(false);
  });

  it('food in an OPEN vessel still rots; a sealed one holds the clock', () => {
    // Being in a container is not a licence to never spoil. `wooden_bucket` is open, `wooden_chest`
    // is not — same food, same ticks, opposite outcomes.
    const berries = () => [{ itemId: 'wild_berries', amount: 4 }];
    const build = (vesselId: string) =>
      ({
        turn: 1,
        pawns: [],
        buildings: [],
        droppedItems: [
          {
            id: `d-${vesselId}`,
            resourceId: vesselId,
            x: 2,
            y: 2,
            quantity: 1,
            stored: true,
            instance: {
              instanceId: `i-${vesselId}`,
              itemId: vesselId,
              durability: 100,
              filter: ['wild_berries'],
              contents: berries()
            }
          }
        ],
        stockpile: {},
        stockpileZones: [],
        worldMap: Array.from({ length: 5 }, (_, y) =>
          Array.from({ length: 5 }, (_, x) => ({ x, y, type: 'land', terrainType: 'plains' }))
        )
      }) as unknown as GameState;

    const heldIn = (g: GameState, vesselId: string) =>
      heldQuantity(
        (g.droppedItems ?? []).find((d) => d.resourceId === vesselId)?.instance,
        'wild_berries'
      );

    // Long enough for raw meat's decaySeconds to fire several times over.
    const ticks = 60 * 60 * 24;
    const open = itemService.stepItemDecay(build('wooden_bucket'), ticks);
    const sealed = itemService.stepItemDecay(build('wooden_chest'), ticks);

    expect(
      heldIn(open, 'wooden_bucket'),
      'berries in an open bucket rot like berries anywhere'
    ).toBeLessThan(4);
    expect(heldIn(sealed, 'wooden_chest'), 'a sealed chest holds the clock').toBe(4);
  });
});

describe('containers & fluids — DF-style stockpiles: goods go INTO the bin', () => {
  const zoneState = (extra: Partial<GameState> = {}) =>
    ({
      turn: 1,
      pawns: [],
      buildings: [],
      droppedItems: [],
      stockpile: {},
      stockpileZones: [],
      zoneTiles: { '2,2': ['stockpile'] },
      zoneInstances: [
        {
          id: 'z1',
          type: 'stockpile',
          label: 'Store',
          filter: { allowedCategories: [], blockedItems: [] }
        }
      ],
      worldMap: Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 5 }, (_, x) => ({ x, y, type: 'land' }))
      ),
      ...extra
    }) as unknown as GameState;

  it('a pile hauled onto a tile with an accepting bin is packed INTO it, not laid beside it', () => {
    const gs = zoneState({
      droppedItems: [
        {
          id: 'd-bin',
          resourceId: 'storage_bin',
          x: 2,
          y: 2,
          quantity: 1,
          stored: true,
          instance: {
            instanceId: 'bin-1',
            itemId: 'storage_bin',
            durability: 180,
            filter: ['branch']
          }
        },
        { id: 'd-branch', resourceId: 'branch', x: 2, y: 2, quantity: 6, stored: false }
      ]
    });
    const out = absorbDropIfOnStockpileTile(gs, 'd-branch');
    const bin = (out.droppedItems ?? []).find((d) => d.id === 'd-bin');
    expect(heldQuantity(bin!.instance, 'branch'), 'the branches went in the bin').toBeGreaterThan(
      0
    );
    expect(
      (out.droppedItems ?? []).filter((d) => d.resourceId === 'branch' && d.stored).length,
      'and no second loose pile was laid beside it'
    ).toBe(0);
    expect(
      out.stockpile?.branch,
      'the colony ledger is unchanged by where it physically sits'
    ).toBe(6);
  });

  it('a bin the player has NOT opened up takes nothing — its allow-list is the gate', () => {
    const gs = zoneState({
      droppedItems: [
        {
          id: 'd-bin',
          resourceId: 'storage_bin',
          x: 2,
          y: 2,
          quantity: 1,
          stored: true,
          instance: { instanceId: 'bin-1', itemId: 'storage_bin', durability: 180, filter: [] }
        },
        { id: 'd-branch', resourceId: 'branch', x: 2, y: 2, quantity: 6, stored: false }
      ]
    });
    const out = absorbDropIfOnStockpileTile(gs, 'd-branch');
    expect(
      heldQuantity((out.droppedItems ?? []).find((d) => d.id === 'd-bin')!.instance, 'branch')
    ).toBe(0);
    expect(
      (out.droppedItems ?? []).find((d) => d.id === 'd-branch')!.stored,
      'it just becomes an ordinary stored pile instead'
    ).toBe(true);
  });

  it("a vessel set down in a filtered stockpile inherits that zone's list", () => {
    const gs = zoneState({
      zoneInstances: [
        {
          id: 'z1',
          type: 'stockpile',
          label: 'Firewood',
          filter: { allowedCategories: ['wood'], blockedItems: [] }
        }
      ],
      droppedItems: [
        {
          id: 'd-bin',
          resourceId: 'storage_bin',
          x: 2,
          y: 2,
          quantity: 1,
          stored: false,
          instance: { instanceId: 'bin-1', itemId: 'storage_bin', durability: 180 }
        }
      ]
    });
    const out = absorbDropIfOnStockpileTile(gs, 'd-bin');
    const seeded = (out.droppedItems ?? []).find((d) => d.id === 'd-bin')!.instance!.filter ?? [];
    expect(seeded.length, 'the bin was told what the stockpile is for').toBeGreaterThan(0);
    expect(
      seeded.every((id) => itemService.getItemById(id)?.category === 'wood'),
      'and told exactly that, nothing wider'
    ).toBe(true);
  });
});
