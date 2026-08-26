import { describe, it, expect } from 'vitest';
import buildingsData from '$lib/game/database/world/buildings.jsonc';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import { TREE_ITEMS } from '$lib/dev/itemTree';
import { AGE_NAMES, BUILDING_AGE, CARCASS_TIER, nodeItems } from '$lib/dev/chainAge';
import lootpoolData from '$lib/game/database/items/lootpool.jsonc';
import { itemMatchesCostCategory } from '$lib/game/core/defs/items';
import { recipeItemMatchesCategory } from '$lib/game/services/RecipeService';
import itemsData from '$lib/game/database/items/items.jsonc';
/* eslint-disable @typescript-eslint/no-explicit-any */

const BUILDINGS = buildingsData as any[];
const RECIPES = recipesData as any[];
const ITEMS = itemsData as any[];
const DROPS = new Set<string>();
(function scan(o: unknown): void {
  if (Array.isArray(o)) return o.forEach(scan);
  if (!o || typeof o !== 'object') return;
  const n = o as Record<string, any>;
  if (typeof n.id === 'string' && (n.w !== undefined || n.weight !== undefined)) DROPS.add(n.id);
  for (const v of Object.values(n)) scan(v);
})(lootpoolData);
const byId = new Map(BUILDINGS.map((b) => [b.id, b]));

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
    const VAGUE = new Set(['other', 'misc', 'general', 'item', 'thing', 'stuff', 'consumable']);
    const bad = [...paths].filter(
      (p) => p.includes(' > ') && VAGUE.has(norm(p.split(' > ').pop()!))
    );
    expect(bad, `${bad.join('; ')} — give these items a real category`).toEqual([]);
  });
});

