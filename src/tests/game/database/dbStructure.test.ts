import { describe, it, expect } from 'vitest';
import buildingsData from '$lib/game/database/world/buildings.jsonc';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import { TREE_ITEMS } from '$lib/dev/itemTree';
import { AGE_NAMES, BUILDING_AGE, CARCASS_TIER, nodeItems } from '$lib/dev/chainAge';
import lootpoolData from '$lib/game/database/items/lootpool.jsonc';
import { itemMatchesCostCategory } from '$lib/game/core/itemDefs';
import { recipeItemMatchesCategory } from '$lib/game/services/RecipeService';
import itemsData from '$lib/game/database/items/items.jsonc';
/* eslint-disable @typescript-eslint/no-explicit-any */

const BUILDINGS = buildingsData as any[];
const RECIPES = recipesData as any[];
const ITEMS = itemsData as any[];
/** every item id any loot pool can hand out — a drop is a way in, and therefore an age. */
const DROPS = new Set<string>();
(function scan(o: unknown): void {
  if (Array.isArray(o)) return o.forEach(scan);
  if (!o || typeof o !== 'object') return;
  const n = o as Record<string, any>;
  if (typeof n.id === 'string' && (n.w !== undefined || n.weight !== undefined)) DROPS.add(n.id);
  for (const v of Object.values(n)) scan(v);
})(lootpoolData);
const byId = new Map(BUILDINGS.map((b) => [b.id, b]));

/**
 * A building is a WORKSTATION (things are made at it), a STORAGE fixture (things are kept in it), or
 * both — and it must say which. Nothing said which, so recipes drifted onto storage: cheese was
 * pressed in a cupboard and hams cured on the Meat Hooks, which is a rail for hanging carcasses.
 */
