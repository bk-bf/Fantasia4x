import type { Race, RaceStats } from './types';

// Trait database
const TRAIT_DATABASE = [
  'Mighty', 'Scholarly', 'Diplomatic', 'Hardy', 'Swift', 'Mystical',
  'Resilient', 'Cunning', 'Noble', 'Fierce', 'Ancient', 'Adaptive',
  'Proud', 'Nomadic', 'Industrious', 'Spiritual', 'Warlike', 'Peaceful',
  'Inventive', 'Traditional', 'Mercantile', 'Artistic', 'Stoic', 'Passionate'
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
  // Generate random stat variation range
  const minVariation = Math.floor(Math.random() * 21) - 10; // -10 to 10
  const maxVariation = Math.floor(Math.random() * 21) - 10; // -10 to 10
  const statVariationMin = Math.min(minVariation, maxVariation);
  const statVariationMax = Math.max(minVariation, maxVariation);

  const baseStats: RaceStats = {
    strength: rollStatInRange(statVariationMin, statVariationMax),
    dexterity: rollStatInRange(statVariationMin, statVariationMax),
    intelligence: rollStatInRange(statVariationMin, statVariationMax),
    wisdom: rollStatInRange(statVariationMin, statVariationMax),
    charisma: rollStatInRange(statVariationMin, statVariationMax),
    constitution: rollStatInRange(statVariationMin, statVariationMax)
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

function rollStatInRange(min: number, max: number): number {
  const baseRoll = Math.floor(Math.random() * 10) + 8; // 8-17 base
  const variation = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.max(1, Math.min(20, baseRoll + variation)); // Clamp between 1-20
}

function generateRaceName(): string {
  const prefixes = ['Astra', 'Zeph', 'Nyx', 'Vor', 'Keth', 'Lum', 'Drak', 'Vel', 'Mor', 'Syl'];
  const suffixes = ['ani', 'ori', 'ith', 'ara', 'eon', 'ys', 'eth', 'ian', 'oth', 'ael'];
  return prefixes[Math.floor(Math.random() * prefixes.length)] + 
         suffixes[Math.floor(Math.random() * suffixes.length)];
}

function generateTraits(stats: RaceStats): string[] {
  const traits: string[] = [];
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

function generateImplications(stats: RaceStats): Record<string, string> {
  return {
    knowledge: IMPLICATION_DATABASE.knowledge[Math.floor(Math.random() * IMPLICATION_DATABASE.knowledge.length)],
    food: IMPLICATION_DATABASE.food[Math.floor(Math.random() * IMPLICATION_DATABASE.food.length)],
    combat: IMPLICATION_DATABASE.combat[Math.floor(Math.random() * IMPLICATION_DATABASE.combat.length)],
    diplomacy: IMPLICATION_DATABASE.diplomacy[Math.floor(Math.random() * IMPLICATION_DATABASE.diplomacy.length)]
  };
}
