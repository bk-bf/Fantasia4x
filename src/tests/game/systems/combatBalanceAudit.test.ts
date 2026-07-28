import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import type { EntityStats, Mob, Pawn } from '$lib/game/core/types';

/**
 * COMBAT-BALANCE AUDIT — the open findings, checked against the REAL sim.
 *
 * Every claim in `docs/tasks/open/COMBAT-BALANCE.md` was first measured analytically (resolveHit
 * sweeps). This file re-checks the ones a fight can settle, through `HeadlessSession`: drafted
 * colonists, a live mob, real ticks, the real command path. A finding that survives here is `[x]` in
 * the doc; one that only a sweep shows stays `[~]`.
 *
 * It also serves as the post-rename regression gate — the core-stat rename touched every stat on
 * every pawn and mob, so "the sim still fights correctly" is itself a claim that needs a fight.
 *
 * Preflight (headless skill): flat map (default, every tile reachable), needs frozen,
 * `seedEntities: false` so the only mob is the one under test, and combat is driven by an explicit
 * draft order because the sim starts at night and mobs are vision-gated.
 */

const CREATURE = 'orc_reaver';
const MAX_TICKS = 12_000;

interface Duel {
  ticks: number;
  killed: boolean;
  /** Fraction of the mob's blood pool left when the fight ended (100 = untouched). */
  bloodPct: number;
  /** Did the colonist survive? A build can lose by dying, not only by failing to kill. */
  survived: boolean;
}

/** ONE drafted colonist vs ONE mob. The only variables are the ones a caller passes. */
async function duel(opts: {
  seed?: number;
  stats: Partial<EntityStats>;
  equip: string[];
  traits?: string[];
}): Promise<Duel> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: opts.seed ?? 4242,
      map: { w: 24, h: 24 },
      pawns: [
        {
          count: 1,
          drafted: true,
          stats: opts.stats,
          equip: opts.equip,
          ...(opts.traits ? { traits: opts.traits } : {})
        }
      ],
      needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
      spawnMobs: [{ count: 1, creatureId: CREATURE }],
      seedEntities: false
    })
  );

  const mobOf = (): Mob | undefined => s.getState().mobs?.[0];
  const start = mobOf();
  if (!start) throw new Error('no mob spawned');
  const startBlood = start.bloodVolume ?? start.maxBloodVolume ?? 1;

  const ids = (s.getState().pawns as Pawn[]).map((p) => p.id);
  s.command({
    type: 'attackTargetWith',
    payload: { ids, targetId: start.id, targetType: 'mob' }
  } as never);

  let ticks = 0;
  let last = mobOf();
  while (ticks < MAX_TICKS) {
    s.tick(20);
    ticks += 20;
    const m = mobOf();
    if (!m || m.isAlive === false) {
      last = m ?? last;
      break;
    }
    last = m;
  }
  const alive = last && last.isAlive !== false;
  const me = (s.getState().pawns as Pawn[]).find((p) => p.id === ids[0]);
  return {
    ticks,
    killed: !alive,
    bloodPct: Math.round((((last?.bloodVolume ?? 0) || 0) / startBlood) * 100),
    survived: !!me && me.isAlive !== false
  };
}

