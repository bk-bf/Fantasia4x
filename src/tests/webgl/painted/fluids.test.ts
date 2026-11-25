import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FLUID_DEFS,
  FLUID_IDS,
  FLUID_VEC4,
  FluidClock,
  hiddenUnderFluid
} from '$lib/webgl/painted/fluids';
import { groundFluid } from '$lib/webgl/painted/groundLevels';
import { STRAND_PACE } from '$lib/webgl/painted/riverStream';
import { WaveClock } from '$lib/webgl/painted/waves';
import { applyTuning, fluidFile, tuningOf } from '$lib/stores/fluidTuning';

const EAST = { x: 1, y: 0 };
const RIPPLE_PX = (0.26 * 8 * 0.9 * 2048) / 553;
const TAU = Math.PI * 2;
const DATA = join(__dirname, '../../../lib/webgl/painted/fluids.json');

describe('the water definition', () => {
  it('moves the lake grain and the river exactly as the old constants did', () => {
    const clock = new WaveClock();
    let now = 0;
    clock.tick(now, 0.4, EAST, false);
    for (let i = 0; i < 400; i++) clock.tick((now += 250), 0.4, EAST, false);
    for (const wind of [0, 0.3, 1]) {
      const sea = clock.uniforms(wind, EAST, 1);
      expect(sea[16 * 4 + 1]).toBeCloseTo(RIPPLE_PX * (0.4 + 1.2 * wind), 4);
      expect(sea[16 * 4 + 3]).toBeCloseTo(clock.t % (2.4 * 400), 3);
      expect(sea[17 * 4 + 1]).toBeCloseTo((clock.flow * STRAND_PACE * 46) / 2, 2);
    }
  });

  it('hands the shader the values the old water read as constants', () => {
    const u = new FluidClock().uniforms(FLUID_DEFS);
    const at = (slot: number) => [...u.slice(slot * 4, slot * 4 + 4)];
    expect(at(1)[3]).toBe(1);
    expect(at(2)).toEqual([1, 0, 0, 3]);
    expect(at(3)).toEqual([1, 1, 0, Math.fround(0.8)]);
    expect(at(4)).toEqual([0, 1, 1, 0]);
    expect(at(5)).toEqual([1, 1, 1, 1]);
    expect(at(6)).toEqual([Math.fround(2.4), 46, 0, 0]);
  });
});

describe('fluids on the ground', () => {
  it('lays bog under a fluid of its own and leaves water to the wave path', () => {
    expect(FLUID_IDS[0]).toBe('water');
    expect(groundFluid('bog')).toBe(FLUID_IDS.indexOf('bog') + 1);
    expect(groundFluid('water')).toBe(0);
    expect(groundFluid('shallow_water')).toBe(0);
    expect(groundFluid('grass')).toBe(0);
  });

  it('leaves the bog deposit undrawn under the bog', () => {
    expect(hiddenUnderFluid('bog_deposit')).toBe(true);
    expect(hiddenUnderFluid('hematite')).toBe(false);
  });

  it('drifts on its own clock with no jump however long the game runs', () => {
    const clock = new FluidClock();
    const bog = FLUID_IDS.indexOf('bog') * FLUID_VEC4 * 4;
    let now = 0;
    clock.tick(now, FLUID_DEFS, 0.5, EAST, false);
    let last = [...clock.uniforms(FLUID_DEFS).slice(bog, bog + 7)];
    const periods = [2048, 2048, 2048, 2048, 1024 / 0.04, 1024 / 0.04, TAU];
    for (let i = 0; i < 4 * 3600; i++) {
      clock.tick((now += 250), FLUID_DEFS, 0.5, EAST, false);
      const next = [...clock.uniforms(FLUID_DEFS).slice(bog, bog + 7)];
      next.forEach((v, k) => {
        const step = Math.abs(v - last[k]);
        expect(Math.min(step, periods[k] - step)).toBeLessThan(0.5);
      });
      last = next;
    }
    expect(last[0]).toBeGreaterThan(0);
    expect(last[6]).toBeGreaterThanOrEqual(0);
  });

  it('holds still when told to', () => {
    const clock = new FluidClock();
    clock.tick(0, FLUID_DEFS, 0.5, EAST, false);
    clock.tick(500, FLUID_DEFS, 0.5, EAST, false);
    const before = [...clock.uniforms(FLUID_DEFS)];
    clock.tick(5000, FLUID_DEFS, 0.5, EAST, true);
    expect([...clock.uniforms(FLUID_DEFS)]).toEqual(before);
  });
});

describe('tuning the fluids', () => {
  it('copies the untouched values back as the data file, byte for byte', () => {
    expect(fluidFile(FLUID_DEFS)).toBe(readFileSync(DATA, 'utf8'));
  });

  it('takes a tuned value it knows and ignores the rest', () => {
    const tuned = applyTuning(FLUID_DEFS, {
      bog: { drift: 2, opacity: Number.NaN, tint: [0.5, 0.5, 0.5] },
      water: { opacity: 0.3 },
      lava: { drift: 9 }
    });
    expect(tuned.bog.drift).toBe(2);
    expect(tuned.bog.opacity).toBe(FLUID_DEFS.bog.opacity);
    expect(tuned.bog.tint).toEqual([0.5, 0.5, 0.5]);
    expect(tuned.water.opacity).toBeUndefined();
    expect(tuned.lava).toBeUndefined();
    expect(FLUID_DEFS.bog.drift).toBe(0.6);
    expect(applyTuning(FLUID_DEFS, tuningOf(tuned))).toEqual(tuned);
  });
});
