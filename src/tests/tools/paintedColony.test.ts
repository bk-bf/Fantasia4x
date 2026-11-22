import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  COLONY_H,
  COLONY_W,
  colonyDrift,
  colonyImage,
  colonyLayers
} from '$lib/components/UI/menu/menuColony';
import type { ColonyAmbient } from '$lib/components/UI/menu/mainMenuAmbient';

const file = (url: string) => readFileSync(new URL(`../../../static${url}`, import.meta.url));
const ambient = (dusk: number, night: number): ColonyAmbient => ({
  season: 'autumn',
  dusk,
  night,
  filter: ''
});

describe('painted colony backdrop', () => {
  for (const season of ['autumn', 'winter'] as const)
    for (const time of ['day', 'dusk', 'night'] as const)
      it(`bakes ${season} ${time} at the colony size, still and animated`, () => {
        for (const live of [false, true]) {
          const png = file(colonyImage(season, time, live));
          expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([COLONY_W, COLONY_H]);
          expect(png.includes(Buffer.from('acTL'))).toBe(live);
        }
      });

  it('stacks dusk and night over day, and drops layers they cover', () => {
    expect(colonyLayers(ambient(0, 0))).toEqual([{ time: 'day', opacity: 1 }]);
    expect(colonyLayers(ambient(0.5, 0.25)).map((l) => l.time)).toEqual(['day', 'dusk', 'night']);
    expect(colonyLayers(ambient(0, 1))).toEqual([{ time: 'night', opacity: 1 }]);
  });

  it('keeps the camera inside the colony at both ends of the drift', () => {
    const { rest, from, to } = colonyDrift(1920, 1080, 2);
    for (const { left, top } of [rest, from, to]) {
      expect(left).toBeLessThanOrEqual(0);
      expect(left).toBeGreaterThanOrEqual(1920 - COLONY_W * 2);
      expect(top).toBeGreaterThanOrEqual(1080 - COLONY_H * 2);
    }
    expect(from.left - to.left).toBe(256);
  });
});
