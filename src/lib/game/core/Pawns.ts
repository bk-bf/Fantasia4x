import type { Pawn, Race } from './types';

export function generatePawns(race: Race, count?: number): Pawn[] {
  const num = count ?? race.population ?? 1;
  return Array.from({ length: num }, (_, i) => ({
    id: `pawn_${i}`,
    name: `Worker ${i + 1}`,
    stats: { ...race.baseStats },
    skills: {},
    currentWork: undefined,
    workLocation: undefined
  }));
}