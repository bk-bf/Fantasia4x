// Shared sight/vision model for BOTH pawns and mobs (§G light → sight).
//
// One perception-based vision range, scaled by the tile's light level and dampened by the entity's
// night_vision (0 = fully affected by darkness, 1 = sees in the dark as well as by day). The same
// light-dampening feeds the work-speed penalty (handleWorking) so a nocturnal entity neither sees
// worse nor works slower at night. Light comes from EnvironmentService.computeTileLightLevel
// (day/night ambient + nearby fire emitters); this module never recomputes it.

import type { Pawn, Mob } from './types';
import { getCreatureById } from './Creatures';

/** Vision can't drop below this fraction of its base, even in pitch dark — you can always make out
 *  the next couple of tiles. (Work uses its own 0.4 floor in lightWorkMultiplier.) */
const VISION_LIGHT_FLOOR = 0.35;

/** Base sight range in tiles from perception — the SAME formula for pawns and mobs (unifies the old
 *  pawn `vision_range` path and the per-creature `def.stats.visionRange`; matches the latter exactly,
 *  so entity daytime vision is unchanged). */
export function baseVisionRange(perception: number): number {
  // ×2 the original (2 + per×0.65): doubled sight range so the LOS vision bubble shows meaningfully more.
  // Shared by pawns AND mobs (perception is set from a creature's `per` at spawn), so predator/prey
  // detection scales together and the balance is preserved. KEEP IN SYNC with Creatures.toDefinition's
  // `visionRange` (it mirrors this for the precomputed def.stats.visionRange + fleeRange).
  return Math.round(4 + perception * 1.3);
}

/** This entity's 0–1 night-vision (darkness immunity). Mobs read it from their creature def; pawns
 *  sum it across their racial traits. Default 0 (normal — full darkness penalty). */
export function getNightVision(entity: Pawn | Mob): number {
  if ('creatureId' in entity) {
    return getCreatureById(entity.creatureId)?.nightVision ?? 0;
  }
  let nv = 0;
  for (const trait of entity.racialTraits ?? []) nv += trait.effects?.nightVision ?? 0;
  return Math.min(1, Math.max(0, nv));
}

/** Light dampened by night-vision: 1 = unaffected, 0 = full effect. Shared by vision AND work so the
 *  two stay consistent. Returns a raw factor (caller clamps to its own floor). */
export function dampenLightByNightVision(lightLevel: number, nightVision: number): number {
  return lightLevel + nightVision * (1 - lightLevel);
}

/** Light → vision multiplier in [VISION_LIGHT_FLOOR, 1]. Bright light/fire only RESTORES range up to
 *  the base (capped at 1); it never extends sight beyond daytime. */
export function lightVisionMultiplier(lightLevel: number, nightVision: number): number {
  return Math.min(
    1,
    Math.max(VISION_LIGHT_FLOOR, dampenLightByNightVision(lightLevel, nightVision))
  );
}

/** Effective sight range (tiles) for a pawn or mob at the given tile light level. `weatherSightMul`
 *  (1 = clear; <1 for fog/rain/storm — SEASONS_WEATHER) shortens detection on top of the light
 *  dampening, for BOTH pawns and mobs. Floors at 1. */
export function effectiveVisionRange(
  entity: Pawn | Mob,
  lightLevel: number,
  weatherSightMul = 1
): number {
  const base = baseVisionRange(entity.stats?.perception ?? 10);
  const lit = base * lightVisionMultiplier(lightLevel, getNightVision(entity));
  return Math.max(1, Math.round(lit * weatherSightMul));
}
