import type { Race, EntityStats, RacialTrait } from './types';
import raceDbData from '../database/racial-traits.jsonc';
import { rng } from './rng';

export const RACIAL_TRAIT_DATABASE: RacialTrait[] = raceDbData as unknown as RacialTrait[];

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
    population: 1
  };
}

function generateStatRanges(): Record<string, [number, number]> {
  // Generate more varied stat ranges based on racial archetype
  const statRanges: Record<string, [number, number]> = {};

  const stats = ['strength', 'dexterity', 'intelligence', 'perception', 'charisma', 'constitution'];

  stats.forEach((stat) => {
    // Base range: 8-12, then modify based on racial focus
    const baseMin = 8 + Math.floor(rng.random() * 3); // 8-10
    const baseMax = 12 + Math.floor(rng.random() * 4); // 12-15

    // Occasionally create specialized races with extreme ranges
    if (rng.random() < 0.3) {
      // 30% chance of specialization
      if (rng.random() < 0.5) {
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
  heightRange: [number, number];
  weightRange: [number, number];
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
} {
  const sizes = ['tiny', 'small', 'medium', 'large', 'huge'] as const;
  const size = sizes[Math.floor(rng.random() * sizes.length)];

  const sizeModifiers = {
    tiny: {
      height: [80, 120],
      weight: [25, 45],
      description: 'Small and nimble'
    },
    small: {
      height: [120, 150],
      weight: [45, 70],
      description: 'Compact and agile'
    },
    medium: {
      height: [150, 190],
      weight: [60, 100],
      description: 'Average humanoid size'
    },
    large: {
      height: [190, 230],
      weight: [100, 160],
      description: 'Tall and imposing'
    },
    huge: {
      height: [230, 280],
      weight: [160, 250],
      description: 'Massive and powerful'
    }
  };

  const modifier = sizeModifiers[size];
  const heightVariation = 15 + Math.floor(rng.random() * 20); // 15-35 cm variation
  const weightVariation = 10 + Math.floor(rng.random() * 20); // 10-30 kg variation

  return {
    heightRange: [
      modifier.height[0] + Math.floor(rng.random() * heightVariation),
      modifier.height[1] + Math.floor(rng.random() * heightVariation)
    ],
    weightRange: [
      modifier.weight[0] + Math.floor(rng.random() * weightVariation),
      modifier.weight[1] + Math.floor(rng.random() * weightVariation)
    ],
    size
  };
}

function generateRacialTraits(): any[] {
  const traits: any[] = [];
  const numTraits = Math.floor(rng.random() * 3) + 2; // 2-4 traits

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

    const randomIndex = Math.floor(rng.random() * availableTraits.length);
    const selectedTrait = availableTraits.splice(randomIndex, 1)[0];
    traits.push(selectedTrait);

    // Remove conflicting traits
    conflictGroups.forEach((group) => {
      if (group.includes(selectedTrait.name)) {
        group.forEach((conflictingName) => {
          const conflictIndex = availableTraits.findIndex((t) => t.name === conflictingName);
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
    'Astra',
    'Zeph',
    'Nyx',
    'Vor',
    'Keth',
    'Lum',
    'Drak',
    'Vel',
    'Mor',
    'Syl',
    'Tharn',
    'Krix',
    'Vex',
    'Zol',
    'Quin',
    'Hex',
    'Flux',
    'Ryn',
    'Thal',
    'Skorn'
  ];
  const suffixes = [
    'ani',
    'ori',
    'ith',
    'ara',
    'eon',
    'ys',
    'eth',
    'ian',
    'oth',
    'ael',
    'ix',
    'ock',
    'ung',
    'ast',
    'orn',
    'ek',
    'ul',
    'an',
    'ur',
    'ex'
  ];

  return (
    prefixes[Math.floor(rng.random() * prefixes.length)] +
    suffixes[Math.floor(rng.random() * suffixes.length)]
  );
}
