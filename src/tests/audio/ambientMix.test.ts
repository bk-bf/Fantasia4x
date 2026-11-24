import { describe, it, expect } from 'vitest';
import {
  AMBIENT_FILES,
  ambientMix,
  bedTrim,
  resolveAmbient,
  type AmbientBed,
  type AmbientLayers
} from '$lib/audio/manifest';
import bedLoudness from '$lib/audio/bedLoudness.json';

const storm = resolveAmbient({ weatherType: 'storm', isNight: false, intensity: 1 });
const gale = resolveAmbient({ weatherType: 'gale', isNight: false, intensity: 0 });

describe('weather beds hold their level at every zoom', () => {
  it('plays wind and heavy rain no louder zoomed out than zoomed in', () => {
    for (const base of [storm, gale]) {
      const zoomedIn = ambientMix(base, 1);
      const zoomedOut = ambientMix(base, 0);
      for (const bed of ['wind', 'rain', 'rain-heavy'] as const) {
        expect(zoomedOut[bed]).toBe(zoomedIn[bed]);
      }
    }
  });

  it('still fades the near beds out as the camera pulls back', () => {
    const base: AmbientLayers = { 'birds-day': 0.4, forest: 0.2, wind: 0.35 };
    const half = ambientMix(base, 0.5);
    const full = ambientMix(base, 1);
    expect(half['birds-day']).toBeCloseTo((full['birds-day'] ?? 0) / 2, 10);
    expect(half.forest).toBeCloseTo((full.forest ?? 0) / 2, 10);
    expect(ambientMix(base, 0)['birds-day']).toBeUndefined();
  });
});

describe('ambient beds play at one loudness', () => {
  const beds = Object.keys(AMBIENT_FILES) as AmbientBed[];

  it('has a measured loudness for every bed file the loudness tool reads', () => {
    expect(Object.keys(bedLoudness).sort()).toEqual([...beds].sort());
    for (const bed of beds) expect(AMBIENT_FILES[bed]).toBe(`/audio/ambient/${bed}.ogg`);
  });

  it('trims every bed down to the quietest one and never boosts', () => {
    const table = bedLoudness as Record<AmbientBed, number>;
    const level = Math.min(...Object.values(table));
    for (const bed of beds) {
      expect(bedTrim(bed)).toBeLessThanOrEqual(1);
      expect(table[bed] + 20 * Math.log10(bedTrim(bed))).toBeCloseTo(level, 9);
    }
  });

  it('applies the trim to each bed it mixes', () => {
    const mix = ambientMix({ forest: 0.2, wind: 0.35 }, 1);
    expect(mix.forest).toBeCloseTo(0.2 * bedTrim('forest'), 12);
    expect(mix.wind).toBeCloseTo(0.35 * bedTrim('wind'), 12);
  });
});
