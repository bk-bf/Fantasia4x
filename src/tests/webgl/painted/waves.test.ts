import { describe, it, expect } from 'vitest';
import { DEEP, DIST_STEPS, LAND, SHALLOW, shoreField } from '$lib/webgl/painted/shoreField';
import {
  STILL_WATER_TILES,
  SEA_SLOTS,
  WaveClock,
  gustiness,
  waterBlockShift,
  waterStill
} from '$lib/webgl/painted/waves';
import { iceRect } from '$lib/webgl/painted/waterIce';

const EAST = { x: 1, y: 0 };

function lake(w: number, h: number, deepFrom: number): Uint8Array {
  const classes = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      classes[y * w + x] = x === 0 ? LAND : x >= deepFrom ? DEEP : SHALLOW;
  return classes;
}

describe('the shore field', () => {
  it('counts the distance to land in steps of a tile, zero on land', () => {
    const field = shoreField(lake(12, 3, 6), 12, 3);
    const dist = (x: number) => field[(1 * 12 + x) * 2];
    expect(dist(0)).toBe(0);
    expect(dist(1)).toBe(DIST_STEPS);
    expect(dist(3)).toBe(3 * DIST_STEPS);
    expect(dist(11)).toBe(255);
  });

  it('deepens in several steps from the shore into deep water, with no jump at the deep edge', () => {
    const w = 16;
    const field = shoreField(lake(w, 9, 6), w, 9);
    const depth = Array.from({ length: w }, (_, x) => field[(4 * w + x) * 2 + 1]);
    expect(depth[0]).toBe(0);
    for (let x = 2; x < w; x++) expect(depth[x]).toBeGreaterThanOrEqual(depth[x - 1]);
    const steps = depth.slice(1).map((d, i) => d - depth[i]);
    expect(Math.max(...steps)).toBeLessThan(64);
    expect(depth[w - 1]).toBe(255);
    const between = depth.filter((d) => d > 40 && d < 215);
    expect(between.length).toBeGreaterThanOrEqual(3);
  });

  it('reads the map edge as more water, not as land', () => {
    const classes = new Uint8Array(9).fill(SHALLOW);
    expect(shoreField(classes, 3, 3)[8]).toBe(255);
  });
});

describe('the wave clock', () => {
  it('keeps each wave train in step with its own frequency, however long the game runs', () => {
    const clock = new WaveClock();
    clock.tick(0, 0.5, EAST, false);
    let now = 0;
    for (let i = 0; i < 40_000; i++) clock.tick((now += 250), 0.5, EAST, false);
    const phases = clock.uniforms(0.5, EAST, 1).slice(0, 4);
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(Math.PI * 2);
    }
    const reference = Math.sqrt((9.8 * Math.PI * 2) / 30) * 0.55 * clock.waveT;
    expect(Math.cos(phases[0])).toBeCloseTo(Math.cos(reference), 4);
  });

  it('moves smoothly from one frame to the next, with no jump back', () => {
    const clock = new WaveClock();
    let now = 0;
    clock.tick(now, 0.3, EAST, false);
    let last = clock.uniforms(0.3, EAST, 1);
    for (let i = 0; i < 600; i++) {
      clock.tick((now += 16), 0.3, EAST, false);
      const next = clock.uniforms(0.3, EAST, 1);
      for (let k = 0; k < 4; k++) {
        const turn = Math.abs(Math.atan2(Math.sin(next[k] - last[k]), Math.cos(next[k] - last[k])));
        expect(turn).toBeLessThan(0.2);
      }
      last = next;
    }
  });

  it('holds still in the still zoom range and fills every slot of the sea uniform', () => {
    const clock = new WaveClock();
    clock.tick(0, 0.4, EAST, false);
    clock.tick(500, 0.4, EAST, false);
    const before = clock.uniforms(0.4, EAST, 8);
    clock.tick(5000, 0.4, EAST, true);
    expect([...clock.uniforms(0.4, EAST, 8)]).toEqual([...before]);
    expect(before.length).toBe(SEA_SLOTS * 4);
  });

  it('carries the wave strength over the old texture in the last slot', () => {
    const clock = new WaveClock();
    clock.tick(0, 0.4, EAST, false);
    expect(clock.uniforms(0.4, EAST, 1, 0.6).at(-1)).toBeCloseTo(0.6, 6);
    expect(clock.uniforms(0.4, EAST, 1).at(-1)).toBe(1);
  });

  it('stills the water only at the farthest zoom', () => {
    expect(waterStill(2.88)).toBe(true);
    expect(waterStill(STILL_WATER_TILES.to)).toBe(false);
    expect(waterStill(64)).toBe(false);
  });

  it('samples blocks of whole art pixels never smaller than a screen pixel', () => {
    for (const artPerPx of [0.5, 1, 1.33, 2, 2.5, 11.1]) {
      const block = 2 ** waterBlockShift(artPerPx);
      expect(block).toBeGreaterThanOrEqual(artPerPx);
      expect(block).toBeLessThan(Math.max(2, artPerPx * 2));
    }
  });

  it('carries the ripple and glint grain along the wind heading, faster in a stronger wind', () => {
    const run = (wind: number, dir: { x: number; y: number }) => {
      const clock = new WaveClock();
      clock.tick(0, wind, dir, false);
      for (let now = 100; now <= 1000; now += 100) clock.tick(now, wind, dir, false);
      return clock.ripple;
    };
    const east = run(0.3, EAST);
    expect(east.x).toBeGreaterThan(0);
    expect(east.y).toBe(0);
    const south = run(0.3, { x: 0, y: 1 });
    expect(south.x).toBe(0);
    expect(south.y).toBeGreaterThan(0);
    expect(run(0.9, EAST).x).toBeGreaterThan(east.x);
  });

  it('puts the rain and the gustiness of the weather in the surge slot', () => {
    const clock = new WaveClock();
    clock.tick(0, 0.5, EAST, false);
    const sea = clock.uniforms(0.5, EAST, 1, 1, { rain: 0.75 });
    expect(sea[12 * 4 + 1]).toBeCloseTo(0.75, 6);
    expect(sea[12 * 4 + 3]).toBeCloseTo(gustiness(0.5, 0.75), 6);
    expect(gustiness(1, 1)).toBe(1);
    expect(gustiness(0.9, 0)).toBeGreaterThan(gustiness(0.1, 0));
  });
});

describe('the water ice upload', () => {
  it('covers only the changed tiles that lie on the map', () => {
    expect(
      iceRect(
        [
          { x: 3, y: 4 },
          { x: 6, y: 2 },
          { x: 40, y: 1 }
        ],
        10,
        10
      )
    ).toEqual({ x: 3, y: 2, w: 4, h: 3 });
    expect(iceRect([{ x: -1, y: 0 }], 10, 10)).toBeNull();
  });
});
