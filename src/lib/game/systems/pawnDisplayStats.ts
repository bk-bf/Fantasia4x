/**
 * Pawn DISPLAY stats — the `{ value, sources[] }` ability map the UI renders (pawnStats store,
 * attribute panels). Moved out of entities/Pawns.ts: it enriches via ModifierSystem (systems), and
 * an entities-layer module must not reach up into systems. Pure presentation support — the sim
 * never reads these values.
 */
import type { GameState, Pawn } from '../core/types';
import { modifierSystem } from './ModifierSystem';

// UPDATED: Use ModifierSystem for complex calculations
export function calculatePawnStats(
  pawn: Pawn,
  gameState?: GameState
): Record<string, { value: number; sources: string[] }> {
  const stats: Record<string, { value: number; sources: string[] }> = {};

  // If we have gameState, use ModifierSystem for equipment + trait effect display stats.
  // (Work speed/yield/quality is NOT here — it lives solely in stats.jsonc via
  // pawnStatService.getWorkModifiers; see ADR in DECISIONS.md.)
  if (gameState) {
    // Use ModifierSystem for equipment bonuses
    const equipmentResults = modifierSystem.calculateEquipmentBonuses(pawn);
    Object.entries(equipmentResults).forEach(([effectName, result]) => {
      stats[effectName] = {
        value: result.totalValue,
        sources: result.sources.map((s) => s.description)
      };
    });

    // Use ModifierSystem for trait effects
    const traitResults = modifierSystem.calculateAllTraitEffects(pawn);
    Object.entries(traitResults).forEach(([effectName, result]) => {
      stats[effectName] = {
        value: result.totalValue,
        sources: result.sources.map((s) => s.description)
      };
    });
  }

  // Calculate base stats for simple derived abilities
  const baseStats = getBaseStats(pawn);
  const totalStats = getTotalStats(baseStats, {}, {}); // Simplified since ModifierSystem handles bonuses

  // Add skills (not handled by ModifierSystem)
  addSkillAbilities(stats, pawn);

  // Keep only basic derived abilities that don't conflict with ModifierSystem
  addBasicPhysicalAbilities(stats, totalStats);
  addBasicMentalAbilities(stats, totalStats);
  addBasicSurvivalAbilities(stats, totalStats);

  return stats;
}

// --- Helper functions ---

function getBaseStats(pawn: Pawn) {
  return {
    strength: pawn.stats.strength || 0,
    dexterity: pawn.stats.dexterity || 0,
    intelligence: pawn.stats.intelligence || 0,
    perception: pawn.stats.perception || 0,
    charisma: pawn.stats.charisma || 0,
    constitution: pawn.stats.constitution || 0
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
    strength: base.strength + (trait.strength || 0) + (equip.strength || 0),
    dexterity: base.dexterity + (trait.dexterity || 0) + (equip.dexterity || 0),
    intelligence: base.intelligence + (trait.intelligence || 0),
    perception: base.perception + (trait.perception || 0),
    charisma: base.charisma + (trait.charisma || 0),
    constitution: base.constitution + (trait.constitution || 0)
  };
}

// SIMPLIFIED: Only basic derived stats, not work efficiencies
function addBasicPhysicalAbilities(
  abilities: Record<string, { value: number; sources: string[] }>,
  totalStats: { [k: string]: number }
) {
  // Only basic derived stats that don't conflict with ModifierSystem
  const carryCapacity = 50 + totalStats.strength * 2;
  addAbility(
    abilities,
    'carryCapacity',
    carryCapacity,
    `Base (50) + Strength (${totalStats.strength} × 2)`
  );

  const movementSpeed = 1.0 + (totalStats.dexterity - 10) * 0.02;
  addAbility(
    abilities,
    'movementSpeed',
    movementSpeed,
    `Base (1.0) + Dexterity modifier (${totalStats.dexterity - 10} × 0.02)`
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
  // Only basic derived stats
  const learningSpeed = 1.0 + (totalStats.intelligence - 10) * 0.05;
  addAbility(
    abilities,
    'learningSpeed',
    learningSpeed,
    `Base (1.0) + Intelligence modifier (${totalStats.intelligence - 10} × 0.05)`
  );

  const socialInfluence = 1.0 + (totalStats.charisma - 10) * 0.05;
  addAbility(
    abilities,
    'socialInfluence',
    socialInfluence,
    `Base (1.0) + Charisma modifier (${totalStats.charisma - 10} × 0.05)`
  );

  const intuition = 1.0 + (totalStats.perception - 10) * 0.05;
  addAbility(
    abilities,
    'intuition',
    intuition,
    `Base (1.0) + Perception modifier (${totalStats.perception - 10} × 0.05)`
  );

  const knowledgeStorage = totalStats.intelligence * 10;
  addAbility(
    abilities,
    'knowledgeStorage',
    knowledgeStorage,
    `Intelligence × 10 (${totalStats.intelligence} × 10)`
  );

  const experienceGain = 1.0 + (totalStats.intelligence - 10) * 0.02;
  addAbility(
    abilities,
    'experienceGain',
    experienceGain,
    `Base (1.0) + Intelligence modifier (${totalStats.intelligence - 10} × 0.02)`
  );

  const visionRange = 10 + (totalStats.perception - 10) * 0.5;
  addAbility(
    abilities,
    'visionRange',
    visionRange,
    `Base (10) + Perception modifier (${totalStats.perception - 10} × 0.5)`
  );
}

function addBasicSurvivalAbilities(
  abilities: Record<string, { value: number; sources: string[] }>,
  totalStats: { [k: string]: number }
) {
  // Only basic derived stats
  const healthRegenRate = 0.5 + (totalStats.constitution - 10) * 0.1;
  addAbility(
    abilities,
    'healthRegenRate',
    healthRegenRate,
    `Base (0.5) + Constitution modifier (${totalStats.constitution - 10} × 0.1)`
  );

  const diseaseResistance = Math.max(0, (totalStats.constitution - 10) * 0.05);
  addAbility(
    abilities,
    'diseaseResistance',
    diseaseResistance,
    `Constitution modifier (${totalStats.constitution - 10} × 0.05, min 0)`
  );

  const vitality = totalStats.constitution;
  addAbility(abilities, 'vitality', vitality, `Constitution score (${totalStats.constitution})`);
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
