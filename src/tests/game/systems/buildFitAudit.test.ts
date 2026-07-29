import { describe, it, expect } from 'vitest';
import { generateCulture } from '$lib/game/core/Culture';
import { generatePawns } from '$lib/game/entities/Pawns';
import { combatService } from '$lib/game/systems/Combat';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { createDefaultBodyParts } from '$lib/game/core/BodyParts';
import { rng } from '$lib/game/core/rng';
import {
  BUILD_PROFILES,
  FIT_BUILDS,
  MELEE_FIT_BUILDS,
  fitOf,
  calibrate,
  INTENDED_SHARE,
  tierOf,
  type Tier
} from '$lib/dev/buildFit';
import type { GameState, Pawn } from '$lib/game/core/types';

/**
 * BUILD-FIT AUDIT — does pawn generation produce pawns that fit a build, and does fitting one pay?
 *
 * Two questions, in order:
 *   1. GENERATION — grade a large sample of REAL generated pawns (`generateCulture` → `generatePawns`,
 *      the same path a new game uses) against every build profile. Report which builds the roller
 *      actually serves, the tier spread, and how specialised pawns come out.
 *   2. PAYOFF — take the best and worst fits and fight them with their OWN build's weapon and with a
 *      weapon from a build they do NOT fit. An S-tier pawn must beat an F-tier one, and must do
 *      better in-build than out — otherwise "build" is a label with no mechanics behind it.
 *
 * Damage is the real `resolveHit`; cadence is the real interval clamp. This is analytical `[~]` —
 * `combatBalanceAudit` is where a claim becomes `[x]`.
 */

const TPS = 60;
const BASE_ATTACK_INTERVAL_TICKS = 120;
const MIN_ATTACK_INTERVAL_TICKS = 72;

const fullLimbs = () =>
  (['head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'] as const).map((id) => ({
    id,
    health: 100,
    isMissing: false,
    bleedRate: 0,
    parts: createDefaultBodyParts(id)
  }));

const emptyState = { turn: 0, pawns: [], mobs: [], worldMap: [] } as unknown as GameState;

/** A mail-clad, low-evasion dummy — the same target every style is measured against. */
const dummy = (): Pawn =>
  ({
    id: 'd',
    name: 'd',
    isAlive: true,
    position: { x: 0, y: 0 },
    currentState: 'Fighting',
    stats: { brawn: 10, agility: 1, vigour: 10, awareness: 10, intellect: 10, charisma: 10 },
    traits: [],
    equipment: {
      bodyMid: { itemId: 'mail_hauberk', instanceId: 'a1', durability: 999 },
      headOuter: { itemId: 'iron_nasal_helm', instanceId: 'a2', durability: 999 }
    },
    limbs: fullLimbs(),
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 500,
    maxStamina: 500
  }) as unknown as Pawn;

/** Put this pawn behind a weapon (keeping its own stats + rolled aptitudes) and measure its dps. */
function dpsWith(pawn: Pawn, weapon: string, offHand?: string, n = 1200): number {
  const armed = {
    ...(pawn as unknown as Record<string, unknown>),
    limbs: fullLimbs(),
    equipment: {
      mainHand: { itemId: weapon, instanceId: 'w', durability: 999 },
      ...(offHand ? { offHand: { itemId: offHand, instanceId: 'o', durability: 999 } } : {})
    }
  } as unknown as Pawn;
  rng.reseed(4242);
  let dmg = 0;
  for (let i = 0; i < n; i++) dmg += combatService.resolveHit(armed, dummy(), emptyState).damage;
  const speed = Math.max(0.5, pawnStatService.evaluateStat('attack_speed', armed));
  const interval = Math.max(
    MIN_ATTACK_INTERVAL_TICKS,
    Math.round(BASE_ATTACK_INTERVAL_TICKS / speed)
  );
  return (dmg / n) * (TPS / interval);
}

/** A realistic founder population, drawn the way a new game draws it. */
function population(cultures = 12, perCulture = 25): Pawn[] {
  rng.reseed(20260728);
  const out: Pawn[] = [];
  for (let i = 0; i < cultures; i++) out.push(...generatePawns(generateCulture(), perCulture));
  return out;
}

