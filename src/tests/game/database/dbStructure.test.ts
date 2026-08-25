import { describe, it, expect } from 'vitest';
import buildingsData from '$lib/game/database/world/buildings.jsonc';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import { TREE_ITEMS } from '$lib/dev/itemTree';
/* eslint-disable @typescript-eslint/no-explicit-any */

const BUILDINGS = buildingsData as any[];
const RECIPES = recipesData as any[];
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