/** Mean over several seeds — a single fight ends in a handful of swings and is far too noisy. */
async function meanDuel(
  label: string,
  opts: Parameters<typeof duel>[0],
  seeds = [11, 23, 37, 41, 59, 71, 83, 97]
) {
  const runs: Duel[] = [];
  for (const seed of seeds) runs.push(await duel({ ...opts, seed }));
  // RIGHT-CENSORED: a run that never killed counts as the full budget. Averaging over the kills only
  // flatters whichever build fails most — it silently drops its worst runs.
  const ticks = runs.reduce((a, r) => a + (r.killed ? r.ticks : MAX_TICKS), 0) / runs.length;
  // Ticks among the runs that DID kill — answers "how fast does it kill", which is a different
  // question from "does it win the encounter" (the censored mean above). A glass cannon can lead on
  // this and still lose overall by dying; reporting only one of the two hides exactly that trade.
  const killed = runs.filter((r) => r.killed);
  const killTicks = killed.length ? killed.reduce((a, r) => a + r.ticks, 0) / killed.length : NaN;
  // Blood removed is the UNBIASED measure: every run contributes, kill or not.
  const blood = runs.reduce((a, r) => a + r.bloodPct, 0) / runs.length;
  return {
    label,
    ticks,
    blood,
    killTicks,
    kills: runs.filter((r) => r.killed).length,
    deaths: runs.filter((r) => !r.survived).length,
    of: runs.length
  };
}
const row = (r: Awaited<ReturnType<typeof meanDuel>>) =>
  `${r.label.padEnd(34)} ${String(Math.round(r.ticks)).padStart(6)} ticks   ${r.kills}/${r.of} kills   ` +
  `${r.deaths} deaths   blood left ${r.blood.toFixed(0)}%`;

