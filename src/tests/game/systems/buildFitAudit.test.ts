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
  const fits = pop.map((p) => ({ pawn: p, fit: fitOf(p) }));

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
    // …and it must not funnel everyone into one.
    for (const [b, s] of byBuild)
      expect(s.length / pop.length, `${b} takes too much of the population`).toBeLessThan(0.5);
  });

  it('PAYOFF: an S-tier pawn beats an F-tier one, and does better IN its build than outside it', () => {
    const rows = [
      '[PAYOFF] dps with the build’s own weapon vs a weapon from a build it does not fit'
    ];
    rows.push('build                     tier  in-build   out-of-build   in/out');
    let checked = 0;
    let inBeatsOut = 0;
    const perTier: Record<string, number[]> = {};
    const byBuildPair: Record<string, { best: number; worst: number }> = {};

    // MELEE only: a bow swung at melee range measures the fumble, not the build.
    for (const build of MELEE_FIT_BUILDS) {
      const cohort = fits.filter((f) => f.fit.best.build === build);
      if (!cohort.length) continue;
      const sorted = cohort.slice().sort((a, b) => b.fit.best.score - a.fit.best.score);
      const prof = BUILD_PROFILES[build];
      // "Outside its build" = the MELEE build this pawn fits worst, so both sides of the comparison
      // resolve through the same path and the ratio means something.
      const worstBuild = sorted[0].fit.all
        .slice()
        .reverse()
        .find((b) => MELEE_FIT_BUILDS.includes(b.build) && b.build !== build)!.build;
      const other = BUILD_PROFILES[worstBuild];

      for (const [label, entry] of [
        ['best', sorted[0]],
        ['worst', sorted[sorted.length - 1]]
      ] as const) {
        const inB = dpsWith(entry.pawn, prof.weapon, prof.offHand);
        const outB = dpsWith(entry.pawn, other.weapon, other.offHand);
        (perTier[entry.fit.tier] ??= []).push(inB);
        (byBuildPair[build] ??= { best: 0, worst: 0 })[label] = inB;
        checked++;
        if (inB > outB) inBeatsOut++;
        rows.push(
          build.padEnd(26) +
            `${entry.fit.tier}(${label})`.padEnd(12) +
            inB.toFixed(1).padStart(7) +
            outB.toFixed(1).padStart(14) +
            (inB / outB).toFixed(2).padStart(9) +
            '×  vs ' +
            worstBuild
        );
      }
    }
    rows.push('');
    rows.push(`in-build beat out-of-build in ${inBeatsOut}/${checked} cases`);
    for (const t of ['S', 'A', 'B', 'C', 'D', 'F'])
      if (perTier[t])
        rows.push(
          `  tier ${t}: mean in-build dps ${(perTier[t].reduce((a, c) => a + c, 0) / perTier[t].length).toFixed(1)} (n=${perTier[t].length})`
        );
    console.log(rows.join('\n'));

    // The claim under test, in two halves:
    // (a) a BETTER fit must beat a worse fit ON THE SAME WEAPON — the tier ladder has to mean something;
    for (const [b, pair] of Object.entries(byBuildPair))
      expect(pair.best, `${b}: the best-fit pawn must out-fight the worst-fit one`).toBeGreaterThan(
        pair.worst
      );
    // (b) and playing to your build has to beat playing against it, most of the time.
    expect(inBeatsOut / checked, 'in-build should win most of the time').toBeGreaterThan(0.5);
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
