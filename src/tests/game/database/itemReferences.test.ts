import { describe, it, expect } from 'vitest';
import itemsData from '$lib/game/database/items/items.jsonc';
import resourcesData from '$lib/game/database/world/resources.jsonc';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import type { Item } from '$lib/game/core/types';

const ITEMS = itemsData as unknown as Item[];
const itemIds = new Set(ITEMS.map((i) => i.id));

describe('items.jsonc is internally consistent', () => {
  it('has no duplicate ids', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const it of ITEMS) {
      if (seen.has(it.id)) dupes.push(it.id);
      else seen.add(it.id);
    }
    expect(dupes).toEqual([]);
  });
});

describe('resources.jsonc yields resolve to real items', () => {
  it('every harvest/forage yield itemId exists in items.jsonc', () => {
    const referenced = new Set<string>();
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
          if (k === 'itemId' && typeof v === 'string') referenced.add(v);
          else walk(v);
        }
      }
    };
    walk(resourcesData);
    const missing = [...referenced].filter((id) => !itemIds.has(id));
    expect(missing, `resource yields with no items.jsonc def: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('recipes.jsonc inputs/outputs resolve to real items', () => {
  it('every recipe input/inputAlternative/output itemId exists in items.jsonc', () => {
    type Recipe = {
      id: string;
      inputs?: Record<string, number>;
      inputAlternatives?: Record<string, number>[];
      outputs?: Record<string, number>;
    };
    const recipes = recipesData as unknown as Recipe[];
    const missing: string[] = [];
    for (const r of recipes) {
      const maps: (Record<string, number> | undefined)[] = [
        r.inputs,
        r.outputs,
        ...(r.inputAlternatives ?? [])
      ];
      for (const m of maps) {
        if (!m) continue;
        for (const id of Object.keys(m)) {
          if (id.startsWith('category:')) continue;
          if (!itemIds.has(id)) missing.push(`${r.id} → ${id}`);
        }
      }
    }
    expect(missing, `recipe ids with no items.jsonc def:\n${missing.join('\n')}`).toEqual([]);
  });
});
