import type {
  GameState,
  Pawn,
  EntityNeeds,
  PawnState,
  Race,
  EntityStats,
  RacialTrait
} from '../core/types';
import { createPawnInventory, createPawnEquipment } from '../core/PawnEquipment';
import { modifierSystem } from '../systems/ModifierSystem';
import { createDefaultBodyParts } from '../systems/Combat';
import { rng } from '../core/rng';

// Module-level counter for sequential debug IDs across all generated pawns.
let _pawnDebugIdCounter = 1;

/** Stamina pool derived from constitution and dexterity — shared by Pawn and Mob. */
export function calcMaxStamina(stats: EntityStats): number {
  return 50 + (stats.constitution - 10) * 4 + (stats.dexterity - 10) * 2;
}

/**
 * Blood pool recovery rate per second when not bleeding.
 * Formula matches blood_regeneration ability: 1.0 + (CON − 10) × 0.08.
 * Base rate 0.05 /s gives ~0→100 in 2000 s at CON 10; scales with CON.
 */
export function calcBloodRegenRate(stats: EntityStats): number {
  return (1.0 + (stats.constitution - 10) * 0.08) * 0.05;
}

/** Blood pool derived from body weight and constitution. */
export function calcMaxBloodVolume(physicalTraits: { weight: number }, stats: EntityStats): number {
  return Math.round(physicalTraits.weight * 1.4 + (stats.constitution - 10) * 2);
}

// Update generatePawns function
export function generatePawns(race: Race, count?: number): Pawn[] {
  const pawns: Pawn[] = [];
  const pawnCount = count || 3;

  for (let i = 0; i < pawnCount; i++) {
    const baseStats = rollStatsFromRanges(race.statRanges);
    const finalStats = applyRacialTraitBonuses(baseStats, race.racialTraits);
    const physicalTraits = rollPhysicalTraits(race.physicalTraits);
    const maxBloodVolume = calcMaxBloodVolume(physicalTraits, finalStats);
    const maxStamina = calcMaxStamina(finalStats);

    const pawn: Pawn = {
      id: `pawn-${i}`,
      debugId: _pawnDebugIdCounter++,
      name: generatePawnName(),
      stats: finalStats,
      physicalTraits,
      racialTraits: race.racialTraits,
      inventory: createPawnInventory(10), // 10 base inventory slots
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
      skills: {},
      // Survival & Health
      isAlive: true,
      maxBloodVolume,
      bloodVolume: maxBloodVolume,
      conditions: [],
      // Combat — stamina
      stamina: maxStamina,
      maxStamina,
      limbs: [
        {
          id: 'head',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('head')
        },
        {
          id: 'torso',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('torso')
        },
        {
          id: 'left_arm',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('left_arm')
        },
        {
          id: 'right_arm',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('right_arm')
        },
        {
          id: 'left_leg',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('left_leg')
        },
        {
          id: 'right_leg',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('right_leg')
        }
      ]
    };

    pawns.push(pawn);
  }

  return pawns;
}

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

// UPDATED: Simplified categorization focused on basic abilities
export function categorizeStats(
  stats: Record<string, { value: number; sources: string[] }>
): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    'Basic Physical': [],
    'Basic Mental': [],
    'Basic Survival': [],
    Skills: [],
    Special: []
  };

  Object.keys(stats).forEach((statName) => {
    const lowerName = statName.toLowerCase();

    // Skills
    if (lowerName.startsWith('skill_')) {
      categories['Skills'].push(statName);
    }
    // Basic Physical abilities
    else if (
      lowerName.includes('carry') ||
      lowerName.includes('movement') ||
      lowerName.includes('swimming') ||
      lowerName.includes('vision')
    ) {
      categories['Basic Physical'].push(statName);
    }
    // Basic Mental abilities
    else if (
      lowerName.includes('learning') ||
      lowerName.includes('social') ||
      lowerName.includes('intuition') ||
      lowerName.includes('knowledge') ||
      lowerName.includes('experience')
    ) {
      categories['Basic Mental'].push(statName);
    }
    // Basic Survival abilities
    else if (
      lowerName.includes('health') ||
      lowerName.includes('disease') ||
      lowerName.includes('vitality')
    ) {
      categories['Basic Survival'].push(statName);
    }
    // Everything else goes to Special (ModifierSystem handled abilities)
    else {
      categories['Special'].push(statName);
    }
  });

  // Remove empty categories
  Object.keys(categories).forEach((category) => {
    if (categories[category].length === 0) {
      delete categories[category];
    }
  });

  return categories;
}

