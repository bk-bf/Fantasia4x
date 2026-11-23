import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gradeForHour } from '$lib/webgl/painted/lightGrade';
import {
  TICKS_PER_GAME_HOUR,
  getAmbientLight,
  getAmbientTint
} from '$lib/game/services/EnvironmentService';

type Rgb = [number, number, number];
const SAMPLES = ['grass', 'foliage', 'water', 'rock', 'shadow'] as const;
type Sample = (typeof SAMPLES)[number];
type Row = { hour: number } & Record<Sample, Rgb>;

const table: { albedo: Record<Sample, Rgb>; hours: Row[] } = JSON.parse(
  readFileSync(
    join(process.cwd(), 'src/tests/webgl/painted/fixture/mockup-light-table.json'),
    'utf8'
  )
);
const LEVELS = 2;

const gameColour = (albedo: Rgb, hour: number): Rgb => {
  const turn = Math.round(hour * TICKS_PER_GAME_HOUR);
  const { ambient } = gradeForHour(getAmbientLight(turn), getAmbientTint(turn));
  return [albedo[0] * ambient[0], albedo[1] * ambient[1], albedo[2] * ambient[2]];
};

describe('painted light against the mockup, every quarter hour', () => {
  it('covers a full day in quarter hours', () => {
    expect(table.hours.map((r) => r.hour)).toEqual(Array.from({ length: 96 }, (_, i) => i / 4));
  });

  it.each(SAMPLES)('keeps %s within two levels of the mockup', (sample) => {
    const drift = table.hours.map((row) => {
      const game = gameColour(table.albedo[sample], row.hour);
      return {
        hour: row.hour,
        worst: Math.max(...game.map((c, i) => Math.abs(c - row[sample][i])))
      };
    });
    expect(drift.filter((d) => d.worst > LEVELS)).toEqual([]);
  });
});
