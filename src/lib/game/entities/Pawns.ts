import type {
  Pawn,
  EntityNeeds,
  PawnState,
  Race,
  EntityStats,
  RacialTrait
} from '../core/types';
import { createPawnInventory, createPawnEquipment } from '../core/PawnEquipment';
import { createBodyPlanLimbs } from '../systems/Combat';
import { DEFAULT_PLAN } from '../core/BodyParts';
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

/** Roll a single pawn from a specific race (stats within the race's ranges, traits copied,
 *  race identity stamped). Shared by single-race and mixed-colony generation. */
export function buildPawnFromRace(race: Race, index: number): Pawn {
  const baseStats = rollStatsFromRanges(race.statRanges);
  const finalStats = applyRacialTraitBonuses(baseStats, race.racialTraits);
  const physicalTraits = rollPhysicalTraits(race.physicalTraits);
  const maxBloodVolume = calcMaxBloodVolume(physicalTraits, finalStats);
  const maxStamina = calcMaxStamina(finalStats);

  const pawn: Pawn = {
    id: `pawn-${index}`,
    debugId: _pawnDebugIdCounter++,
    name: generatePawnName(),
    stats: finalStats,
    physicalTraits,
    raceId: race.id,
    raceName: race.name,
    racialTraits: race.racialTraits,
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
    skills: {},
    // Survival & Health
    isAlive: true,
    maxBloodVolume,
    bloodVolume: maxBloodVolume,
    conditions: [],
    // Combat — stamina
    stamina: maxStamina,
    maxStamina,
    // Pawns are the humanoid body plan (limbmap.jsonc) at bodyScale 1.0.
    limbs: createBodyPlanLimbs(DEFAULT_PLAN, 1)
  };

  return pawn;
}

/** Generate `count` pawns from a single race (back-compat: extra-pawn backfill path). */
export function generatePawns(race: Race, count = 3): Pawn[] {
  return Array.from({ length: count }, (_, i) => buildPawnFromRace(race, i));
}

/** Generate a fully-mixed starting colony: each pawn is rolled from a random pool race. */
export function generateColonyPawns(racePool: Race[], count = 5): Pawn[] {
  if (racePool.length === 0) return [];
  return Array.from({ length: count }, (_, i) => buildPawnFromRace(rng.pick(racePool), i));
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
