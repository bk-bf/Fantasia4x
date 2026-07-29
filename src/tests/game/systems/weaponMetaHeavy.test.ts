import { describe, it, expect } from 'vitest';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ARMOUR, STYLES, duel } from './weaponMetaHarness';

/**
 * ARMOUR SWEEP — target wearing HEAVY, attacker always naked.
 *
 * One armour class per FILE, deliberately. Vitest runs the tests inside a file sequentially in a single
 * worker, so the whole sweep as one file used exactly one core and left seven idle on an 8-core box
 * (~45 minutes). Split like this the four classes run at once, and the sweep costs what its slowest
 * class costs. The sim's one-live-session-per-process rule (HeadlessSession) is why the parallelism has
 * to come from separate processes rather than concurrent tests.
 *
 * Writes its ranking to `.debug/weapon-meta-heavy.json` so the cross-class movement table (which
 * style climbs when the target armours up) can still be assembled from the four separate runs.
 */
const CLASS = 'heavy';
const SEEDS = [11, 23, 37];
const PROGRESS = '.debug/weapon-meta-progress.log';

describe(`WEAPON META — target in heavy armour`, () => {
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
    } catch {
      /* ignore */
    }

    for (const A of STYLES)
      for (const B of STYLES) {
        if (A.label === B.label) continue;
        for (const seed of SEEDS) {
          const r = await duel(seed, A, B, armour);
          if (r.aWon) won[A.label]++;
          dealt[A.label].dmg += r.aDamage;
          dealt[A.label].hits += r.aHits;
          // Vitest buffers a test's console output until the test ENDS, so a sweep this long looks
          // frozen from outside; writing straight to disk is what makes `tail -f` work.
          if (++done % 50 === 0 || done === total)
            try {
              appendFileSync(
                PROGRESS,
                `  [heavy] ${done} of ${total} (${((done / total) * 100).toFixed(1)}%)\n`
              );
            } catch {
              /* progress reporting must never fail the audit */
            }
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
    } catch {
      /* ignore */
    }

    console.log(
      `[ARMOUR SWEEP · target in HEAVY] attacker always naked, ${fights} fights each\n` +
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
