import { describe, it, expect } from 'vitest';
import {
  cropHealth,
  cropLossPerDay,
  cropGrowthDirection,
  type CropWindow
} from '$lib/game/core/rules/world/cropHealth';

const win: CropWindow = { minSoil: 1, minTemp: -8, maxTemp: 30, minMoisture: 25, maxMoisture: 70 };
const healthy = { soilTier: 2, temp: 5, moisture: 40, snow: 0 };

describe('cropHealth', () => {
  it('is unstressed within every condition', () => {
    const h = cropHealth(win, healthy);
    expect(h.soilDead).toBe(false);
    expect(h.severity).toBe(0);
    expect(cropLossPerDay(h.severity)).toBe(0);
  });

  it('reports soil failure as instant death, not a gradual stress', () => {
    const h = cropHealth(win, { ...healthy, soilTier: 0 });
    expect(h.soilDead).toBe(true);
  });

  it('scales cold severity by degrees below minTemp', () => {
    const mild = cropHealth(win, { ...healthy, temp: -10 }).severity;
    const hard = cropHealth(win, { ...healthy, temp: -18 }).severity;
    expect(mild).toBe(2);
    expect(hard).toBe(10);
    expect(cropLossPerDay(hard)).toBeGreaterThan(cropLossPerDay(mild));
  });

  it('snow stresses the crop even when the air temp is in-window', () => {
    expect(cropHealth(win, { ...healthy, snow: 30 }).severity).toBeGreaterThan(0);
  });

  it('scales heat severity by degrees above maxTemp', () => {
    const h = cropHealth(win, { ...healthy, temp: 40 }).severity;
    expect(h).toBe(10);
  });

  it('over-wet moisture (above maxMoisture) stresses the crop by the fixed moisture severity', () => {
    const h = cropHealth(win, { ...healthy, moisture: 90 }).severity;
    expect(h).toBe(4);
  });

  it('growth direction: rising when healthy, falling when stressed, mature at 100', () => {
    expect(cropGrowthDirection(40, win, healthy)).toBe('rising');
    expect(cropGrowthDirection(40, win, { ...healthy, temp: -12 })).toBe('falling');
    expect(cropGrowthDirection(100, win, healthy)).toBe('mature');
  });

  it('growth direction falls when the soil is dead even with otherwise healthy conditions', () => {
    expect(cropGrowthDirection(40, win, { ...healthy, soilTier: 0 })).toBe('falling');
  });
});

describe('cropLossPerDay', () => {
  it('floors a small positive severity at MIN_LOSS_PER_DAY', () => {
    expect(cropLossPerDay(0.1)).toBe(8);
  });

  it('caps a very high severity at MAX_LOSS_PER_DAY', () => {
    expect(cropLossPerDay(50)).toBe(100);
  });
});
