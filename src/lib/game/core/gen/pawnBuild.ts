import type { Pawn, Culture } from '../types';
import { createPawnInventory, createPawnEquipment } from '../rules/gear/equipment';
import { drawPawnTraits } from './pawnTraits';
import {
  type Background,
  backgroundTraitAffinity,
  applyBackgroundExperience,
  backgroundPrestige
} from '../defs/backgrounds';
import { createBodyPlanLimbs } from '../../systems/Combat';
import { DEFAULT_PLAN } from '../defs/bodyParts';
import { seedAwakeningPaths } from '../defs/lineages';
import { seedWorkLevels, rollWorkStyle } from '../rules/body/workExperience';
import { rng } from '../util/rng';
import { rollAptitudes } from '../rules/body/aptitudes';
import { rollColouring, rollPawnLook } from '../rules/body/looks';
import { calcMaxBloodVolume, calcMaxStamina } from '../rules/body/vitals';
import {
  applyTraitBodyMods,
  applyTraitGrafts,
  applyTraitWounds,
  traitBodyWeightDelta
} from '../rules/body/traitBody';
import { generatePawnName } from './pawnNames';
import {
  applyCulturalTraitBonuses,
  clampSpawnStats,
  rollGrowthProfile,
  rollPhysicalTraits,
  rollStatsFromRanges
} from './pawnStats';

let _pawnDebugIdCounter = 1;

export function resetPawnDebugIds(): void {
  _pawnDebugIdCounter = 1;
}

export interface PawnOrigin {
  homeKingdomId?: string;
  age?: number;
  childhood?: Background;
  adulthood?: Background;
}

export function buildPawnFromCulture(culture: Culture, index: number, origin?: PawnOrigin): Pawn {
  const baseStats = rollStatsFromRanges(culture.statRanges);
  const physicalTraits = rollPhysicalTraits(culture.physicalTraits);
  const affinity = origin ? backgroundTraitAffinity(origin.childhood, origin.adulthood) : undefined;
  const traits = drawPawnTraits(culture, physicalTraits, affinity);
  const finalStats = clampSpawnStats(applyCulturalTraitBonuses(baseStats, traits));
  physicalTraits.weight += traitBodyWeightDelta(traits);
  const maxBloodVolume = calcMaxBloodVolume(physicalTraits, finalStats);
  const maxStamina = calcMaxStamina(finalStats);
  const { maxStats, favStats } = rollGrowthProfile(finalStats, culture.statRanges);
  const age = origin?.age ?? rng.int(16, 45);
  const skills = origin
    ? applyBackgroundExperience(seedWorkLevels(), origin.childhood, origin.adulthood)
    : seedWorkLevels();
  const basePrestige = origin ? backgroundPrestige(origin.childhood, origin.adulthood) : 0;
  const sex: 'male' | 'female' = rng.chance(0.5) ? 'male' : 'female';

  const pawn: Pawn = {
    id: `pawn-${index}`,
    debugId: _pawnDebugIdCounter++,
    name: generatePawnName(sex),
    sex,
    stats: finalStats,
    aptitudes: rollAptitudes(physicalTraits.weight),
    maxStats,
    favStats,
    age,
    birthDayOfYear: rng.int(0, 359),
    physicalTraits,
    cultureId: culture.id,
    cultureName: culture.name,
    ...(origin?.homeKingdomId ? { homeKingdomId: origin.homeKingdomId } : {}),
    ...(origin?.childhood ? { childhoodId: origin.childhood.id } : {}),
    ...(origin?.adulthood ? { adulthoodId: origin.adulthood.id } : {}),
    ...(basePrestige > 0 ? { basePrestige } : {}),
    traits,
    inventory: createPawnInventory(),
    equipment: createPawnEquipment(),
    needs: {
      hunger: 0,
      fatigue: 0,
      sleep: 0,
      lastSleep: 0,
      lastMeal: 0
    },
    state: {
      mood: 50,
      isWorking: false,
      isSleeping: false,
      isEating: false
    },
    currentState: 'Idle',
    skills,
    workStyle: rollWorkStyle(),
    isAlive: true,
    maxBloodVolume,
    bloodVolume: maxBloodVolume,
    conditions: [],
    stamina: maxStamina,
    maxStamina,
    limbs: createBodyPlanLimbs(DEFAULT_PLAN, 1)
  };

  pawn.look = rollPawnLook(pawn, culture.colouring ?? rollColouring(culture.id));
  applyTraitGrafts(pawn);
  applyTraitBodyMods(pawn);
  applyTraitWounds(pawn);
  seedAwakeningPaths(pawn);
  const bloodNeed = (pawn.traits ?? []).find((t) => t.bloodNeed)?.bloodNeed;
  if (bloodNeed) {
    pawn.bloodNeedKind = bloodNeed;
    if (pawn.needs) pawn.needs.bloodHunger = 0;
  }
  if ((pawn.traits ?? []).some((t) => t.grafts?.some((g) => g.parts.includes('spinneret'))))
    pawn.silkSpinner = true;

  return pawn;
}

export function generatePawns(culture: Culture, count = 3): Pawn[] {
  return Array.from({ length: count }, (_, i) => buildPawnFromCulture(culture, i));
}
