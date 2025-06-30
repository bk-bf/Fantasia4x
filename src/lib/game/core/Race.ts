import type { Race, RaceStats } from './types';

// Trait database
const TRAIT_DATABASE = [
  {
    name: "Mighty", 
    description: "Strong and powerful warriors.",
    effects: {
      combatDamage: 1.1, // 10% bonus
      physicalPower: 2
    }
  },
  {
    name: "Scholarly", 
    description: "Highly intelligent and quick learners.",
    effects: {
      researchSpeed: 1.15,
      knowledgeGain: 1.1
    }
  },
  {
    name: "Diplomatic", 
    description: "Skilled negotiators and peacekeepers.",
    effects: {
      diplomaticSuccess: 1.2,
      tradeBonus: 1.1
    }
  },
  {
    name: "Hardy", 
    description: "Resilient and tough against hardships.",
    effects: {
      healthBonus: 1.1,
      diseaseResistance: 0.5
    }
  },
  {
    name: "Industrious", 
    description: "Hardworking and efficient builders.",
    effects: {
      productionSpeed: 1.15,
      buildingCost: 0.9
    }
  }
  // Add more as needed
];

const IMPLICATION_DATABASE = {
  knowledge: [
    'Ancient libraries boost learning',
    'Oral traditions preserve wisdom',
    'Scholarly debates advance understanding',
    'Meditation enhances insight',
    'Experimentation drives discovery'
  ],
  food: [
    'Efficient farming techniques',
    'Hunting and gathering expertise',
    'Food preservation mastery',
    'Communal feast traditions',
    'Sustainable agriculture'
  ],
  combat: [
    'Warrior culture traditions',
    'Tactical battlefield knowledge',
    'Weapon crafting expertise',
    'Defensive fortification skills',
    'Elite guard formations'
  ],
  diplomacy: [
    'Natural negotiation skills',
    'Cultural exchange expertise',
    'Trade route mastery',
    'Alliance building traditions',
    'Peaceful conflict resolution'
  ]
};
export function generateRace(): Race {
  // statVariationMin: random integer from -10 to -1
  const statVariationMin = Math.floor(Math.random() * 10) - 10; // -10 to -1
  // statVariationMax: random integer from 0 to 10
  const statVariationMax = Math.floor(Math.random() * 11); // 0 to 10

  const baseStats: RaceStats = {
    strength: 10 + rollStatVariation(statVariationMin, statVariationMax),
    dexterity: 10 + rollStatVariation(statVariationMin, statVariationMax),
    intelligence: 10 + rollStatVariation(statVariationMin, statVariationMax),
    wisdom: 10 + rollStatVariation(statVariationMin, statVariationMax),
    charisma: 10 + rollStatVariation(statVariationMin, statVariationMax),
    constitution: 10 + rollStatVariation(statVariationMin, statVariationMax)
  };

  return {
    id: 'player',
    name: generateRaceName(),
    baseStats,
    traits: generateTraits(baseStats),
    population: 1,
    statVariation: `${statVariationMin} to ${statVariationMax}`,
    implications: generateImplications(baseStats)
  };
}

// This function rolls a random integer between min and max (inclusive)
function rollStatVariation(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRaceName(): string {
  const prefixes = ['Astra', 'Zeph', 'Nyx', 'Vor', 'Keth', 'Lum', 'Drak', 'Vel', 'Mor', 'Syl'];
  const suffixes = ['ani', 'ori', 'ith', 'ara', 'eon', 'ys', 'eth', 'ian', 'oth', 'ael'];
  return prefixes[Math.floor(Math.random() * prefixes.length)] + 
         suffixes[Math.floor(Math.random() * suffixes.length)];
}

function generateTraits(stats: RaceStats): any[] {
  const traits: any[] = [];
  const numTraits = Math.floor(Math.random() * 4) + 1; // 1-4 traits
  
  // Get random traits from database
  const availableTraits = [...TRAIT_DATABASE];
  for (let i = 0; i < numTraits; i++) {
    if (availableTraits.length === 0) break;
    const randomIndex = Math.floor(Math.random() * availableTraits.length);
    traits.push(availableTraits.splice(randomIndex, 1)[0]);
  }
  
  return traits;
}

// This file provides functions for generating a new Race, including random base stats, a random name,
// a set of random traits, and "implications"—flavor text snippets for knowledge, food, combat, and diplomacy.
// Currently, the implication descriptions are picked randomly from fixed arrays in IMPLICATION_DATABASE,
// regardless of the actual stats of the race. 
// TODO: Rework the implication generation so that the descriptions are more varied and are divided into
// subcategories or weighted pools, allowing the function to selectively draw implications based on the race's stats.
// This will make the generated flavor text more meaningful and tailored to each race.
function generateImplications(stats: RaceStats): Record<string, string> {
  return {
    knowledge: IMPLICATION_DATABASE.knowledge[Math.floor(Math.random() * IMPLICATION_DATABASE.knowledge.length)],
    food: IMPLICATION_DATABASE.food[Math.floor(Math.random() * IMPLICATION_DATABASE.food.length)],
    combat: IMPLICATION_DATABASE.combat[Math.floor(Math.random() * IMPLICATION_DATABASE.combat.length)],
    diplomacy: IMPLICATION_DATABASE.diplomacy[Math.floor(Math.random() * IMPLICATION_DATABASE.diplomacy.length)]
  };
}
