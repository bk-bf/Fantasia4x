import type { Pawn, Mob } from '../../types';
import { itemDefById } from '../../defs/items';
import { getCreatureById } from '../../defs/creatures';
import { PART_DEF_MAP } from '../../defs/bodyParts';
import { getTransientConditionDef } from './conditions';

function livingPartNightVision(entity: Pawn | Mob): number {
  let nv = 0;
  for (const limb of entity.limbs ?? [])
    for (const part of limb.parts ?? []) {
      if (part.isMissing || part.health <= 0) continue;
      nv += PART_DEF_MAP[part.id]?.grants?.nightVision ?? 0;
    }
  return nv;
}

const _creatureHasNvPart = new Map<string, boolean>();
function creatureHasNvPart(mob: Mob): boolean {
  let has = _creatureHasNvPart.get(mob.creatureId);
  if (has === undefined) {
    has = false;
    outer: for (const limb of mob.limbs ?? [])
      for (const part of limb.parts ?? [])
        if ((PART_DEF_MAP[part.id]?.grants?.nightVision ?? 0) > 0) {
          has = true;
          break outer;
        }
    _creatureHasNvPart.set(mob.creatureId, has);
  }
  return has;
}

const VISION_LIGHT_FLOOR = 0.35;

export function baseVisionRange(perception: number): number {
  return Math.round(4 + perception * 1.3);
}

export function getNightVision(entity: Pawn | Mob): number {
  if ('creatureId' in entity) {
    const base = getCreatureById(entity.creatureId)?.nightVision ?? 0;
    const parts = creatureHasNvPart(entity) ? livingPartNightVision(entity) : 0;
    return Math.min(1, Math.max(0, base + parts));
  }
  let nv = 0;
  for (const trait of entity.traits ?? []) nv += trait.effects?.nightVision ?? 0;
  nv += livingPartNightVision(entity);
  if (entity.transientConditions?.length)
    for (const id of entity.transientConditions) {
      const g = getTransientConditionDef(id)?.grants?.nightVision;
      if (g) nv += g;
    }
  if (nv > 0 && entity.limbs?.length) {
    let hasEye = false;
    let hasLivingEye = false;
    for (const limb of entity.limbs)
      for (const part of limb.parts ?? []) {
        if (!part.id.toLowerCase().includes('eye')) continue;
        hasEye = true;
        if (!part.isMissing && part.health > 0) hasLivingEye = true;
      }
    if (hasEye && !hasLivingEye) nv = 0;
  }
  return Math.min(1, Math.max(0, nv));
}

export function dampenLightByNightVision(lightLevel: number, nightVision: number): number {
  return lightLevel + nightVision * (1 - lightLevel);
}

export function lightVisionMultiplier(lightLevel: number, nightVision: number): number {
  return Math.min(
    1,
    Math.max(VISION_LIGHT_FLOOR, dampenLightByNightVision(lightLevel, nightVision))
  );
}

function wornSightFactor(entity: Pawn | Mob): number {
  const eq = (entity as Pawn).equipment;
  if (!eq) return 1;
  let lost = 0;
  for (const inst of Object.values(eq)) {
    if (!inst) continue;
    lost += itemDefById(inst.itemId)?.armorProperties?.sightPenalty ?? 0;
  }
  return Math.max(0.35, 1 - lost);
}

export function effectiveVisionRange(
  entity: Pawn | Mob,
  lightLevel: number,
  weatherSightMul = 1,
  nightVision?: number
): number {
  const base = baseVisionRange(entity.stats?.perception ?? 10);
  const nv = nightVision ?? getNightVision(entity);
  const lit = base * lightVisionMultiplier(lightLevel, nv);
  return Math.max(1, Math.round(lit * weatherSightMul * wornSightFactor(entity)));
}

function cheb(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function isWitnessedByColony(
  pawns: Pawn[] | undefined,
  x: number,
  y: number,
  ambientLight: number,
  weatherSightMul = 1
): boolean {
  if (!pawns) return false;
  for (const p of pawns) {
    if (p.isAlive === false || !p.position) continue;
    if (
      cheb(p.position.x, p.position.y, x, y) <=
      effectiveVisionRange(p, ambientLight, weatherSightMul)
    )
      return true;
  }
  return false;
}
