import type { Race, RaceStats } from './types';

// Comprehensive Racial Trait Database
const RACIAL_TRAIT_DATABASE = [
  // Physical Traits
  {
    name: "Iron Skin", 
    description: "Metallic skin that provides natural armor.",
    icon: "🛡️",
    effects: {
      constitutionBonus: 3,
      damageReduction: 0.2,
      workEfficiency: { 'mining': 1.15, 'construction': 1.1 }
    }
  },
  {
    name: "Dragon Heritage", 
    description: "Ancient draconic bloodline grants resilience and power.",
    icon: "🐉",
    effects: {
      strengthBonus: 2,
      constitutionBonus: 2,
      fireResistance: 0.5,
      intimidation: 1.3
    }
  },
  {
    name: "Feathered", 
    description: "Light feathers provide insulation and grace.",
    icon: "🪶",
    effects: {
      dexterityBonus: 2,
      constitutionPenalty: -1,
      coldResistance: 0.3,
      fallDamageReduction: 0.8
    }
  },
  {
    name: "Stone Bones", 
    description: "Dense, stone-like bone structure.",
    icon: "🗿",
    effects: {
      constitutionBonus: 4,
      strengthBonus: 1,
      dexterityPenalty: -2,
      crushResistance: 0.6
    }
  },
  {
    name: "Crystalline Eyes", 
    description: "Crystal-like eyes that see magical auras.",
    icon: "💎",
    effects: {
      wisdomBonus: 2,
      intelligenceBonus: 1,
      magicDetection: 1.5,
      workEfficiency: { 'research': 1.2 }
    }
  },

  // Elemental Traits
  {
    name: "Flame Touched", 
    description: "Body radiates warmth, immune to cold.",
    icon: "🔥",
    effects: {
      fireResistance: 0.8,
      coldImmunity: 1.0,
      workEfficiency: { 'metalworking': 1.3 }
    }
  },
  {
    name: "Frost Born", 
    description: "Born in eternal winter, thrives in cold.",
    icon: "❄️",
    effects: {
      coldResistance: 0.9,
      heatSensitivity: 1.5,
      workEfficiency: { 'fishing': 1.2 },
      hungerRate: 0.8
    }
  },
  {
    name: "Earth Bound", 
    description: "Connected to the earth and stone.",
    icon: "🌍",
    effects: {
      strengthBonus: 2,
      workEfficiency: { 'mining': 1.4, 'digging': 1.3 },
      tremorsense: 1.0
    }
  },
  {
    name: "Wind Walker", 
    description: "Moves with the grace of the wind.",
    icon: "💨",
    effects: {
      dexterityBonus: 3,
      movementSpeed: 1.2,
      workEfficiency: { 'hunting': 1.2 },
      fatigueRate: 0.9
    }
  },

  // Mystical Traits
  {
    name: "Stargazer", 
    description: "Eyes that reflect the cosmos, naturally wise.",
    icon: "⭐",
    effects: {
      wisdomBonus: 3,
      intelligenceBonus: 1,
      nightVision: 1.0,
      workEfficiency: { 'research': 1.25 }
    }
  },
  {
    name: "Dream Walker", 
    description: "Can enter and manipulate dreams.",
    icon: "🌙",
    effects: {
      wisdomBonus: 2,
      charismaBonus: 1,
      sleepEfficiency: 1.5,
      mentalResistance: 0.7
    }
  },
  {
    name: "Void Touched", 
    description: "Touched by the emptiness between worlds.",
    icon: "🌌",
    effects: {
      intelligenceBonus: 2,
      constitutionPenalty: -1,
      magicResistance: 0.6,
      workEfficiency: { 'research': 1.3 }
    }
  },

  // Biological Traits
  {
    name: "Keen Senses", 
    description: "Extraordinarily sharp senses.",
    icon: "👁️",
    effects: {
      wisdomBonus: 2,
      dexterityBonus: 1,
      workEfficiency: { 'hunting': 1.3, 'foraging': 1.2 },
      dangerSense: 1.4
    }
  },
  {
    name: "Regenerative", 
    description: "Naturally heals wounds over time.",
    icon: "💚",
    effects: {
      constitutionBonus: 2,
      healingRate: 2.0,
      hungerRate: 1.2,
      diseaseResistance: 0.4
    }
  },
  {
    name: "Venomous", 
    description: "Natural toxins in saliva and claws.",
    icon: "🐍",
    effects: {
      constitutionBonus: 1,
      dexterityBonus: 1,
      poisonResistance: 0.8,
      workEfficiency: { 'alchemy': 1.2 }
    }
  },
  {
    name: "Amphibious", 
    description: "Equally at home on land and in water.",
    icon: "🐸",
    effects: {
      constitutionBonus: 1,
      workEfficiency: { 'fishing': 1.5 },
      waterBreathing: 1.0,
      swimmingSpeed: 2.0
    }
  },

  // Social/Mental Traits
  {
    name: "Hive Mind", 
    description: "Shared consciousness with others of the same race.",
    icon: "🧠",
    effects: {
      intelligenceBonus: 2,
      charismaBonus: 1,
      workEfficiency: { 'all': 1.1 },
      telepathicRange: 100
    }
  },
  {
    name: "Pack Hunter", 
    description: "Works better in groups, struggles alone.",
    icon: "🐺",
    effects: {
      strengthBonus: 1,
      dexterityBonus: 1,
      workEfficiency: { 'hunting': 1.4 },
      groupBonus: 1.15,
      isolationPenalty: 0.8
    }
  },
  {
    name: "Loner", 
    description: "Prefers solitude, works best alone.",
    icon: "🦅",
    effects: {
      wisdomBonus: 2,
      charismaBonus: -1,
      workEfficiency: { 'research': 1.3, 'crafting': 1.2 },
      groupPenalty: 0.9
    }
  },

  // Exotic Traits
  {
    name: "Shapeshifter", 
    description: "Can alter physical form slightly.",
    icon: "🦋",
    effects: {
      dexterityBonus: 2,
      charismaBonus: 1,
      adaptability: 1.3,
      workEfficiency: { 'all': 1.05 }
    }
  },
  {
    name: "Photosynthetic", 
    description: "Gains energy from sunlight.",
    icon: "🌱",
    effects: {
      constitutionBonus: 1,
      hungerRate: 0.6,
      sunlightDependency: 1.0,
      workEfficiency: { 'foraging': 1.2 }
    }
  },
  {
    name: "Nocturnal", 
    description: "Active during night, sluggish during day.",
    icon: "🦉",
    effects: {
      dexterityBonus: 1,
      wisdomBonus: 1,
      nightVision: 1.0,
      daytimePenalty: 0.8,
      workEfficiency: { 'hunting': 1.2 }
    }
  },
  {
    name: "Ancient", 
    description: "Extremely long-lived, wise but frail.",
    icon: "📜",
    effects: {
      wisdomBonus: 4,
      intelligenceBonus: 2,
      constitutionPenalty: -2,
      workEfficiency: { 'research': 1.4 },
      memoryBonus: 1.5
    }
  },
  {
    name: "Berserker Blood", 
    description: "Enters rage states when threatened.",
    icon: "⚔️",
    effects: {
      strengthBonus: 3,
      constitutionBonus: 1,
      wisdomPenalty: -1,
      combatRage: 1.5,
      workEfficiency: { 'hunting': 1.3 }
    }
  },

  // Mundane but Useful Traits
  {
    name: "Industrious", 
    description: "Naturally hardworking and efficient.",
    icon: "🔧",
    effects: {
      constitutionBonus: 1,
      workEfficiency: { 'all': 1.15 },
      fatigueRate: 0.85,
      productionBonus: 1.1
    }
  },
  {
    name: "Meticulous", 
    description: "Extremely careful and precise in all tasks.",
    icon: "🔍",
    effects: {
      dexterityBonus: 2,
      intelligenceBonus: 1,
      workEfficiency: { 'crafting': 1.3, 'research': 1.15 },
      errorReduction: 0.5
    }
  },
  {
    name: "Robust", 
    description: "Naturally healthy and disease-resistant.",
    icon: "💪",
    effects: {
      constitutionBonus: 3,
      diseaseResistance: 0.6,
      hungerRate: 0.9,
      fatigueRate: 0.9
    }
  },
  {
    name: "Curious", 
    description: "Insatiably curious about the world.",
    icon: "🤔",
    effects: {
      intelligenceBonus: 2,
      wisdomBonus: 1,
      workEfficiency: { 'research': 1.25 },
      experienceGain: 1.2
    }
  }
];

