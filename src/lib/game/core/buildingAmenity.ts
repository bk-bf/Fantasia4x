import buildingsData from '../database/world/buildings.jsonc';
import type { Building, PlacedBuilding } from './types';
import { aggregateMaterialMods } from './materialProperties';

const BUILDING_DEFS = buildingsData as unknown as Building[];

/** §M room amenity radius (Chebyshev) — furniture within this of a tile contributes its comfort/beauty
 *  to a pawn occupying that tile (a "room" of nearby furnishings). */
export const AMENITY_RADIUS = 2;

/** SOCIAL: how close a pawn must be to a gathering-place building (campfire/hearth) to count as "at
 *  the fire" — a touch wider than a furniture room; you cluster loosely around a fire. */
export const GATHERING_RADIUS = 3;

/** SOCIAL: is (x,y) within GATHERING_RADIUS of a COMPLETE gathering-place building (buildingProperties
 *  `gathering`)? Drives the sociable-context gate + fireside warmth in SocialService.processDialogTick. */
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

/**
 * §M Sum the MATERIAL-ADJUSTED `beauty` (+ `insulation`) of all complete buildings within
 * `AMENITY_RADIUS` of (x,y) — a soft "how handsome is this spot" score. Drives rest (handleSleeping),
 * wound healing (healWounds), and the pleasant-surroundings mood lift (PawnService).
 *
 * COMFORT IS DELIBERATELY NOT HERE. Comfort is not ambient — a pawn gets it by USING a piece of
 * furniture (sitting in the chair, sleeping in the bed), never by standing near one. Read a single
 * piece's comfort with {@link buildingComfortOf}. Beauty stays ambient: a handsome room genuinely is
 * pleasant to be in. Kept in `core` so services AND pawn systems can use it acyclically.
 */
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

/**
 * COMFORT: the MATERIAL-ADJUSTED `comfort` of ONE placed building — the piece a pawn is actually USING
 * (the seat it lounges on, the bed it sleeps in). This is the only way comfort enters the sim: a better
 * piece, or the same piece built from a finer material (mammoth wool over goat wool), is measurably
 * comfier to use. Returns 0 for a missing/incomplete building or one with no comfort.
 */
export function buildingComfortOf(b: PlacedBuilding | undefined | null): number {
  if (!b || b.status !== 'complete') return 0;
  const eff = BUILDING_DEFS.find((d) => d.id === b.type)?.effects;
  if (!eff) return 0;
  const mods = b.materials ? aggregateMaterialMods(Object.values(b.materials), 'building') : null;
  return (eff.comfort ?? 0) + (mods?.comfort ?? 0);
}

/** SOCIAL: a gathering place's LEVEL (buildingProperties `gatheringLevel`, default 1 when it merely
 *  carries `gathering`). Pawns prefer the HIGHEST-level place they can reach — a hall table out-draws a
 *  hearth, which out-draws a bare campfire. */
export function gatheringLevelOf(b: PlacedBuilding | undefined | null): number {
  if (!b || b.status !== 'complete') return 0;
  const p = BUILDING_DEFS.find((d) => d.id === b.type)?.buildingProperties;
  return p?.gathering ? (p.gatheringLevel ?? 1) : 0;
}
