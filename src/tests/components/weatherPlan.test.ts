import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeWeather, windVector } from '$lib/game/services/EnvironmentService';
import {
  advance,
  placeSheet,
  planWeather,
  tileImage,
  weatherScale,
  type WeatherSheet
} from '$lib/components/UI/weather/weatherPlan';
import { bakeWeather } from '../../../tools/tileset/weather.mjs';

const kinds = (type: string, light = 1) => planWeather(makeWeather(type), light).map((g) => g.kind);
const sheetsOf = (type: string) => planWeather(makeWeather(type), 1).flatMap((g) => g.sheets);
const centre = { x: 640, y: 400 };
const wrap = (v: number, p: number) => ((v % p) + p) % p;

function phaseAtCentre(s: WeatherSheet, at: { x: number; y: number; w: number }) {
  const z = at.w / s.w;
  return { x: wrap((centre.x - at.x) / z, s.w), y: wrap((centre.y - at.y) / z, s.h) };
}

describe('weather plan', () => {
  it('draws rain, fog and snow from the weather the game is in', () => {
    expect(kinds('clear')).toEqual([]);
    expect(kinds('rain')).toEqual(['rain']);
    expect(kinds('storm')).toEqual(['rain']);
    expect(kinds('fog')).toEqual(['fog']);
    expect(kinds('foggy_rain')).toEqual(['fog', 'rain']);
    expect(kinds('snow')).toEqual(['snow']);
    expect(kinds('winter_windy')).toEqual(['snow']);
    expect(kinds('autumn_windy')).toEqual([]);
  });

  it('uses the heavier rain sheets and a faster fall in a storm', () => {
    const [rain] = planWeather(makeWeather('rain'), 1);
    const [storm] = planWeather(makeWeather('storm'), 1);
    expect(rain.sheets[0].tile).toBe('rain0');
    expect(storm.sheets[0].tile).toBe('storm0');
    expect(storm.sheets[0].vy).toBeGreaterThan(rain.sheets[0].vy);
    expect(storm.opacity).toBeGreaterThan(rain.opacity);
  });

  it('drifts the snow further sideways the harder the wind blows', () => {
    const [calm] = sheetsOf('snow');
    const [blizzard] = sheetsOf('blizzard');
    expect(blizzard.vx).toBeGreaterThan(calm.vx);
  });

  it('drifts the fog downwind, in banks that move at different paces, faster in more wind', () => {
    for (let dir = 0; dir < 8; dir++) {
      const { dx, dy } = windVector(dir);
      const fog = planWeather({ ...makeWeather('fog'), windDir: dir }, 1)[0].sheets;
      for (const s of fog) {
        expect(Math.sign(Math.round(s.vx * 1000))).toBe(Math.sign(dx));
        expect(Math.sign(Math.round(s.vy * 1000))).toBe(Math.sign(dy));
      }
      expect(new Set(fog.map((s) => Math.round(Math.hypot(s.vx, s.vy)))).size).toBe(fog.length);
    }
    const still = planWeather({ ...makeWeather('fog'), wind: 0 }, 1)[0].sheets[0];
    const breezy = planWeather({ ...makeWeather('fog'), wind: 0.5 }, 1)[0].sheets[0];
    expect(Math.hypot(breezy.vx, breezy.vy)).toBeGreaterThan(Math.hypot(still.vx, still.vy) * 2);
  });

  it('moves the fog on screen as time passes, at rest', () => {
    const [s] = sheetsOf('fog');
    const d = { x: 0, y: 0 };
    const view = { x: 1000, y: 700 };
    const before = placeSheet(s, d, view, 2, centre);
    for (let i = 0; i < 60; i++) advance(s, d, 1 / 6);
    const after = placeSheet(s, d, view, 2, centre);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(50);
  });

  it('keeps every sheet on the same world spot while the camera pans', () => {
    for (const type of ['rain', 'storm', 'fog', 'snow', 'blizzard'])
      for (const s of sheetsOf(type))
        for (const z of [1, 1.375, 2]) {
          const d = { x: 123.4, y: 456.7 };
          const a = placeSheet(s, d, { x: 3000, y: 2000 }, z, centre);
          for (const [px, py] of [
            [37, -11],
            [-1200, 640],
            [333.5, 2048]
          ]) {
            const b = placeSheet(s, d, { x: 3000 + px, y: 2000 + py }, z, centre);
            const where = `${s.tile} z${z} pan ${px},${py}`;
            const ex = wrap(b.x - (a.x - px * z), a.w);
            const ey = wrap(b.y - (a.y - py * z), a.h);
            expect(Math.min(ex, a.w - ex), where).toBeLessThan(1);
            expect(Math.min(ey, a.h - ey), where).toBeLessThan(1);
          }
        }
  });

  it('scales the weather about the centre of the view while zooming, so nothing jumps', () => {
    const view = { x: 5123, y: 3311 };
    for (const type of ['fog', 'rain', 'snow'])
      for (const s of sheetsOf(type)) {
        const d = { x: 40, y: 90 };
        let z = 64 / 32;
        let prev = placeSheet(s, d, view, z, centre);
        for (let tile = 63; tile >= 2; tile -= 1) {
          z = weatherScale(tile);
          const now = placeSheet(s, d, view, z, centre);
          const p0 = phaseAtCentre(s, prev);
          const p1 = phaseAtCentre(s, now);
          const gap = Math.hypot(
            Math.min(wrap(p1.x - p0.x, s.w), s.w - wrap(p1.x - p0.x, s.w)),
            Math.min(wrap(p1.y - p0.y, s.h), s.h - wrap(p1.y - p0.y, s.h))
          );
          expect(gap, `${s.tile} at tile ${tile}`).toBeLessThan(2);
          prev = now;
        }
      }
  });

  it('shrinks the weather smoothly below one art pixel per screen pixel instead of to nothing', () => {
    let last = weatherScale(64);
    for (let tile = 63.5; tile >= 2; tile -= 0.5) {
      const z = weatherScale(tile);
      expect(z).toBeLessThan(last);
      expect(last - z).toBeLessThan(0.05);
      last = z;
    }
    expect(weatherScale(32)).toBe(1);
    expect(weatherScale(2.5)).toBeGreaterThan(0.3);
  });

  it('steps the rain in whole drops, along its slant', () => {
    for (const s of sheetsOf('rain')) {
      const d = { x: 0, y: 0 };
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        advance(s, d, 0.004);
        const at = placeSheet(s, d, { x: 0, y: 0 }, 1, { x: 0, y: 0 });
        seen.add(`${at.x},${at.y}`);
        expect(Number.isInteger(at.x) && Number.isInteger(at.y)).toBe(true);
      }
      expect(seen.size).toBeLessThan(40);
    }
  });

  it('thins the fog at night', () => {
    const [day] = planWeather(makeWeather('fog'), 1);
    const [night] = planWeather(makeWeather('fog'), 0);
    expect(night.opacity).toBeLessThan(day.opacity);
  });

  it('bakes the same bytes as every committed weather tile it points at', () => {
    const baked: Record<string, Buffer> = bakeWeather();
    const used = ['rain', 'storm', 'fog', 'foggy_rain', 'snow'].flatMap((t) =>
      sheetsOf(t).map((s) => s.tile)
    );
    for (const tile of new Set(used)) {
      const url = tileImage(tile).slice(4, -1);
      const committed = readFileSync(new URL(`../../../static${url}`, import.meta.url));
      expect(Buffer.compare(committed, baked[tile]), tile).toBe(0);
    }
  });
});