describe('every item can say which age it belongs to', () => {
  it('nothing falls back to Primitive for want of an answer', () => {
    const producers = new Set(RECIPES.flatMap((r: any) => Object.keys(r.outputs ?? {})));
    const NATURAL = (r: { path: string[] }) => r.path[0] === 'Natural weapons';
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
      if (producers.has(r.id)) return false;
      if (CARCASS_TIER.has(r.id)) return false;
      if (nodeItems.has(r.id)) return false;
      if (DROPS.has(r.id)) return false;
      return true;
    }).map(
      (r) =>
        `${r.id} has no recipe, no tier, no creature and no map node — it reads ${r.age} by default. ` +
        `Give it a tier, or a way in.`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

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

describe('the boss tier covers every weapon family', () => {
  it('each weapon family has at least one boss piece', () => {
    const fam = new Map<string, Set<string>>();
    for (const r of TREE_ITEMS) {
      if (r.path[0] !== 'Weapons') continue;
      const f = r.path[2] ?? '?';
      (fam.get(f) ?? fam.set(f, new Set()).get(f)!).add(r.age);
    }
    const ON_HOLD = new Set(['staff & rod']);
    const bare = [...fam]
      .filter(([f, ages]) => !ages.has('Boss') && !ON_HOLD.has(f))
      .map(([f]) => f);
    expect(bare, `no boss weapon for: ${bare.join(', ')}`).toEqual([]);
  });
});

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
        if (slot === 'mainHand' || slot === 'offHand') continue;
        for (const pick of def?.pick ?? []) {
          const worn = byId.get(pick.id)?.armorProperties?.equipmentSlot;
          if (worn && worn !== slot)
            bad.push(`${pid}.${slot} hands out ${pick.id}, which is worn on ${worn}`);
        }
      }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

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

describe('every recipe asks for a tool that exists', () => {
  it('no toolTierRequired exceeds the best tool made for that work', () => {
    const best = new Map<string, number>();
    for (const i of ITEMS as Array<{ type?: string; category?: string; tier?: number }>) {
      if (i.type !== 'tool' || typeof i.tier !== 'number' || !i.category) continue;
      best.set(i.category, Math.max(best.get(i.category) ?? 0, i.tier));
    }
    const ceiling = Math.max(...best.values());
    const bad = RECIPES.filter(
      (r: { toolTierRequired?: number }) => (r.toolTierRequired ?? 0) > ceiling
    ).map(
      (r: { id: string; toolTierRequired?: number }) =>
        `${r.id} needs tool tier ${r.toolTierRequired}; the best tool in the game is tier ${ceiling}`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

describe('hafted weapons are structurally sound', () => {
  const isWeapon = (id: string) =>
    (ITEMS as Array<{ id: string; type?: string }>).find((i) => i.id === id)?.type === 'weapon';
  const BOWS = /bow|recurve|sling|crossbow|arbalest/;

  it('no weapon is built straight out of a raw log', () => {
    const bad: string[] = [];
    for (const r of RECIPES) {
      const out = Object.keys(r.outputs ?? {})[0];
      if (!out || !isWeapon(out) || BOWS.test(out)) continue;
      const logs = Object.keys(r.inputs ?? {}).filter(
        (k) => k.endsWith('_log') || k === 'category:log'
      );
      if (logs.length)
        bad.push(
          `${r.id} puts ${logs.join('/')} straight into a weapon — work it into a haft first`
        );
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a head joined to a haft is fastened, not merely tied on', () => {
    const HAFT = /haft$|_stave$/;
    const JOINT = /fastener|nail|rivet|tack|mold|molten|_bar$|category:steel|category:iron/;
    const bad: string[] = [];
    for (const r of RECIPES) {
      const out = Object.keys(r.outputs ?? {})[0];
      if (!out || !isWeapon(out) || BOWS.test(out)) continue;
      const keys = Object.keys(r.inputs ?? {});
      if (!keys.some((k) => HAFT.test(k))) continue;
      if (!keys.some((k) => JOINT.test(k)))
        bad.push(`${r.id} has a haft and nothing mechanical holding the head to it`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

describe('magical wood is worked at a runed bench', () => {
  it('nothing consumes an arcane wood below a runed station', () => {
    const ARCANE_WOOD = /^(emberwood|moonwood|heartwood|witchwood|ironwood)_(log|plank|haft)$/;
    const bad: string[] = [];
    for (const r of RECIPES) {
      const uses = Object.keys(r.inputs ?? {}).filter((k) => ARCANE_WOOD.test(k));
      if (!uses.length) continue;
      const age = BUILDING_AGE.get(r.station ?? '') ?? 0;
      if (age < 5)
        bad.push(
          `${r.id} works ${uses.join('/')} at ${r.station} — ${AGE_NAMES[age]} work, not runed`
        );
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

/**
 * Two items with one display name are indistinguishable wherever a list shows names — a stockpile, a
 * craft card, the station recipe lists. The ids differ, but an id is backend reference and the player
 * never sees one. Three pairs shipped this way: two pies both called "Pie", and a mail bracer and a
 * riveted plate bracer both called "Riveted Iron Bracers".
 */
describe('no two items share a name', () => {
  it('every display name identifies exactly one item', () => {
    const seen = new Map<string, string[]>();
    for (const i of ITEMS as Array<{ id: string; name?: string }>) {
      if (!i.name) continue;
      seen.set(i.name, [...(seen.get(i.name) ?? []), i.id]);
    }
    const bad = [...seen.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([name, ids]) => `"${name}" is used by ${ids.join(' and ')}`);
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

describe('a workstation is named for equipment, not for a room', () => {
  const POWERED_MILLS = new Set(['donkey_mill', 'watermill', 'windmill']);
  const ROOMISH =
    /(house|works|shop|cellar|brewery|bakery|granary|lodge|walk|smithy)\b|\b(lab|apothecary|hall|barn|shed|room|hut|kitchen)\b/i;

  it('no workstation carries a name that reads as a building', () => {
    const bad = BUILDINGS.filter((b) => b.workstation && !POWERED_MILLS.has(b.id))
      .filter((b) => ROOMISH.test(b.name ?? ''))
      .map((b) => `${b.id} is called "${b.name}" — a room, not a thing a pawn works at`);
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('the deferred powered mills stay exempt only while they hold no recipes', () => {
    const bad = [...POWERED_MILLS]
      .filter((id) => RECIPES.some((r) => r.station === id))
      .map((id) => `${id} has recipes — see docs/tasks/open/MECHANICAL-POWER.md before adding any`);
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

describe('station ladders ascend', () => {
  const ladders = new Map<string, { id: string; rung: number; age: number; name: string }[]>();
  for (const b of BUILDINGS) {
    const e = b.effects ?? {};
    if (typeof e.family !== 'string' || typeof e.rung !== 'number') continue;
    const row = { id: b.id, rung: e.rung, age: BUILDING_AGE.get(b.id) ?? 0, name: b.name };
    ladders.set(e.family, [...(ladders.get(e.family) ?? []), row]);
  }

  it('a higher rung is never an earlier age than the rung below it', () => {
    const bad: string[] = [];
    for (const [family, rows] of ladders) {
      const sorted = [...rows].sort((a, b) => a.rung - b.rung);
      for (let i = 1; i < sorted.length; i++)
        if (sorted[i].age < sorted[i - 1].age)
          bad.push(
            `${family}: "${sorted[i].name}" (rung ${sorted[i].rung}, ${AGE_NAMES[sorted[i].age]}) ` +
              `sits above "${sorted[i - 1].name}" (${AGE_NAMES[sorted[i - 1].age]})`
          );
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

});