const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(1)}%`;

describe('BUILD FIT — generation and payoff', () => {
  const pop = population();
  // Each build is graded against its OWN score distribution (see `calibrate`): comparing raw scores
  // across profiles just measures which weight vector has the widest spread, which is what previously
  // handed three builds 76% of the population.
  const calib = calibrate(pop);
  const fits = pop.map((p) => ({ pawn: p, fit: fitOf(p, calib) }));

  it('GENERATION: which builds the roller actually serves, and how well', () => {
    const byBuild = new Map<string, number[]>();
    const byTier = new Map<Tier, number>();
    for (const { fit } of fits) {
      (byBuild.get(fit.best.build) ?? byBuild.set(fit.best.build, []).get(fit.best.build)!).push(
        fit.best.score
      );
      byTier.set(fit.tier, (byTier.get(fit.tier) ?? 0) + 1);
    }
    const rows = [
      `[GENERATION] ${pop.length} pawns from 12 cultures, graded against ${FIT_BUILDS.length} builds`
    ];
    rows.push('best-fit build            pawns    share   mean fit');
    for (const b of FIT_BUILDS) {
      const s = byBuild.get(b) ?? [];
      const mean = s.length ? s.reduce((a, c) => a + c, 0) / s.length : 0;
      rows.push(
        b.padEnd(26) +
          String(s.length).padStart(5) +
          pct(s.length, pop.length).padStart(9) +
          mean.toFixed(3).padStart(11)
      );
    }
    rows.push('');
    rows.push('tier spread (fit of the pawn’s BEST build):');
    for (const t of ['S', 'A', 'B', 'C', 'D', 'F'] as Tier[])
      rows.push(
        `  ${t}  ${String(byTier.get(t) ?? 0).padStart(4)}  ${pct(byTier.get(t) ?? 0, pop.length)}`
      );
    const sc = fits.map((f) => f.fit.best.score).sort((a, b) => a - b);
    const q = (f: number) => sc[Math.floor(sc.length * f)].toFixed(3);
    rows.push('');
    rows.push(
      `fit-score percentiles: p5 ${q(0.05)} · p25 ${q(0.25)} · p50 ${q(0.5)} · p75 ${q(0.75)} · p95 ${q(0.95)}`
    );
    const margins = fits.map((f) => f.fit.margin).sort((a, b) => a - b);
    rows.push('');
    rows.push(
      `specialisation (gap from best build to runner-up): median ${margins[Math.floor(margins.length / 2)].toFixed(3)}, ` +
        `p90 ${margins[Math.floor(margins.length * 0.9)].toFixed(3)}, max ${margins[margins.length - 1].toFixed(3)}`
    );
    console.log(rows.join('\n'));

    // Generation must reach every build — a build no rolled pawn is ever best at is a dead build.
    for (const b of FIT_BUILDS)
      expect((byBuild.get(b) ?? []).length, `${b} is never any pawn's best fit`).toBeGreaterThan(0);
    // Shares are deliberately UNEVEN (see `INTENDED_SHARE`): sword and shield is the wide door almost
    // any body fits through, the specialists are narrow. So each build is checked against ITS OWN
    // intended share rather than a flat 1/N, with room for sampling noise at n=300.
    for (const b of FIT_BUILDS) {
      const got = (byBuild.get(b) ?? []).length / pop.length;
      const want = INTENDED_SHARE[b] ?? 1 / FIT_BUILDS.length;
      expect(got, `${b} takes too much of the population`).toBeLessThan(want * 1.6 + 0.03);
      expect(got, `${b} is nearly unreachable`).toBeGreaterThan(want * 0.4);
    }
    // And the default really must be the biggest door — that is the whole point of the split.
    const shieldShare = (byBuild.get('Sword & Shield') ?? []).length / pop.length;
    for (const b of FIT_BUILDS)
      if (b !== 'Sword & Shield')
        expect(
          shieldShare,
          `Sword & Shield must be at least as common as ${b} — it is the fallback build`
        ).toBeGreaterThanOrEqual((byBuild.get(b) ?? []).length / pop.length);
  });

  it('PAYOFF: fitting a build pays, measured against the same weapon rather than across weapon classes', () => {
    // The previous version compared a pawn's dps with its OWN build's weapon against its dps with some
    // other build's weapon, and read a one-hander as a failure every time. That is not a fit result: a
    // one-hander is DESIGNED to land near 60% of a two-hander (task 12d), so any 1H build loses that
    // comparison however perfectly the pawn suits it. Both halves below hold the WEAPON constant and
    // vary the pawn, or normalise by what an average pawn does with that weapon.
    const rows = ['[PAYOFF] does fitting a build actually pay?'];

    // Population mean dps per build weapon — the yardstick that makes 1H and 2H comparable.
    const meanDps: Record<string, number> = {};
    for (const build of MELEE_FIT_BUILDS) {
      const prof = BUILD_PROFILES[build];
      const xs = pop.map((p) => dpsWith(p, prof.weapon, prof.offHand));
      meanDps[build] = xs.reduce((a, b) => a + b, 0) / xs.length;
    }

    // (a) SAME WEAPON, different pawns: the pawn that best fits a build must out-fight the one that
    //     fits it worst, both holding that build's weapon.
    rows.push('');
    rows.push('same weapon, best-fit pawn vs worst-fit pawn');
    rows.push('build                          weapon dps: best   worst   ratio');
    const ladder: [string, number, number][] = [];
    for (const build of MELEE_FIT_BUILDS) {
      const prof = BUILD_PROFILES[build];
      // Rank the WHOLE population by their z for THIS build, not just the cohort that picked it.
      const ranked = fits
        .map((f) => ({ f, z: f.fit.all.find((b) => b.build === build)!.score }))
        .sort((a, b) => b.z - a.z);
      const best = dpsWith(ranked[0].f.pawn, prof.weapon, prof.offHand);
      const worst = dpsWith(ranked[ranked.length - 1].f.pawn, prof.weapon, prof.offHand);
      ladder.push([build, best, worst]);
      rows.push(
        build.padEnd(30) +
          best.toFixed(1).padStart(11) +
          worst.toFixed(1).padStart(8) +
          (best / worst).toFixed(2).padStart(8) +
          '\u00d7'
      );
    }

    // (b) SAME PAWN, different builds, each normalised by that weapon's population mean: a pawn should
    //     do relatively better in the build it fits than in the one it fits worst.
    rows.push('');
    rows.push(
      'same pawn, own best build vs own worst build (dps \u00f7 that weapon\u2019s population mean)'
    );
    let checked = 0;
    let inBeatsOut = 0;
    const perTier: Record<string, number[]> = {};
    for (const { pawn, fit } of fits) {
      const mine = fit.all.find((b) => MELEE_FIT_BUILDS.includes(b.build));
      const theirs = fit.all
        .slice()
        .reverse()
        .find((b) => MELEE_FIT_BUILDS.includes(b.build));
      if (!mine || !theirs || mine.build === theirs.build) continue;
      const pIn = BUILD_PROFILES[mine.build];
      const pOut = BUILD_PROFILES[theirs.build];
      const relIn = dpsWith(pawn, pIn.weapon, pIn.offHand) / meanDps[mine.build];
      const relOut = dpsWith(pawn, pOut.weapon, pOut.offHand) / meanDps[theirs.build];
      (perTier[fit.tier] ??= []).push(relIn);
      checked++;
      if (relIn > relOut) inBeatsOut++;
    }
    rows.push(
      `  in-build beat out-of-build in ${inBeatsOut}/${checked} (${pct(inBeatsOut, checked)})`
    );
    rows.push('');
    rows.push('relative in-build dps by tier (1.00 = an average pawn with that weapon):');
    for (const t of ['S', 'A', 'B', 'C', 'D', 'F'] as Tier[])
      if (perTier[t])
        rows.push(
          `  ${t}  ${(perTier[t].reduce((a, c) => a + c, 0) / perTier[t].length).toFixed(3)}  (n=${perTier[t].length})`
        );
    console.log(rows.join('\n'));

    for (const [b, best, worst] of ladder)
      expect(best, `${b}: the best-fit pawn must out-fight the worst-fit one`).toBeGreaterThan(
        worst
      );
    expect(inBeatsOut / checked, 'in-build should win most of the time').toBeGreaterThan(0.5);
    // The tier ladder must be monotone where it has data: an S pawn out-performs an F one, relative to
    // the same weapon.
    if (perTier.S && perTier.F) {
      const m = (t: string) => perTier[t].reduce((a, c) => a + c, 0) / perTier[t].length;
      expect(m('S'), 'S tier must out-perform F tier in-build').toBeGreaterThan(m('F'));
    }
  });

  it('the fit grade is a spectrum, not a coin flip', () => {
    // A grading formula that lumps everyone at one score is useless for build assignment. Check that
    // the scores actually spread, and that the tier ladder is monotone in fit by construction.
    const scores = fits.map((f) => f.fit.best.score).sort((a, b) => a - b);
    const lo = scores[Math.floor(scores.length * 0.05)];
    const hi = scores[Math.floor(scores.length * 0.95)];
    console.log(
      `[SPECTRUM] best-fit score p5 ${lo.toFixed(3)} … p95 ${hi.toFixed(3)} (spread ${(hi - lo).toFixed(3)}), ` +
        `tiers at the ends: ${tierOf(lo)} … ${tierOf(hi)}`
    );
    expect(hi - lo, 'fit scores must actually spread across the population').toBeGreaterThan(0.1);
  });
});
