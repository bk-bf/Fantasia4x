import { NAME_PREFIXES, NAME_SUFFIXES } from '../defs/cultureNames';
import { rng } from '../util/rng';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function generateCultureName(): string {
  return rng.pick(NAME_PREFIXES) + rng.pick(NAME_SUFFIXES);
}
