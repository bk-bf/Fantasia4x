import { describe, it } from 'vitest';
import itemsData from '$lib/game/database/items/items.jsonc';
import { AGE_NAMES, AGE_CEILING, chainAgeOf, blameStation } from '$lib/dev/chainAge';
/* eslint-disable @typescript-eslint/no-explicit-any */
describe('declared tier vs derived chain', () => {
  it('counts where the hand-written tier disagrees with what the chain can build', () => {
    const items = itemsData as any[];
    const TIER_AGE = [0, 2, 3, 4, 5]; // tier -> the age its name implies
    const over: string[] = [];
    const under: string[] = [];
    for (const i of items) {
      if (typeof i.tier !== 'number') continue;
      const chain = chainAgeOf(i.id);
      const claimed = TIER_AGE[Math.min(Math.max(i.tier, 0), 4)];
      const floor = i.tier === 0 ? 0 : TIER_AGE[i.tier - 1] + 1; // tier 1 may sit at copper OR bronze
      if (chain > AGE_CEILING[Math.min(Math.max(i.tier, 0), 4)])
        under.push(`${i.id} t${i.tier} needs ${AGE_NAMES[chain]} (${blameStation(i.id) || '?'})`);
      else if (chain < floor)
        over.push(
          `${i.id} t${i.tier} claims ${AGE_NAMES[claimed]} but its chain is ${AGE_NAMES[chain]} (${blameStation(i.id) || 'no station'})`
        );
    }
    console.log(`\nTIER TOO LOW for the chain (R4 territory): ${under.length}`);
    for (const l of under.slice(0, 12)) console.log('   ' + l);
    console.log(`\nTIER TOO HIGH — buildable earlier than it claims: ${over.length}`);
    for (const l of over.slice(0, 30)) console.log('   ' + l);
  });
});
