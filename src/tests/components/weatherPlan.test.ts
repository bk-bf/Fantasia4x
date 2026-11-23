import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeWeather } from '$lib/game/services/EnvironmentService';
import {
  anchorSheet,
  planWeather,
  sheetReach,
  tileImage
} from '$lib/components/UI/weather/weatherPlan';
import { bakeWeather } from '../../../tools/tileset/weather.mjs';

const kinds = (type: string, light = 1) =>
  planWeather(makeWeather(type), light, 1).map((g) => g.kind);

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
    const [rain] = planWeather(makeWeather('rain'), 1, 1);
    const [storm] = planWeather(makeWeather('storm'), 1, 1);
    expect(rain.sheets[0].tile).toBe('rain0');
    expect(storm.sheets[0].tile).toBe('storm0');
    expect(storm.sheets[0].secs).toBeLessThan(rain.sheets[0].secs);
    expect(storm.opacity).toBeGreaterThan(rain.opacity);
  });

  it('loops the snow by whole tiles in any wind, so it never jumps', () => {
    for (const type of ['snow', 'blizzard', 'winter_windy'])
      for (const k of [1, 2]) {
        const [{ sheets }] = planWeather(makeWeather(type), 1, k);
        const s = sheets[0];
        expect([s.tx % s.w, s.ty % s.h, (s.drift?.tx ?? 0) % s.w]).toEqual([0, 0, 0]);
      }
  });

  it('drifts the snow further sideways the harder the wind blows', () => {
    const calm = planWeather(makeWeather('snow'), 1, 1)[0].sheets[0];
    const blizzard = planWeather(makeWeather('blizzard'), 1, 1)[0].sheets[0];
    expect(blizzard.drift!.secs).toBeLessThan(calm.drift!.secs);
  });

  it('pins every sheet to the world, so panning moves the view over it', () => {
    const origins = [
      [0, 0],
      [-37, -11],
      [-1200, -640],
      [-3333, -2048],
      [512, 96]
    ];
    for (const moving of [true, false])
      for (const type of ['rain', 'storm', 'fog', 'snow', 'blizzard'])
        for (const k of [1, 2])
          for (const g of planWeather(makeWeather(type), 1, k))
            for (const s of g.sheets) {
              const reach = sheetReach(s, moving);
              const shear = s.ty ? s.tx : 0;
              const at = ([ox, oy]: number[]) => {
                const a = anchorSheet(s, ox, oy, moving);
                const x = a.x + a.phase * s.tx + a.drift * (s.drift?.tx ?? 0);
                const y = a.y + a.phase * s.ty;
                expect(x - reach.left).toBeLessThanOrEqual(0);
                expect(y - reach.top).toBeLessThanOrEqual(0);
                return [x - ox, y - oy];
              };
              const [bx, by] = at(origins[0]);
              for (const o of origins) {
                const [x, y] = at(o);
                const rows = Math.round((y - by) / s.h);
                const cols = (x - bx - rows * shear) / s.w;
                const where = `${s.tile} k${k} moving=${moving} ${o}`;
                expect(Math.abs(y - by - rows * s.h), where).toBeLessThan(1);
                expect(Math.abs(cols - Math.round(cols)) * s.w, where).toBeLessThan(1);
              }
            }
  });

  it('thins the fog at night', () => {
    const [day] = planWeather(makeWeather('fog'), 1, 1);
    const [night] = planWeather(makeWeather('fog'), 0, 1);
    expect(night.opacity).toBeLessThan(day.opacity);
  });

  it('bakes the same bytes as every committed weather tile it points at', () => {
    const baked: Record<string, Buffer> = bakeWeather();
    const used = ['rain', 'storm', 'fog', 'foggy_rain', 'snow'].flatMap((t) =>
      planWeather(makeWeather(t), 1, 2).flatMap((g) => g.sheets.map((s) => s.tile))
    );
    for (const tile of new Set(used)) {
      const url = tileImage(tile).slice(4, -1);
      const committed = readFileSync(new URL(`../../../static${url}`, import.meta.url));
      expect(Buffer.compare(committed, baked[tile]), tile).toBe(0);
    }
  });
});
