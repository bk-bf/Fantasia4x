import { describe, it } from 'vitest';
import { TREE_ITEMS } from '$lib/dev/itemTree';

describe('branch audit', () => {
  it('every shelf: how many items, which ages, and whether the age spine is a stub', () => {
    const AGES = ['Primitive', 'Copper', 'Bronze', 'Iron', 'Steel', 'Runed', 'Boss'];
    const shelves = new Map<string, { n: number; ages: Set<string> }>();
    for (const r of TREE_ITEMS) {
      // the shelf is everything above the AGE level
      const idx = r.path.findIndex((p) => AGES.includes(p));
      const key = (idx > 0 ? r.path.slice(0, idx) : r.path).join(' > ');
      const e = shelves.get(key) ?? { n: 0, ages: new Set<string>() };
      e.n++;
      e.ages.add(r.age);
      shelves.set(key, e);
    }
    const LINES = ['gems & crystal', 'fibre & cloth', 'fuel', 'stone & masonry', 'seeds', 'primitive stock', 'hide & leather'];
    for (const line of LINES) {
      console.log(`\n== ${line}`);
      for (const r of TREE_ITEMS.filter((x) => x.path.join(' > ').includes(line)))
        console.log(`   ${r.age.padEnd(10)} ${r.id}`);
    }
    const rows = [...shelves.entries()].sort();
    console.log(`\n--- ${rows.length} shelves ---`);
    for (const [k, v] of rows) {
      const spread = AGES.filter((a) => v.ages.has(a));
      const flag = v.n >= 5 && spread.length <= 2 ? '  <<< STUB SPINE' : '';
      console.log(`  ${k.padEnd(46)} ${String(v.n).padStart(3)}  ${spread.join(',')}${flag}`);
    }
  });
});
