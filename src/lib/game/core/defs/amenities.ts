import buildingsData from '../../database/world/buildings.json';
import type { Building, PlacedBuilding } from '../types';
import { aggregateMaterialMods } from './materials';

const BUILDING_DEFS = buildingsData as unknown as Building[];

export const AMENITY_RADIUS = 2;

export const GATHERING_RADIUS = 3;

export function nearGatheringPlace(
  buildings: PlacedBuilding[] | undefined,
  x: number,
  y: number
): boolean {
  for (const b of buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (Math.abs(b.x - x) > GATHERING_RADIUS || Math.abs(b.y - y) > GATHERING_RADIUS) continue;
    if (BUILDING_DEFS.find((d) => d.id === b.type)?.buildingProperties?.gathering) return true;
  }
  return false;
}

export function amenityAt(
  buildings: PlacedBuilding[] | undefined,
  x: number,
  y: number
): { beauty: number; insulation: number } {
  let beauty = 0;
  let insulation = 0;
  for (const b of buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (Math.abs(b.x - x) > AMENITY_RADIUS || Math.abs(b.y - y) > AMENITY_RADIUS) continue;
    const eff = BUILDING_DEFS.find((d) => d.id === b.type)?.effects;
    if (!eff) continue;
    const mods = b.materials ? aggregateMaterialMods(Object.values(b.materials), 'building') : null;
    beauty += (eff.beauty ?? 0) + (mods?.beauty ?? 0);
    insulation += (eff.thermalInsulation ?? 0) + (mods?.insulation ?? 0);
  }
  return { beauty, insulation };
}

export function buildingComfortOf(b: PlacedBuilding | undefined | null): number {
  if (!b || b.status !== 'complete') return 0;
  const eff = BUILDING_DEFS.find((d) => d.id === b.type)?.effects;
  if (!eff) return 0;
  const mods = b.materials ? aggregateMaterialMods(Object.values(b.materials), 'building') : null;
  return (eff.comfort ?? 0) + (mods?.comfort ?? 0);
}

export function gatheringLevelOf(b: PlacedBuilding | undefined | null): number {
  if (!b || b.status !== 'complete') return 0;
  const p = BUILDING_DEFS.find((d) => d.id === b.type)?.buildingProperties;
  return p?.gathering ? (p.gatheringLevel ?? 1) : 0;
}
