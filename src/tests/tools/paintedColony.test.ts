import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  COLONY_H,
  COLONY_W,
  DRIFT_SPEED,
  colonyDrift,
  colonyImage,
  colonyLayers,
  driftOffset,
  snapToDevice
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

  it('drifts at one steady speed from mid-span and turns round at both ends', () => {
    const span = 256;
    const at = (frame: number) => driftOffset(span, frame / 120);
    expect(at(0)).toBeCloseTo(span / 2);
    expect(at(120) - at(0)).toBeCloseTo(DRIFT_SPEED);
    let lo = Infinity;
    let hi = -Infinity;
    for (let f = 1; f < 120 * 60; f++) {
      expect(Math.abs(at(f) - at(f - 1))).toBeLessThanOrEqual(DRIFT_SPEED / 120 + 1e-9);
      lo = Math.min(lo, at(f));
      hi = Math.max(hi, at(f));
    }
    expect(lo).toBeCloseTo(0, 2);
    expect(hi).toBeCloseTo(span, 2);
    expect(driftOffset(0, 5)).toBe(0);
  });

  it('places the colony on whole device pixels', () => {
    expect(snapToDevice(10.3, 1)).toBe(10);
    expect(snapToDevice(10.3, 2)).toBe(10.5);
    expect(snapToDevice(10.2, 1.5) * 1.5).toBe(15);
  });
});