describe('COMBAT-BALANCE audit — live sim', () => {
  it('POST-RENAME GATE: a mob spawns with its authored stat bands and a real fight resolves', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 7,
        map: { w: 24, h: 24 },
        pawns: [
          {
            count: 1,
            drafted: true,
            stats: { brawn: 30, agility: 30, vigour: 40 },
            equip: ['steel_longsword']
          }
        ],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        spawnMobs: [{ count: 1, creatureId: CREATURE }],
        seedEntities: false
      })
    );
    const mob = s.getState().mobs?.[0] as Mob;
    const st = mob.stats as unknown as EntityStats;
    console.log(
      `[GATE] ${CREATURE} spawned brawn ${st.brawn} · agility ${st.agility} · vigour ${st.vigour} · awareness ${st.awareness}`
    );
    // The rename's real failure mode: a key that no longer matches falls through to the 10 fallback
    // on EVERY creature, which no unit assertion would catch.
    expect(st.brawn).toBeGreaterThan(10);
    expect(
      [st.brawn, st.agility, st.vigour, st.awareness].every((v) => Number.isFinite(v) && v > 0)
    ).toBe(true);

    const pawn = (s.getState().pawns as Pawn[])[0];
    s.command({
      type: 'attackTargetWith',
      payload: { ids: [pawn.id], targetId: mob.id, targetType: 'mob' }
    } as never);
    const before = mob.bloodVolume ?? 0;
    for (let i = 0; i < 30 && (s.getState().mobs?.[0]?.isAlive ?? false); i++) s.tick(40);
    const after = s.getState().mobs?.[0]?.bloodVolume ?? 0;
    console.log(`[GATE] blood ${Math.round(before)} → ${Math.round(after)} over ≤1200 ticks`);
    expect(after).toBeLessThan(before); // damage still lands post-rename
  }, 120_000);

  it('#4 LANDED — a two-hander answers to BRAWN, the stat it names', async () => {
    // The doc's headline finding, in a real fight. Same greataxe, same aptitudes, only the physique
    // differs — and the weapon's own power stat is BRAWN. Before tasks 3–5 and 9 the AGILITY build won
    // this outright (1.89× faster, 2.9× the blood) because agility bought cadence, to-hit and crit on
    // top of damage. It buys none of them now.
    const equip = ['steel_greataxe'];
    const strong = await meanDuel('BRAWN 40 / AGILITY 10 (2H greataxe)', {
      stats: { brawn: 40, agility: 10, vigour: 30 },
      equip
    });
    const nimble = await meanDuel('BRAWN 10 / AGILITY 40 (2H greataxe)', {
      stats: { brawn: 10, agility: 40, vigour: 30 },
      equip
    });
    console.log('[#4 POWER STAT]\n' + row(strong) + '\n' + row(nimble));
    console.log(
      `  → the BRAWN build is ${(nimble.ticks / strong.ticks).toFixed(2)}× faster and removes ` +
        `${((100 - strong.blood) / (100 - nimble.blood)).toFixed(1)}× the blood, on a weapon whose power stat is BRAWN`
    );
    // The stat the weapon names is now the stat that wins with it — on time-to-kill AND on damage done.
    expect(strong.ticks).toBeLessThan(nimble.ticks);
    expect(100 - strong.blood).toBeGreaterThan(100 - nimble.blood);
  }, 600_000);

  it('#11 a strict downgrade now costs time', async () => {
    // `lumbering-fighter` is attack_speed ×0.6 AND hit_precision ×0.75 — an unambiguous downgrade that
    // used to make a stiletto FASTER (ratio 0.96×). Both stats are aptitudes now, so the trait's
    // multipliers bite a stable base instead of one inflated by the wielder's agility.
    const equip = ['steel_stiletto'];
    const plain = await meanDuel('stiletto, unimpaired', {
      stats: { brawn: 20, agility: 40, vigour: 30 },
      equip
    });
    const crippled = await meanDuel('stiletto + lumbering-fighter', {
      stats: { brawn: 20, agility: 40, vigour: 30 },
      equip,
      traits: ['lumbering-fighter']
    });
    console.log('[#11 PRECISION]\n' + row(plain) + '\n' + row(crippled));
    console.log(
      `  → crippled/unimpaired time-to-kill ratio ${(crippled.ticks / plain.ticks).toFixed(2)}× (should be > 1)`
    );
    // A strict downgrade must cost time. NOTE: `aimedBodyPart` still scores by armour alone — task 11
    // proper (lethality scoring) is NOT done; this passes because the stats feeding it were fixed.
    expect(crippled.ticks).toBeGreaterThan(plain.ticks);
  }, 600_000);

  it('#1 a flaw RAISES its stat, through the real command path', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 5,
        map: { w: 16, h: 16 },
        pawns: [{ count: 1, stats: { brawn: 12, agility: 12, vigour: 12, intellect: 12 } }],
        needsDisabled: ['hunger', 'fatigue'],
        seedEntities: false
      })
    );
    const id = (s.getState().pawns as Pawn[])[0].id;
    const before = { ...(s.getState().pawns as Pawn[])[0].stats };
    // frail = vigourBonus −2 · clumsy = agilityBonus −2 · dull = intellectBonus −2 (task 1, signed)
    s.command({
      type: 'devSetPawnTraits',
      payload: { pawnId: id, traitIds: ['frail', 'clumsy', 'dull'] }
    } as never);
    const after = (s.getState().pawns as Pawn[])[0].stats;
    console.log(
      `[#1 SIGNED GRANTS] frail+clumsy+dull → vigour ${before.vigour}→${after.vigour} · ` +
        `agility ${before.agility}→${after.agility} · intellect ${before.intellect}→${after.intellect}`
    );
    // Every one of them is a flaw, and every one of them now costs what it says it costs.
    expect(after.vigour).toBeLessThan(before.vigour);
    expect(after.agility).toBeLessThan(before.agility);
    expect(after.intellect).toBeLessThan(before.intellect);
  }, 120_000);

  it('#2 the sim itself is deterministic — the same seed replays identically', async () => {
    // The RNG finding is about the module DEFAULT seed, not the session: a scenario that pins its
    // seed must still replay byte-for-byte, or no tuning number above is trustworthy.
    const a = await duel({
      seed: 909,
      stats: { brawn: 30, agility: 20, vigour: 30 },
      equip: ['steel_longsword']
    });
    const b = await duel({
      seed: 909,
      stats: { brawn: 30, agility: 20, vigour: 30 },
      equip: ['steel_longsword']
    });
    console.log(
      `[#2 DETERMINISM] run A ${a.ticks} ticks / blood ${a.bloodPct}%  ·  run B ${b.ticks} ticks / blood ${b.bloodPct}%`
    );
    expect(b).toEqual(a);
  }, 300_000);
});
