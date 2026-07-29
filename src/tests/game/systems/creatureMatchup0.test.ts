import { describe, it, expect } from 'vitest';
import { runShard, shardOf, WEAPONS, SEEDS } from './creatureMatchupHarness';

/**
 * WEAPON x CREATURE, shard 0 of 8 — see `creatureMatchupHarness.ts` for the design.
 *
 * One shard per file so the eight run at once. Shards are round-robin over the creature list, so each
 * gets a mix of tiers and they finish at about the same time.
 */
describe('WEAPON x CREATURE — shard 0', () => {
  it('every weapon against this shard of the real hostile creatures', async () => {
    const rows = await runShard(0);
    const creatures = shardOf(0);
    const best = rows.slice().sort((a, b) => b.effectPer1k - a.effectPer1k).slice(0, 8);
    console.log(
      `[CREATURES shard 0] ${creatures.length} creatures x ${WEAPONS.length} weapons x ${SEEDS.length} fights\n` +
        'best matchups in this shard (combat value wrecked per 1000 ticks):\n' +
        best
          .map(
            (r) =>
              `  ${r.weapon.padEnd(16)} vs ${r.creature.padEnd(22)} T${r.tier}  ` +
              `${r.effectPer1k.toFixed(1)} pts  ${r.landed} hits  ${r.kills}/${r.fights} kills`
          )
          .join('\n')
    );
    expect(rows.length).toBe(creatures.length * WEAPONS.length);
  }, 5_400_000);
});
