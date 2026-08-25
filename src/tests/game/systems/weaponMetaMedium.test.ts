import { describe, it, expect } from 'vitest';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ARMOUR, STYLES, duel } from './weaponMetaHarness';

const CLASS = 'medium';
const SEEDS = [11, 23, 37];
const PROGRESS = '.debug/weapon-meta-progress.log';

describe(`WEAPON META — target in medium armour`, () => {
  it('every naked attacker against every style', async () => {
    const armour = ARMOUR[CLASS];
    const won: Record<string, number> = {};
    const dealt: Record<string, { dmg: number; hits: number }> = {};
    for (const s of STYLES) {
      won[s.label] = 0;
      dealt[s.label] = { dmg: 0, hits: 0 };
    }

    const total = STYLES.length * (STYLES.length - 1) * SEEDS.length;
    let done = 0;
    try {
      mkdirSync('.debug', { recursive: true });
    } catch {}

    for (const A of STYLES)
      for (const B of STYLES) {
        if (A.label === B.label) continue;
        for (const seed of SEEDS) {
          const r = await duel(seed, A, B, armour);
          if (r.aWon) won[A.label]++;
          dealt[A.label].dmg += r.aDamage;
          dealt[A.label].hits += r.aHits;
          if (++done % 50 === 0 || done === total)
            try {
              appendFileSync(
                PROGRESS,
                `  [medium] ${done} of ${total} (${((done / total) * 100).toFixed(1)}%)\n`
              );
            } catch {}
        }
      }

    const fights = (STYLES.length - 1) * SEEDS.length;
    const ranked = Object.entries(won)
      .map(([k, v]) => ({
        style: k,
        wins: v,
        perHit: dealt[k].hits ? dealt[k].dmg / dealt[k].hits : 0
      }))
      .sort((a, b) => b.wins - a.wins);

    try {
      writeFileSync(
        `.debug/weapon-meta-${CLASS}.json`,
        JSON.stringify({ CLASS, fights, ranked }, null, 1)
      );
    } catch {}

    console.log(
      `[ARMOUR SWEEP · target in MEDIUM] attacker always naked, ${fights} fights each\n` +
        ranked
          .map(
            (r) =>
              `  ${r.style.padEnd(22)} won ${String(r.wins).padStart(3)} of ${fights}   ` +
              `${r.perHit.toFixed(1)} damage per landed hit`
          )
          .join('\n')
    );
    expect(ranked.length).toBe(STYLES.length);
  }, 3_600_000);
});
