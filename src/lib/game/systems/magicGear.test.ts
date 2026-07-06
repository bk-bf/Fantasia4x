// PRODUCTION-CHAIN-II §M — passive magical buffs via conditions (the MAGIC-SKILLS foundation).
import { describe, it, expect } from 'vitest';
import { syncTransientConditions } from './PawnStateMachine';
import { equipItem } from '../core/PawnEquipment';
import { combatService } from './Combat';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
import conditionsData from '../database/conditions.jsonc';
import type { GameState, Mob, Pawn } from '../core/types';

const MAGICAL_CONDS = (
  conditionsData as Array<{
    id: string;
    transient?: boolean;
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
  it('defines the buff conditions, all transient + magical with real modifier keys', () => {
    const ids = MAGICAL_CONDS.map((c) => c.id).sort();
    expect(ids).toEqual(
      [
        'charm',
        'fortitude',
        'grace',
        'insight',
        'keen_senses',
        'might',
        'moonlit',
        'quickness',
        'vigor'
      ].sort()
    );
    const CONSUMED = new Set([
      'strength',
      'dexterity',
      'constitution',
      'perception',
      'intelligence',
      'workEfficiency',
      'moveSpeed',
      'fatigueRate',
      'hungerRate',
      'dodge'
    ]);
    for (const c of MAGICAL_CONDS) {
      expect(c.transient).toBe(true);
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

// §M arcane staves — INT-scaled channeled elemental ranged weapons over two workbench tiers.
const T1_STAVES = ['ember_staff', 'frost_staff', 'spark_staff'] as const;
const T2_STAVES = ['pyre_staff', 'rime_staff', 'tempest_staff'] as const;
const STAFF_ELEMENT: Record<string, string> = {
  ember_staff: 'fire',
  pyre_staff: 'fire',
  frost_staff: 'frost',
  rime_staff: 'frost',
  spark_staff: 'lightning',
  tempest_staff: 'lightning'
};

describe('§M arcane staves', () => {
  it('every staff is an arcane + channeled ranged weapon with an elemental damage type', () => {
    for (const id of [...T1_STAVES, ...T2_STAVES]) {
      const def = itemService.getItemById(id);
      expect(def, id).toBeDefined();
      expect(def!.type).toBe('weapon');
      const wp = def!.weaponProperties!;
      expect(wp.arcane, id).toBe(true);
      expect(wp.channeled, id).toBe(true);
      expect(wp.twoHanded, id).toBe(true);
      expect(wp.range, id).toBeGreaterThan(1); // ranged
      expect(wp.ammoCategory, id).toBeUndefined(); // channels mana, not ammo
      expect(wp.staminaCost, id).toBeGreaterThan(0); // mana per cast
      expect(STAFF_ELEMENT[id]).toBe(wp.damageType);
    }
  });

  it('T2 staves grant the attuned gem’s passive buff while wielded', () => {
    for (const id of T2_STAVES) {
      const def = itemService.getItemById(id)!;
      expect(def.grantsConditions?.length, id).toBeGreaterThan(0);
    }
    // wielding a Pyre Staff in the main hand grants Might (gear-grant scan covers held weapons)
    const synced = syncTransientConditions({
      id: 'mage',
      equipment: { mainHand: { instanceId: 'i', itemId: 'pyre_staff', durability: 180 } },
      transientConditions: []
    } as unknown as Pawn);
    expect(synced.transientConditions).toContain('might');
  });

  it('staff recipes are wired to the two arcane benches with real inputs', () => {
    const station = (id: string) => recipeService.getRecipeForItem(id)?.station;
    for (const id of T1_STAVES) expect(station(id), id).toBe('runecarver_bench');
    for (const id of T2_STAVES) expect(station(id), id).toBe('attunement_altar');
    for (const id of [...T1_STAVES, ...T2_STAVES]) {
      const r = recipeService.getRecipeForItem(id)!;
      for (const ref of [...Object.keys(r.inputs), ...Object.keys(r.outputs)])
        expect(itemService.getItemById(ref), `recipe ${id} ref ${ref}`).toBeDefined();
    }
  });
});

// §M regalia — combo & head jewelry (the magic-vs-armour loadout fork).
const REGALIA: Record<string, { slot: string; conds: string[] }> = {
  scholars_circlet: { slot: 'headOuter', conds: ['insight'] },
  champions_crown: { slot: 'headOuter', conds: ['might', 'quickness'] },
  sovereign_crown: { slot: 'headOuter', conds: ['charm', 'keen_senses'] },
  wardens_circlet: { slot: 'headOuter', conds: ['grace', 'fortitude'] },
  gold_torc: { slot: 'amulet', conds: ['fortitude'] },
  champions_torc: { slot: 'amulet', conds: ['might', 'vigor'] },
  wayfarers_pendant: { slot: 'amulet', conds: ['quickness', 'moonlit'] },
  sages_pendant: { slot: 'amulet', conds: ['insight', 'charm'] }
};

describe('§M regalia (combo & head jewelry)', () => {
  it('each piece is armour in its declared slot, grants only real magical conditions, and is craftable', () => {
    const magicalIds = new Set(MAGICAL_CONDS.map((c) => c.id));
    for (const [id, spec] of Object.entries(REGALIA)) {
      const def = itemService.getItemById(id);
      expect(def, id).toBeDefined();
      expect(def!.type, id).toBe('armor');
      expect(def!.armorProperties?.equipmentSlot, id).toBe(spec.slot);
      expect(def!.grantsConditions, id).toEqual(spec.conds);
      for (const c of def!.grantsConditions!) expect(magicalIds.has(c), `${id}→${c}`).toBe(true);
      const r = recipeService.getRecipeForItem(id);
      expect(r, id).toBeDefined();
      expect(r!.station).toBe('lapidary_bench');
      for (const ref of [...Object.keys(r!.inputs), ...Object.keys(r!.outputs)])
        expect(itemService.getItemById(ref), `recipe ${id} ref ${ref}`).toBeDefined();
    }
  });

  it('two single-buff rings fill both ring slots and stack their buffs (no swap)', () => {
    let pawn = { id: 'r', equipment: {}, transientConditions: [] } as unknown as Pawn;
    pawn = equipItem(pawn, 'ruby_ring'); // → ring
    pawn = equipItem(pawn, 'sapphire_ring'); // → ring2 (first ring stays put)
    expect(pawn.equipment.ring?.itemId).toBe('ruby_ring');
    expect(pawn.equipment.ring2?.itemId).toBe('sapphire_ring');
    const synced = syncTransientConditions(pawn);
    expect(synced.transientConditions).toContain('might'); // ruby
    expect(synced.transientConditions).toContain('insight'); // sapphire
  });

  it('crowns occupy the helmet slot (headOuter) — a buff crown means no helm', () => {
    for (const [id, spec] of Object.entries(REGALIA)) {
      if (spec.slot !== 'headOuter') continue;
      const synced = syncTransientConditions({
        id: 'royal',
        equipment: { headOuter: { instanceId: 'i', itemId: id, durability: 200 } },
        transientConditions: []
      } as unknown as Pawn);
      for (const c of spec.conds) expect(synced.transientConditions, id).toContain(c);
    }
  });
});

// ── Combat wiring: INT-scaled arcane damage + elemental resistance over resolveHit ──
const baseStats = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  perception: 10,
  charisma: 10
};
const limbs = () =>
  ['head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'].map((id) => ({
    id,
    health: 100,
    bleedRate: 0,
    parts: []
  }));

function staffMage(staff: string, st: Partial<typeof baseStats>): Pawn {
  return {
    id: 'mage',
    isAlive: true,
    stats: { ...baseStats, ...st },
    traits: [],
    equipment: { mainHand: { instanceId: 'i', itemId: staff, durability: 150 } },
    limbs: limbs(),
    conditions: [],
    transientConditions: [],
    pain: 0,
    stamina: 50,
    maxStamina: 50
  } as unknown as Pawn;
}
function mob(creatureId: string, st: Partial<typeof baseStats>): Mob {
  return {
    id: creatureId,
    creatureId,
    entityClass: 'animal',
    isAlive: true,
    stats: { ...baseStats, dexterity: 2, ...st }, // low dodge → hits land
    traits: [],
    limbs: limbs(),
    conditions: [],
    pain: 0
  } as unknown as Mob;
}
const empty = {} as GameState;
function avgHit(atk: Pawn, def: Mob): number {
  let total = 0;
  let hits = 0;
  for (let i = 0; i < 800; i++) {
    const r = combatService.resolveHit(atk, def, empty);
    if (r.hit) {
      total += r.damage;
      hits++;
    }
  }
  return hits ? total / hits : 0;
}

describe('§M arcane staff damage rides INT', () => {
  it('a high-INT mage out-damages a low-INT one with the same staff (like rapier→PER)', () => {
    const goblin = mob('goblin', {});
    const smart = avgHit(staffMage('ember_staff', { intelligence: 20 }), goblin);
    const dull = avgHit(staffMage('ember_staff', { intelligence: 4 }), goblin);
    expect(smart).toBeGreaterThan(dull * 1.4);
  });
});

describe('§M elemental resistance mitigates staff damage', () => {
  it('a frost-resistant creature takes far less frost-staff damage than a frost-vulnerable one', () => {
    const mage = staffMage('frost_staff', { intelligence: 16 });
    // mammoth: explicit frost 0.5 + high-CON base; viper: frost -0.3 (vulnerable) → clamps to 0 resist.
    const onMammoth = avgHit(mage, mob('woolly_mammoth', { constitution: 24 }));
    const onViper = avgHit(mage, mob('marsh_viper', { constitution: 5 }));
    expect(onMammoth).toBeLessThan(onViper * 0.7);
  });
});