// SIMPLIFIED: Basic stat descriptions only
export function getStatDescription(
  statName: string,
  statData: { value: number; sources: string[] }
): string {
  const descriptions: Record<string, string> = {
    // Basic Physical
    carryCapacity: 'Maximum weight that can be carried (kg)',
    movementSpeed: 'Movement points per turn',
    swimmingSpeed: 'Movement speed in water',
    visionRange: 'Maximum sight distance (meters)',

    // Basic Mental
    learningSpeed: 'Multiplier for skill development',
    socialInfluence: 'Effectiveness in diplomacy and trade',
    intuition: 'Ability to detect danger and opportunities',
    knowledgeStorage: 'Capacity to store information',
    experienceGain: 'Rate of learning from practical activities',

    // Basic Survival
    healthRegenRate: 'Health points recovered per turn',
    diseaseResistance: 'Resistance to illness and poison',
    vitality: 'Overall health and constitution',

    // Skills
    skill_mining: 'Experience in mineral extraction',
    skill_woodcutting: 'Experience in wood harvesting',
    skill_crafting: 'Experience in item creation',
    skill_hunting: 'Experience in hunting animals',
    skill_fishing: 'Experience in catching fish',
    skill_foraging: 'Experience in gathering resources',
    skill_research: 'Experience in knowledge discovery',
    skill_construction: 'Experience in building structures'
  };

  // Handle generic skill descriptions
  if (statName.startsWith('skill_')) {
    const skillName = statName.replace('skill_', '');
    return descriptions[statName] || `Experience in ${skillName}`;
  }

  return descriptions[statName] || 'Special stat with unique effects';
}

// --- Existing utility functions (unchanged) ---

function rollStatsFromRanges(statRanges: Record<string, [number, number]>): EntityStats {
  const stats: any = {};

  Object.entries(statRanges).forEach(([statName, [min, max]]) => {
    stats[statName] = min + Math.floor(rng.random() * (max - min + 1));
  });

  return stats as EntityStats;
}

function applyRacialTraitBonuses(baseStats: EntityStats, traits: RacialTrait[]): EntityStats {
  const modifiedStats = { ...baseStats };

  traits.forEach((trait) => {
    Object.entries(trait.effects).forEach(([effectName, effectValue]) => {
      if (effectName.endsWith('Bonus') && typeof effectValue === 'number') {
        const statName = effectName.replace('Bonus', '').toLowerCase() as keyof EntityStats;
        if (modifiedStats[statName] !== undefined) {
          modifiedStats[statName] += effectValue;
        }
      } else if (effectName.endsWith('Penalty') && typeof effectValue === 'number') {
        const statName = effectName.replace('Penalty', '').toLowerCase() as keyof EntityStats;
        if (modifiedStats[statName] !== undefined) {
          modifiedStats[statName] = Math.max(1, modifiedStats[statName] + effectValue);
        }
      }
    });
  });

  return modifiedStats;
}

function rollPhysicalTraits(racePhysicalTraits: any): any {
  const { heightRange, weightRange, size } = racePhysicalTraits;

  return {
    height: heightRange[0] + Math.floor(rng.random() * (heightRange[1] - heightRange[0] + 1)),
    weight: weightRange[0] + Math.floor(rng.random() * (weightRange[1] - weightRange[0] + 1)),
    size: size
  };
}
function generatePawnName(): string {
  const firstNames = [
    'Aria',
    'Brom',
    'Celia',
    'Dain',
    'Enna',
    'Finn',
    'Greta',
    'Hale',
    'Ivy',
    'Jax',
    'Kira',
    'Lark',
    'Mira',
    'Nix',
    'Opal',
    'Pike',
    'Quinn',
    'Ren',
    'Sage',
    'Thea',
    'Uma',
    'Vale',
    'Wren',
    'Xara',
    'Yuki',
    'Zara',
    'Axel',
    'Blair',
    'Clay',
    'Dawn',
    'Echo',
    'Frost',
    'Gage',
    'Haven',
    'Indigo',
    'Jade',
    'Knox',
    'Luna',
    'Moss',
    'Nova',
    'Onyx',
    'Petra',
    'Quest',
    'River',
    'Storm',
    'Thorn',
    'Unity',
    'Vex',
    'Wolf',
    'Zephyr'
  ];

  const surnames = [
    'Ashbrook',
    'Blackwood',
    'Clearwater',
    'Darkstone',
    'Emberfall',
    'Frostborn',
    'Goldleaf',
    'Hawthorne',
    'Ironforge',
    'Jadeheart',
    'Kindred',
    'Lightbringer',
    'Moonwhisper',
    'Nightfall',
    'Oakheart',
    'Proudfoot',
    'Quicksilver',
    'Ravenclaw',
    'Starweaver',
    'Thornfield',
    'Underhill',
    'Valorheart',
    'Wildstorm',
    'Wyvernheart',
    'Brightblade',
    'Copperstone',
    'Driftwood',
    'Earthsong',
    'Fireforge',
    'Graymane',
    'Healingsong',
    'Ironback',
    'Jewelcrest',
    'Keenblade',
    'Littlewater',
    'Miralake'
  ];

  const firstName = firstNames[Math.floor(rng.random() * firstNames.length)];
  const surname = surnames[Math.floor(rng.random() * surnames.length)];

  return `${firstName} ${surname}`;
}

// --- Business logic moved to PawnService.ts ---
// All need management, state updates, and turn processing now handled by PawnService
