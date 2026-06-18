// PRODUCTION-CHAIN-II §M — passive magical buffs via conditions (the MAGIC-SKILLS foundation).
import { describe, it, expect } from 'vitest';
import { syncTransientConditions } from './PawnStateMachine';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
import conditionsData from '../database/conditions.jsonc';
import type { Pawn } from '../core/types';

const MAGICAL_CONDS = (
  conditionsData as Array<{
    id: string;
    duration: string;
    magical?: boolean;
    modifiers: Record<string, number>;
  }>
).filter((c) => c.magical);

const MINERALS = ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst', 'citrine', 'moonstone'];

function pawnWearing(slot: string, itemId: string): Pawn {
  return {
    id: 'p1',
    equipment: { [slot]: { instanceId: 'i1', itemId, durability: 200 } },
    transientConditions: []
  } as unknown as Pawn;
}

describe('§M passive buff: worn gear → magical condition', () => {
  it('wearing a ruby ring grants the Might condition', () => {
    const synced = syncTransientConditions(pawnWearing('ring', 'ruby_ring'));
    expect(synced.transientConditions).toContain('might');
  });

  it('grants the buff from the amulet slot too (stacks with a ring)', () => {
    const synced = syncTransientConditions(pawnWearing('amulet', 'sapphire_amulet'));
    expect(synced.transientConditions).toContain('insight');
  });

  it('a pawn wearing nothing magical has no magical condition', () => {
    const bare = { id: 'p', equipment: {}, transientConditions: [] } as unknown as Pawn;
    const synced = syncTransientConditions(bare);
    expect(MAGICAL_CONDS.every((c) => !synced.transientConditions!.includes(c.id))).toBe(true);
  });

  it('the buff clears when the gear is removed (re-derived each tick)', () => {
    const worn = syncTransientConditions(pawnWearing('ring', 'emerald_ring'));
    expect(worn.transientConditions).toContain('vigor');
    const removed = syncTransientConditions({ ...worn, equipment: {} } as Pawn);
    expect(removed.transientConditions).not.toContain('vigor');
  });
});

describe('§M magical conditions', () => {
  it('defines the 7 buff conditions, all transient + magical with real modifier keys', () => {
    const ids = MAGICAL_CONDS.map((c) => c.id).sort();
    expect(ids).toEqual(
      ['charm', 'insight', 'keen_senses', 'might', 'moonlit', 'quickness', 'vigor'].sort()
    );
    const CONSUMED = new Set(['workEfficiency', 'moveSpeed', 'fatigueRate', 'hungerRate', 'dodge']);
    for (const c of MAGICAL_CONDS) {
      expect(c.duration).toBe('transient');
      const keys = Object.keys(c.modifiers);
      expect(keys.length).toBeGreaterThan(0);
      // every modifier key is one the engine actually consumes, and is an actual buff (not 1.0)
      for (const k of keys) {
        expect(CONSUMED.has(k)).toBe(true);
        expect(c.modifiers[k]).not.toBe(1);
      }
    }
  });
});

describe('§M item & recipe integrity', () => {
  it('every gear grantsConditions id resolves to a magical condition', () => {
    const magicalIds = new Set(MAGICAL_CONDS.map((c) => c.id));
    for (const m of MINERALS) {
      for (const gear of [`${m}_ring`, `${m}_amulet`]) {
        const def = itemService.getItemById(gear);
        expect(def, gear).toBeDefined();
        expect(def!.type).toBe('armor');
        expect(['ring', 'amulet']).toContain(def!.armorProperties?.equipmentSlot);
        expect(def!.grantsConditions?.length, gear).toBeGreaterThan(0);
        for (const cid of def!.grantsConditions!)
          expect(magicalIds.has(cid), `${gear}→${cid}`).toBe(true);
      }
    }
  });

  it('ancient woods exist as magic_wood with an affinity', () => {
    for (const w of ['heartwood_log', 'moonwood_log', 'ironwood_log', 'emberwood_log']) {
      const def = itemService.getItemById(w);
      expect(def, w).toBeDefined();
      expect(def!.category).toBe('magic_wood');
      expect(def!.affinity, w).toBeTruthy();
    }
  });

  it('the full crystal chain exists per mineral (normal/infused/cut/attuned)', () => {
    for (const m of MINERALS) {
      expect(itemService.getItemById(m)?.category, m).toBe('crystal');
      expect(itemService.getItemById(`infused_${m}`)?.category).toBe('magic_crystal');
      expect(itemService.getItemById(`cut_${m}`)?.category).toBe('gem');
      expect(itemService.getItemById(`attuned_${m}`)?.category).toBe('magic_gem');
    }
  });

  it('lapidary recipes are wired and reference real items', () => {
    const check = (itemId: string, station: string) => {
      const r = recipeService.getRecipeForItem(itemId);
      expect(r, itemId).toBeDefined();
      expect(r!.station).toBe(station);
      for (const id of [...Object.keys(r!.inputs), ...Object.keys(r!.outputs)])
        expect(itemService.getItemById(id), `recipe ${itemId} ref ${id}`).toBeDefined();
    };
    for (const m of MINERALS) {
      check(`cut_${m}`, 'lapidary_bench');
      check(`attuned_${m}`, 'lapidary_bench');
      check(`${m}_ring`, 'lapidary_bench');
      check(`${m}_amulet`, 'lapidary_bench');
    }
  });
});
