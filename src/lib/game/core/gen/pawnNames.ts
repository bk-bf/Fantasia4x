import namesData from '../../database/pawns/names.json';
import { rng } from '../util/rng';

const NAMES: { male: string[]; female: string[]; surnames: string[] } = namesData;

export function generatePawnName(sex?: 'male' | 'female'): string {
  const firstNames =
    sex === 'male'
      ? NAMES.male
      : sex === 'female'
        ? NAMES.female
        : [...NAMES.male, ...NAMES.female];

  const firstName = firstNames[Math.floor(rng.random() * firstNames.length)];
  const surname = NAMES.surnames[Math.floor(rng.random() * NAMES.surnames.length)];

  return `${firstName} ${surname}`;
}
