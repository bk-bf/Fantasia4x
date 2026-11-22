import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeWeather } from '$lib/game/services/EnvironmentService';
import { planWeather, tileImage } from '$lib/components/UI/weather/weatherPlan';
import { bakeWeather } from '../../../tools/tileset/weather.mjs';

const kinds = (type: string, light = 1) => planWeather(makeWeather(type), light, 1).map((g) => g.kind);

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
