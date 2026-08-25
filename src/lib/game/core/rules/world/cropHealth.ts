export interface CropWindow {
  minSoil: number;
  minTemp: number;
  maxTemp: number;
  minMoisture: number;
  maxMoisture: number;
}

export interface TileConditions {
  soilTier: number;
  temp: number;
  moisture: number;
  snow: number;
}

const SNOW_SEVERITY = 6;
const MOISTURE_SEVERITY = 4;
const LOSS_PER_SEVERITY_DAY = 12;
const MIN_LOSS_PER_DAY = 8;
const MAX_LOSS_PER_DAY = 100;

export interface CropHealth {
  soilDead: boolean;
  severity: number;
}

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

export function cropLossPerDay(severity: number): number {
  if (severity <= 0) return 0;
  return Math.min(MAX_LOSS_PER_DAY, Math.max(MIN_LOSS_PER_DAY, severity * LOSS_PER_SEVERITY_DAY));
}

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
