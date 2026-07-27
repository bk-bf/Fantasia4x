/**
 * Pawn DISPLAY stats — the `{ value, sources[] }` ability map the UI renders.
 * Pure presentation support: the sim never reads these values.
 */
import type { GameState, Pawn } from '../core/types';
import { modifierSystem } from './ModifierSystem';

export function calculatePawnStats(
  pawn: Pawn,
  gameState?: GameState
): Record<string, { value: number; sources: string[] }> {
  const stats: Record<string, { value: number; sources: string[] }> = {};

  // Work speed/yield/quality is NOT here — it lives solely in stats.jsonc via
  // pawnStatService.getWorkModifiers.
  if (gameState) {
    const equipmentResults = modifierSystem.calculateEquipmentBonuses(pawn);
    Object.entries(equipmentResults).forEach(([effectName, result]) => {
      stats[effectName] = {
        value: result.totalValue,
        sources: result.sources.map((s) => s.description)
      };
    });

    const traitResults = modifierSystem.calculateAllTraitEffects(pawn);
    Object.entries(traitResults).forEach(([effectName, result]) => {
      stats[effectName] = {
        value: result.totalValue,
        sources: result.sources.map((s) => s.description)
      };
    });
  }

  const baseStats = getBaseStats(pawn);
  const totalStats = getTotalStats(baseStats, {}, {}); // ModifierSystem handles bonuses above

  addSkillAbilities(stats, pawn);

  // Only basic derived abilities that don't conflict with ModifierSystem
  addBasicPhysicalAbilities(stats, totalStats);
  addBasicMentalAbilities(stats, totalStats);
  addBasicSurvivalAbilities(stats, totalStats);

  return stats;
}

function getBaseStats(pawn: Pawn) {
  return {
    brawn: pawn.stats.brawn || 0,
    agility: pawn.stats.agility || 0,
    intellect: pawn.stats.intellect || 0,
    awareness: pawn.stats.awareness || 0,
    charisma: pawn.stats.charisma || 0,
    vigour: pawn.stats.vigour || 0
  };
}

function addSkillAbilities(
  abilities: Record<string, { value: number; sources: string[] }>,
  pawn: Pawn
) {
  Object.entries(pawn.skills || {}).forEach(([skillName, skillLevel]) => {
    addAbility(abilities, `skill_${skillName}`, skillLevel, 'Experience');
  });
}

function getTotalStats(
  base: { [k: string]: number },
  trait: { [k: string]: number },
  equip: { [k: string]: number }
) {
  return {
    brawn: base.brawn + (trait.brawn || 0) + (equip.brawn || 0),
    agility: base.agility + (trait.agility || 0) + (equip.agility || 0),
    intellect: base.intellect + (trait.intellect || 0),
    awareness: base.awareness + (trait.awareness || 0),
    charisma: base.charisma + (trait.charisma || 0),
    vigour: base.vigour + (trait.vigour || 0)
  };
}

function addBasicPhysicalAbilities(
  abilities: Record<string, { value: number; sources: string[] }>,
  totalStats: { [k: string]: number }
) {
  const carryCapacity = 50 + totalStats.brawn * 2;
  addAbility(
    abilities,
    'carryCapacity',
    carryCapacity,
    `Base (50) + Brawn (${totalStats.brawn} × 2)`
  );

  const movementSpeed = 1.0 + (totalStats.agility - 10) * 0.02;
  addAbility(
    abilities,
    'movementSpeed',
    movementSpeed,
    `Base (1.0) + Agility modifier (${totalStats.agility - 10} × 0.02)`
  );

  const baseSwimmingSpeed = movementSpeed * 0.5;
  addAbility(
    abilities,
    'swimmingSpeed',
    baseSwimmingSpeed,
    `50% of movement speed (${movementSpeed.toFixed(2)} × 0.5)`
  );
}

function addBasicMentalAbilities(
  abilities: Record<string, { value: number; sources: string[] }>,
  totalStats: { [k: string]: number }
) {
  const learningSpeed = 1.0 + (totalStats.intellect - 10) * 0.05;
  addAbility(
    abilities,
    'learningSpeed',
    learningSpeed,
    `Base (1.0) + Intellect modifier (${totalStats.intellect - 10} × 0.05)`
  );

  const socialInfluence = 1.0 + (totalStats.charisma - 10) * 0.05;
  addAbility(
    abilities,
    'socialInfluence',
    socialInfluence,
    `Base (1.0) + Charisma modifier (${totalStats.charisma - 10} × 0.05)`
  );

  const intuition = 1.0 + (totalStats.awareness - 10) * 0.05;
  addAbility(
    abilities,
    'intuition',
    intuition,
    `Base (1.0) + Awareness modifier (${totalStats.awareness - 10} × 0.05)`
  );

  const knowledgeStorage = totalStats.intellect * 10;
  addAbility(
    abilities,
    'knowledgeStorage',
    knowledgeStorage,
    `Intellect × 10 (${totalStats.intellect} × 10)`
  );

  const experienceGain = 1.0 + (totalStats.intellect - 10) * 0.02;
  addAbility(
    abilities,
    'experienceGain',
    experienceGain,
    `Base (1.0) + Intellect modifier (${totalStats.intellect - 10} × 0.02)`
  );

  const visionRange = 10 + (totalStats.awareness - 10) * 0.5;
  addAbility(
    abilities,
    'visionRange',
    visionRange,
    `Base (10) + Awareness modifier (${totalStats.awareness - 10} × 0.5)`
  );
}

function addBasicSurvivalAbilities(
  abilities: Record<string, { value: number; sources: string[] }>,
  totalStats: { [k: string]: number }
) {
  const healthRegenRate = 0.5 + (totalStats.vigour - 10) * 0.1;
  addAbility(
    abilities,
    'healthRegenRate',
    healthRegenRate,
    `Base (0.5) + Vigour modifier (${totalStats.vigour - 10} × 0.1)`
  );

  const diseaseResistance = Math.max(0, (totalStats.vigour - 10) * 0.05);
  addAbility(
    abilities,
    'diseaseResistance',
    diseaseResistance,
    `Vigour modifier (${totalStats.vigour - 10} × 0.05, min 0)`
  );

  const vitality = totalStats.vigour;
  addAbility(abilities, 'vitality', vitality, `Vigour score (${totalStats.vigour})`);
}

function addAbility(
  abilities: Record<string, { value: number; sources: string[] }>,
  abilityName: string,
  value: number,
  source: string
) {
  if (!abilities[abilityName]) {
    abilities[abilityName] = { value: 0, sources: [] };
  }
  abilities[abilityName].value += value;
  abilities[abilityName].sources.push(source);
}
