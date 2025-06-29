import type { Hero, RaceStats } from './types';

export function createHero(name: string, baseStats: RaceStats): Hero {
  return {
    id: generateId(),
    name,
    stats: { ...baseStats },
    level: 1,
    equipment: [],
    abilities: []
  };
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}