// Helper function to get trait icon
export function getTraitIcon(traitName: string): string {
  const trait = RACIAL_TRAIT_DATABASE.find(t => t.name === traitName);
  return trait?.icon || '✨';
}

const IMPLICATION_DATABASE = {
  knowledge: [
    'Crystal archives store memories in light',
    'Elders speak in riddles and metaphors',
    'Knowledge is carved into living trees',
    'Starlight reveals hidden truths',
    'Ancient songs carry forgotten wisdom'
  ],
  food: [
    'Mushroom farms in dark caverns',
    'Hunting during the blood moon',
    'Fermenting starfruit wine',
    'Gathering dew from sacred leaves',
    'Cooking with elemental fire'
  ],
  combat: [
    'Ritual scarification for battle',
    'Weapons forged from meteor iron',
    'Combat dances under full moons',
    'Armor grown from crystal shells',
    'Warriors bonded to spirit animals'
  ],
  diplomacy: [
    'Speaking in harmonic tones',
    'Gift exchanges of rare minerals',
    'Diplomatic marriages seal alliances',
    'Truth-telling under oath stones',
    'Negotiations held in sacred groves'
  ]
};

export function generateRace(): Race {
  const statRanges = generateStatRanges();
  const physicalTraits = generatePhysicalTraits();
  const racialTraits = generateRacialTraits();

  return {
    id: 'player',
    name: generateRaceName(),
    statRanges,
    physicalTraits,
    racialTraits,
    population: 1,
    implications: generateImplications(statRanges, racialTraits)
  };
}

