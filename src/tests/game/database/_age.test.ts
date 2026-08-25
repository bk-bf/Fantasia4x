import { describe, it } from 'vitest';
import itemsData from '$lib/game/database/items/items.jsonc';
import { AGE_NAMES, chainAgeOf, blameStation } from '$lib/dev/chainAge';
/* eslint-disable @typescript-eslint/no-explicit-any */
describe('age spine', () => {
  it('dumps what sets each age', () => {
    const items = itemsData as any[];
    const show = (label: string, test: (i: any) => boolean) => {
      const set = items.filter(test);
      const by: Record<string, string[]> = {};
      for (const i of set) {
        const a = AGE_NAMES[chainAgeOf(i.id)] ?? '?';
        (by[a] ??= []).push(`${i.id}${blameStation(i.id) ? ` ←${blameStation(i.id)}` : ''}`);
      }
      console.log(`\n== ${label} (${set.length})`);
      for (const [a, ids] of Object.entries(by))
        console.log(`   ${a.padEnd(10)} (${ids.length}) ${ids.slice(0, 3).join(' | ')}`);
    };
    show('coating/oil', (i) => i.coatingEffect || /coating|_oil$|grace/.test(i.id));
    show('drink', (i) => (i.hydration ?? 0) > 0);
    show('potion/draught', (i) => i.type === 'fluid' && (i.conditionDurationTurns || i.traitGamble) && !i.coatingEffect);
    console.log(`\n== voidshard chainAge = ${AGE_NAMES[chainAgeOf('voidshard')]}`);
  });
});
