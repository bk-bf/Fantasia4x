/* filepath: src/lib/game/core/cropHealth.ts */
/**
 * Crop health — the SINGLE shared model of "is this crop growing, declining, or doomed" used by BOTH
 * the sim (GameEngineImpl.processCropGrowth, which advances or withers the plant) and the HUD growth
 * pill (GameCanvas, which shows ▲ rising / ▼ falling / ✓ ready). Keeping the predicate here means the
 * readout can never drift from what the next tick actually does.
 *
 * Cold/heat/snow/drought are NON-lethal stresses now: they bleed growth GRADUALLY (a frost-touched bed
 * dies over a few days, recovering on a warm afternoon), scaled by how far past the crop's window the
 * tile is. Only soil falling below the crop's `minSoil` is instant death — the ground can no longer
 * carry it at all.
 */

/** The crop's growth window (the relevant subset of `ResourceObjectDef.crop`). */
export interface CropWindow {
  minSoil: number;
  minTemp: number;
  maxTemp: number;
  minMoisture: number;
  maxMoisture: number;
}

/** Live conditions at the crop's tile. */
export interface TileConditions {
  soilTier: number;
  /** Effective °C (biome + season + weather + diurnal + thermal). */
  temp: number;
  /** Tile wetness 0–100. */
  moisture: number;
  /** Snow cover 0–100 (any cover stresses the crop). */
  snow: number;
}

/** Fixed stress (in "degrees past window" units) a snow-covered tile inflicts. */
const SNOW_SEVERITY = 6;
/** Fixed stress a drought/flooded tile (moisture out of band) inflicts. */
const MOISTURE_SEVERITY = 4;
/** Growth %/day lost per unit of stress severity. */
const LOSS_PER_SEVERITY_DAY = 12;
/** Floor/ceiling on the daily decline so a marginal frost still bites, and a hard freeze caps at ~1 day. */
const MIN_LOSS_PER_DAY = 8;
const MAX_LOSS_PER_DAY = 100;

export interface CropHealth {
  /** Soil below `minSoil` — the crop dies outright (reset to 1%), no gradual decline. */
  soilDead: boolean;
  /** 0 when every condition is met; >0 = degrees past the temp window (or the snow/moisture penalty). */
  severity: number;
}

/** Evaluate a crop's health from its window + the tile's live conditions. */
export function cropHealth(win: CropWindow, cond: TileConditions): CropHealth {
  const soilDead = cond.soilTier < win.minSoil;
  let severity = 0;
  if (cond.temp < win.minTemp) severity = Math.max(severity, win.minTemp - cond.temp);
  if (cond.temp > win.maxTemp) severity = Math.max(severity, cond.temp - win.maxTemp);
  if (cond.snow > 0) severity = Math.max(severity, SNOW_SEVERITY);
  if (cond.moisture < win.minMoisture || cond.moisture > win.maxMoisture)
    severity = Math.max(severity, MOISTURE_SEVERITY);
  return { soilDead, severity };
}

/** Growth %/day a stressed crop loses (0 when healthy), scaled by severity and clamped. */
export function cropLossPerDay(severity: number): number {
  if (severity <= 0) return 0;
  return Math.min(MAX_LOSS_PER_DAY, Math.max(MIN_LOSS_PER_DAY, severity * LOSS_PER_SEVERITY_DAY));
}

/** Direction of a crop's growth for the HUD pill. `mature` once ≥100; otherwise rising unless stressed. */
export type GrowthDirection = 'rising' | 'falling' | 'mature';
export function cropGrowthDirection(
  growth: number,
  win: CropWindow,
  cond: TileConditions
): GrowthDirection {
  if (growth >= 100) return 'mature';
  const h = cropHealth(win, cond);
  return h.soilDead || h.severity > 0 ? 'falling' : 'rising';
}