describe('workstations and storage are different things', () => {
  it('every recipe is hosted by a declared workstation', () => {
    const bad = RECIPES.filter((r) => r.station && !byId.get(r.station)?.workstation).map(
      (r) =>
        `${r.id} is made at ${r.station}, which is not marked \`workstation\` — either it IS one and ` +
        `should say so, or the recipe belongs somewhere things are actually made.`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('every building that keeps stock declares itself storage', () => {
    const bad = BUILDINGS.filter(
      (b) => (b.effects?.storageStacks || b.storageFilter) && !b.storage
    ).map((b) => `${b.id} holds stock but is not marked \`storage\``);
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a building is at least one of the two', () => {
    const bad = BUILDINGS.filter(
      (b) => b.id && b.workstation && !b.effects && !RECIPES.some((r) => r.station === b.id)
    ).map(
      (b) => `${b.id} claims to be a workstation but nothing is made there and it grants nothing`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

/**
 * The /gear-db tree's levels have to partition. A level repeating a word already used by ANY ancestor
 * is not a distinction — "Consumables ▸ Food ▸ fresh ▸ Food" told the reader nothing twice — and a
 * catch-all label ("food", "other", "misc") is the absence of a category wearing one's clothes.
 */
describe('the item tree partitions cleanly', () => {
  const paths = new Set<string>();
  for (const r of TREE_ITEMS)
    for (let d = 1; d <= r.path.length; d++) paths.add(r.path.slice(0, d).join(' > '));
  const norm = (x: string) =>
    x
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .replace(/s$/, '');

  it('no level repeats a word an ancestor already used', () => {
    const bad: string[] = [];
    for (const p of paths) {
      const seg = p.split(' > ');
      const leaf = norm(seg[seg.length - 1]);
      if (seg.slice(0, -1).some((a) => norm(a) === leaf)) bad.push(p);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('no shelf is named after the absence of a category', () => {
    // 'food' is not on this list: "Consumables ▸ Food" is a real branch. What was wrong was the
    // SECOND Food underneath it, and the repeat rule above is what catches that.
    const VAGUE = new Set(['other', 'misc', 'general', 'item', 'thing', 'stuff', 'consumable']);
    // Root branches name the whole kind and are allowed to; it is the SHELVES under them that have
    // to distinguish something.
    const bad = [...paths].filter(
      (p) => p.includes(' > ') && VAGUE.has(norm(p.split(' > ').pop()!))
    );
    expect(bad, `${bad.join('; ')} — give these items a real category`).toEqual([]);
  });
});

/**
 * WHERE AN AGE COMES FROM. An item is placed in an age by, in order: the gear tables, an explicit
 * `tier`, the creature whose carcass it is, or the workshop ladder its recipe needs. An item with
 * NONE of those does not get "unknown" — it silently reads Primitive, which is how the voidshard
 * filed itself in the stone age and every cave bear carcass sat beside a rabbit's.
 *
 * A raw material dug or foraged off a map node genuinely IS available from turn one, so nodes are a
 * legitimate fourth source. Everything else has to say where it belongs.
 */
describe('every item can say which age it belongs to', () => {
  it('nothing falls back to Primitive for want of an answer', () => {
    const producers = new Set(RECIPES.flatMap((r: any) => Object.keys(r.outputs ?? {})));
    // A creature's attacks are not things a colony can have, and they never enter the age ladder.
    const NATURAL = (r: { path: string[] }) => r.path[0] === 'Natural weapons';
    // Sources the game HAS but that are not recipes, nodes or carcasses: a rack that dries meat by
    // decay, a shorn sheep, a hooked fish, a river, a hive. Each is a real way in — they are listed
    // rather than guessed so a genuinely sourceless item cannot hide among them.
    const OFF_LADDER = new Set([
      'water',
      'hay',
      'honey',
      'terra_preta',
      'sheep_fleece',
      'milk',
      'common_carp',
      'river_trout',
      'dried_meat',
      'dried_fruit',
      'rotten_food',
      'rotten_carcass',
      'pawn_carcass',
      'carried_pawn'
    ]);
    const bad = TREE_ITEMS.filter((r) => {
      const def = ITEMS.find((i: any) => i.id === r.id);
      if (!def || NATURAL(r) || OFF_LADDER.has(r.id)) return false;
      // `tier` is NOT an age source. It is a separate axis in its own column — a quality rank on
      // armour, the ADR-009 tool tier on a tool — and reading it as an age is what put a knapped
      // stone axe in the bronze age. An item still has to say where it actually comes from.
      if (producers.has(r.id)) return false;
      if (CARCASS_TIER.has(r.id)) return false;
      if (nodeItems.has(r.id)) return false;
      if (DROPS.has(r.id)) return false; // something in the world drops it
      return true;
    }).map(
      (r) =>
        `${r.id} has no recipe, no tier, no creature and no map node — it reads ${r.age} by default. ` +
        `Give it a tier, or a way in.`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

/**
 * `itemMatchesCostCategory` (itemDefs) and `recipeItemMatchesCategory` (RecipeService) are the same
 * rule written twice — the second exists only to break an import cycle. Two copies drift, and the
 * drift is invisible: the RecipeService copy silently lacked `fastener` for a while, so a slot the
 * sim would fill did not advertise itself in the used-by index. Held together by a test rather than
 * by remembering.
 */
describe('the two category matchers agree', () => {
  it('every item × category answers the same in both', () => {
    const cats = [
      'plank',
      'log',
      'fastener',
      'thread',
      'binding',
      'leather',
      'cured_hide',
      'metal',
      'steel',
      'iron',
      'stone',
      'block',
      'clay',
      'meat',
      'fish',
      'herb',
      'wool'
    ];
    const bad: string[] = [];
    for (const i of ITEMS as Array<{ id: string; category?: string; type?: string }>)
      for (const c of cats)
        if (itemMatchesCostCategory(i, c) !== recipeItemMatchesCategory(i, c))
          bad.push(`${i.id} × ${c}`);
    expect(bad.slice(0, 20), `${bad.length} disagreements: ${bad.slice(0, 20).join(', ')}`).toEqual(
      []
    );
  });
});

/** A cap keeps the sun off. A thing that stops a blade is a helm, a coif or a cervelliere. */
describe('helmets are not caps', () => {
  it('nothing worn on the head is called a cap', () => {
    const bad = (
      ITEMS as Array<{ id: string; name?: string; armorProperties?: { equipmentSlot?: string } }>
    )
      .filter(
        (i) => i.armorProperties?.equipmentSlot === 'head' && /\bcap\b|cap$/i.test(i.name ?? '')
      )
      .map(
        (i) => `${i.id} is called "${i.name}" — name it a helm, a coif, or whatever it actually is`
      );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

/**
 * The boss band is the top of every weapon line, and it is only meaningful if it covers all of them.
 * It sat at ONE family — axe — while being described as complete, because nothing asked.
 */
describe('the boss tier covers every weapon family', () => {
  it('each weapon family has at least one boss piece', () => {
    const fam = new Map<string, Set<string>>();
    for (const r of TREE_ITEMS) {
      if (r.path[0] !== 'Weapons') continue;
      const f = r.path[2] ?? '?';
      (fam.get(f) ?? fam.set(f, new Set()).get(f)!).add(r.age);
    }
    const bare = [...fam].filter(([, ages]) => !ages.has('Boss')).map(([f]) => f);
    expect(bare, `no boss weapon for: ${bare.join(', ')}`).toEqual([]);
  });
});

/**
 * A loot slot hands out what goes IN that slot. Merging a gauntlet into the greaves pick list parses
 * fine and rolls a hand piece onto a shin — the kind of mistake that only shows up as a pawn wearing
 * something absurd.
 */
describe('loot slots hand out gear for that slot', () => {
  it('every pick sits in the slot it is filed under', () => {
    const byId = new Map(
      (ITEMS as Array<{ id: string; armorProperties?: { equipmentSlot?: string } }>).map((i) => [
        i.id,
        i
      ])
    );
    const bad: string[] = [];
    const pools = (lootpoolData as { pools?: Record<string, any> }).pools ?? {};
    for (const [pid, pool] of Object.entries<any>(pools))
      for (const [slot, def] of Object.entries<any>(pool?.slots ?? {})) {
        if (slot === 'mainHand' || slot === 'offHand') continue; // weapons, not slotted armour
        for (const pick of def?.pick ?? []) {
          const worn = byId.get(pick.id)?.armorProperties?.equipmentSlot;
          if (worn && worn !== slot)
            bad.push(`${pid}.${slot} hands out ${pick.id}, which is worn on ${worn}`);
        }
      }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

/**
 * A boss piece is what a colony can only have by putting down something enormous. If one can be
 * stitched at a primitive workbench then the material was the only gate, and a fang on a stone bench
 * is just a fang — the whole band is given away.
 */
describe('boss gear is runed work', () => {
  it('no boss piece is craftable below a runed workstation', () => {
    const boss = new Set(TREE_ITEMS.filter((r) => r.age === 'Boss').map((r) => r.id));
    const bad: string[] = [];
    for (const r of RECIPES) {
      const out = Object.keys(r.outputs ?? {})[0];
      if (!out || !boss.has(out)) continue;
      const age = BUILDING_AGE.get(r.station ?? '') ?? 0;
      if (age < 5) bad.push(`${out} is made at ${r.station} — ${AGE_NAMES[age]} work, not runed`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});