function generateStatRanges(): Record<string, [number, number]> {
  // Generate more varied stat ranges based on racial archetype
  const statRanges: Record<string, [number, number]> = {};
  
  const stats = ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma', 'constitution'];
  
  stats.forEach(stat => {
    // Base range: 8-12, then modify based on racial focus
    const baseMin = 8 + Math.floor(Math.random() * 3); // 8-10
    const baseMax = 12 + Math.floor(Math.random() * 4); // 12-15
    
    // Occasionally create specialized races with extreme ranges
    if (Math.random() < 0.3) {
      // 30% chance of specialization
      if (Math.random() < 0.5) {
        // High specialization
        statRanges[stat] = [baseMin + 2, baseMax + 3];
      } else {
        // Low specialization  
        statRanges[stat] = [Math.max(6, baseMin - 2), Math.max(10, baseMax - 2)];
      }
    } else {
      statRanges[stat] = [baseMin, baseMax];
    }
  });
  
  return statRanges;
}

function generatePhysicalTraits(): {
  heightRange: [number, number],
  weightRange: [number, number],
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge'
} {
  const sizes = ['tiny', 'small', 'medium', 'large', 'huge'] as const;
  const size = sizes[Math.floor(Math.random() * sizes.length)];
  
  const sizeModifiers = {
    tiny: { 
      height: [80, 120], 
      weight: [25, 45],
      description: "Small and nimble"
    },
    small: { 
      height: [120, 150], 
      weight: [45, 70],
      description: "Compact and agile"
    },
    medium: { 
      height: [150, 190], 
      weight: [60, 100],
      description: "Average humanoid size"
    },
    large: { 
      height: [190, 230], 
      weight: [100, 160],
      description: "Tall and imposing"
    },
    huge: { 
      height: [230, 280], 
      weight: [160, 250],
      description: "Massive and powerful"
    }
  };
  
  const modifier = sizeModifiers[size];
  const heightVariation = 15 + Math.floor(Math.random() * 20); // 15-35 cm variation
  const weightVariation = 10 + Math.floor(Math.random() * 20); // 10-30 kg variation
  
  return {
    heightRange: [
      modifier.height[0] + Math.floor(Math.random() * heightVariation),
      modifier.height[1] + Math.floor(Math.random() * heightVariation)
    ],
    weightRange: [
      modifier.weight[0] + Math.floor(Math.random() * weightVariation),
      modifier.weight[1] + Math.floor(Math.random() * weightVariation)
    ],
    size
  };
}

