import buildingsData from '../database/buildings.jsonc';
import type { Building, PlacedBuilding } from './types';
import { aggregateMaterialMods } from './materialProperties';

const BUILDING_DEFS = buildingsData as unknown as Building[];

/** §M room amenity radius (Chebyshev) — furniture within this of a tile contributes its comfort/beauty
 *  to a pawn occupying that tile (a "room" of nearby furnishings). */
export const AMENITY_RADIUS = 2;

/**
 * §M Sum the MATERIAL-ADJUSTED `comfort` + `beauty` (+ `insulation`) of all complete buildings within
 * `AMENITY_RADIUS` of (x,y) — a soft "how nice is this spot" score. Drives rest (handleSleeping), wound
 * healing (healWounds), and the pleasant-surroundings mood lift (PawnService). The chosen build material
 * feeds in via each building's `materials` (silk → +beauty, wool/cotton → +comfort), so a finely-built,
 * well-furnished room measurably out-rests/out-heals/out-cheers a bare one. No mood-system or AI: it
 * reads only the pawn's surroundings. Kept in `core` so services AND pawn systems can use it acyclically.
 */
export function amenityAt(
  buildings: PlacedBuilding[] | undefined,
  x: number,
  y: number
): { comfort: number; beauty: number; insulation: number } {
  let comfort = 0;
  let beauty = 0;
  let insulation = 0;
  for (const b of buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (Math.abs(b.x - x) > AMENITY_RADIUS || Math.abs(b.y - y) > AMENITY_RADIUS) continue;
    const eff = BUILDING_DEFS.find((d) => d.id === b.type)?.effects;
    if (!eff) continue;
    const mods = b.materials ? aggregateMaterialMods(Object.values(b.materials), 'building') : null;
    comfort += (eff.comfort ?? 0) + (mods?.comfort ?? 0);
    beauty += (eff.beauty ?? 0) + (mods?.beauty ?? 0);
    insulation += (eff.thermalInsulation ?? 0) + (mods?.insulation ?? 0);
  }
  return { comfort, beauty, insulation };
}
