import { describe, it, expect } from 'vitest';
import {
  computeTileLightLevel,
  getAmbientLight,
  TURNS_PER_DAY
} from '$lib/game/services/EnvironmentService';
import { TICKS_PER_SECOND } from '$lib/game/core/util/time';
import { lightWorkMultiplier } from '$lib/game/systems/pawn/pawnHelpers';
import { jobService } from '$lib/game/services/JobService';

const TICKS_PER_DAY = TURNS_PER_DAY * TICKS_PER_SECOND;
let darkTurn = 0;
let brightTurn = 0;
let minA = Infinity;
let maxA = -Infinity;
for (let t = 0; t < TICKS_PER_DAY; t += 60) {
  const a = getAmbientLight(t);
  if (a < minA) {
    minA = a;
    darkTurn = t;
  }
  if (a > maxA) {
    maxA = a;
    brightTurn = t;
  }
}

const fire = (x: number, y: number) =>
  ({ id: 'c', type: 'campfire', status: 'complete', lit: true, x, y }) as never;

describe('LIGHT-1 — tile light feeds the work-speed multiplier', () => {
  it('the ambient curve actually has a dark and a bright phase', () => {
    expect(minA).toBeLessThan(1);
    expect(maxA).toBeGreaterThan(minA);
  });

  it('darkness lowers the work multiplier; daylight is full speed', () => {
    const darkMult = lightWorkMultiplier(computeTileLightLevel(darkTurn, [], 5, 5));
    const dayMult = lightWorkMultiplier(computeTileLightLevel(brightTurn, [], 5, 5));
    expect(darkMult).toBeLessThan(dayMult);
    expect(darkMult).toBe(0.4);
    expect(dayMult).toBe(1);
  });

  it('a lit fire on the tile cancels the night penalty', () => {
    const darkNoFire = lightWorkMultiplier(computeTileLightLevel(darkTurn, [], 5, 5));
    const darkByFire = lightWorkMultiplier(computeTileLightLevel(darkTurn, [fire(5, 5)], 5, 5));
    expect(darkByFire).toBeGreaterThan(darkNoFire);
    expect(darkByFire).toBe(1);
  });

  it('only sight-dependent jobs are light-affected (carrying jobs shrug off the dark)', () => {
    for (const t of ['harvest', 'construct', 'deconstruct', 'craft']) {
      expect(jobService.isJobLightAffected(t), t).toBe(true);
    }
    for (const t of ['haul', 'fetch', 'refuel']) {
      expect(jobService.isJobLightAffected(t), t).toBe(false);
    }
  });
});