function generateRacialTraits(): any[] {
  const traits: any[] = [];
  const numTraits = Math.floor(Math.random() * 3) + 2; // 2-4 traits
  
  const availableTraits = [...RACIAL_TRAIT_DATABASE];
  
  // Ensure we don't pick conflicting traits
  const conflictGroups = [
    ['Flame Touched', 'Frost Born'],
    ['Hive Mind', 'Loner'],
    ['Nocturnal', 'Photosynthetic'],
    ['Ancient', 'Berserker Blood']
  ];
  
  for (let i = 0; i < numTraits; i++) {
    if (availableTraits.length === 0) break;
    
    const randomIndex = Math.floor(Math.random() * availableTraits.length);
    const selectedTrait = availableTraits.splice(randomIndex, 1)[0];
    traits.push(selectedTrait);
    
    // Remove conflicting traits
    conflictGroups.forEach(group => {
      if (group.includes(selectedTrait.name)) {
        group.forEach(conflictingName => {
          const conflictIndex = availableTraits.findIndex(t => t.name === conflictingName);
          if (conflictIndex !== -1) {
            availableTraits.splice(conflictIndex, 1);
          }
        });
      }
    });
  }
  
  return traits;
}

function generateRaceName(): string {
  const prefixes = [
    'Astra', 'Zeph', 'Nyx', 'Vor', 'Keth', 'Lum', 'Drak', 'Vel', 'Mor', 'Syl',
    'Tharn', 'Krix', 'Vex', 'Zol', 'Quin', 'Hex', 'Flux', 'Ryn', 'Thal', 'Skorn'
  ];
  const suffixes = [
    'ani', 'ori', 'ith', 'ara', 'eon', 'ys', 'eth', 'ian', 'oth', 'ael',
    'ix', 'ock', 'ung', 'ast', 'orn', 'ek', 'ul', 'an', 'ur', 'ex'
  ];
  
  return prefixes[Math.floor(Math.random() * prefixes.length)] + 
         suffixes[Math.floor(Math.random() * suffixes.length)];
}

function generateImplications(statRanges: Record<string, [number, number]>, traits: any[]): Record<string, string> {
  // Generate trait-influenced implications
  const implications: Record<string, string> = {};
  
  // Base implications
  Object.keys(IMPLICATION_DATABASE).forEach(category => {
    const categoryImplications = IMPLICATION_DATABASE[category as keyof typeof IMPLICATION_DATABASE];
    implications[category] = categoryImplications[Math.floor(Math.random() * categoryImplications.length)];
  });
  
  // Modify based on traits
  traits.forEach(trait => {
    if (trait.name === 'Dragon Heritage') {
      implications.combat = 'Ancient dragon pacts grant martial prowess';
    } else if (trait.name === 'Stargazer') {
      implications.knowledge = 'Celestial observations reveal cosmic truths';
    } else if (trait.name === 'Photosynthetic') {
      implications.food = 'Sunlight sustains them, reducing need for traditional food';
    } else if (trait.name === 'Hive Mind') {
      implications.diplomacy = 'Collective consciousness enables perfect coordination';
    }
  });
  
  return implications;
}