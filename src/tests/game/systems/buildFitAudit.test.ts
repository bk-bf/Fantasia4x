import { describe, it, expect } from 'vitest';
import { generateCulture } from '$lib/game/core/gen/culture';
import { generatePawns } from '$lib/game/entities/Pawns';
import { combatService } from '$lib/game/systems/Combat';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { createDefaultBodyParts } from '$lib/game/core/defs/bodyParts';
import { rng } from '$lib/game/core/util/rng';
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

const dummy = (): Pawn =>
  ({
    id: 'd',
    name: 'd',
    isAlive: true,
    position: { x: 0, y: 0 },
    currentState: 'Fighting',
    stats: { strength: 10, dexterity: 1, constitution: 10, perception: 10, intelligence: 10, charisma: 10 },
    traits: [],
    equipment: {
      bodyMid: { itemId: 'mail_hauberk', instanceId: 'a1', durability: 999 },
      head: { itemId: 'iron_nasal_helm', instanceId: 'a2', durability: 999 }
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

function population(cultures = 12, perCulture = 25): Pawn[] {
  rng.reseed(20260728);
  const out: Pawn[] = [];
  for (let i = 0; i < cultures; i++) out.push(...generatePawns(generateCulture(), perCulture));
  return out;
}

const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(1)}%`;

describe('BUILD FIT — generation and payoff', () => {
  const pop = population();
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

    for (const b of FIT_BUILDS)
      expect((byBuild.get(b) ?? []).length, `${b} is never any pawn's best fit`).toBeGreaterThan(0);
    for (const b of FIT_BUILDS) {
      const got = (byBuild.get(b) ?? []).length / pop.length;
      const want = INTENDED_SHARE[b] ?? 1 / FIT_BUILDS.length;
      expect(got, `${b} takes too much of the population`).toBeLessThan(want * 1.6 + 0.03);
      expect(got, `${b} is nearly unreachable`).toBeGreaterThan(want * 0.4);
    }
    const shieldShare = (byBuild.get('Sword & Shield') ?? []).length / pop.length;
    for (const b of FIT_BUILDS)
      if (b !== 'Sword & Shield')
        expect(
          shieldShare,
          `Sword & Shield must be at least as common as ${b} — it is the fallback build`
        ).toBeGreaterThanOrEqual((byBuild.get(b) ?? []).length / pop.length);
  });

  it('PAYOFF: fitting a build pays, measured against the same weapon rather than across weapon classes', () => {
    const rows = ['[PAYOFF] does fitting a build actually pay?'];

    const meanDps: Record<string, number> = {};
    for (const build of MELEE_FIT_BUILDS) {
      const prof = BUILD_PROFILES[build];
      const xs = pop.map((p) => dpsWith(p, prof.weapon, prof.offHand));
      meanDps[build] = xs.reduce((a, b) => a + b, 0) / xs.length;
    }

    rows.push('');
    rows.push('same weapon, best-fit pawn vs worst-fit pawn');
    rows.push('build                          weapon dps: best   worst   ratio');
    const ladder: [string, number, number][] = [];
    for (const build of MELEE_FIT_BUILDS) {
      const prof = BUILD_PROFILES[build];
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
    if (perTier.S && perTier.F) {
      const m = (t: string) => perTier[t].reduce((a, c) => a + c, 0) / perTier[t].length;
      expect(m('S'), 'S tier must out-perform F tier in-build').toBeGreaterThan(m('F'));
    }
  });

  it('the fit grade is a spectrum, not a coin flip', () => {
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
