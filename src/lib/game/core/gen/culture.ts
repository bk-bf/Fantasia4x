import type { Culture, CultureLore, CultureRelation } from '../types';
import { CORE_STAT_KEYS } from '../types';
import { CULTURE_LORE, type Archetype } from '../defs/cultureLore';
import { SIZES, SIZE_BOX } from '../rules/body/size';
import { SPAWN_STAT_CAP } from '../rules/body/spawnStatCap';
import { dispositionFor } from '../rules/social/cultureBuckets';
import { clamp } from '../util/math';
import { rng } from '../util/rng';
import { capitalize } from '../util/text';
import { generateCultureDescription } from './cultureDescription';
import { generateCultureName, slugify } from './cultureNames';
import { generateCultureTraitSets } from './cultureTraits';

export function generateCulture(archetype: Archetype = rng.pick(CULTURE_LORE.archetypes)): Culture {
  const statRanges = generateStatRanges(archetype);
  const physicalTraits = generatePhysicalTraits(archetype);
  const { guaranteed, pool } = generateCultureTraitSets(archetype);

  const lore: CultureLore = {
    ...generateLoreFields(archetype),
    description: ''
  };

  const culture: Culture = {
    id: slugify(generateCultureName()),
    name: '',
    archetype: archetype.name,
    statRanges,
    physicalTraits,
    guaranteedTraits: guaranteed,
    culturalTraitPool: pool,
    lore,
    population: 0
  };
  culture.name = capitalize(culture.id.split('-')[0]);
  culture.lore.description = generateCultureDescription(culture);
  return culture;
}

export function generateCulturePool(count = rng.int(15, 25)): Culture[] {
  const pool: Culture[] = [];
  const usedIds = new Set<string>();
  let guard = 0;
  while (pool.length < count && guard < count * 20) {
    guard++;
    const culture = generateCulture();
    if (usedIds.has(culture.id)) continue;
    usedIds.add(culture.id);
    pool.push(culture);
  }
  return pool;
}

export function generateCultureRelations(pool: Culture[]): CultureRelation[] {
  const relations: CultureRelation[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      const kinship = a.archetype === b.archetype ? 35 : 0;
      const score = clamp(Math.round(rng.range(-70, 70) + kinship), -100, 100);
      relations.push({ a: a.id, b: b.id, score, disposition: dispositionFor(score) });
    }
  }
  return relations;
}

function generateStatRanges(archetype: Archetype): Record<string, [number, number]> {
  const ranges: Record<string, [number, number]> = {};
  for (const stat of CORE_STAT_KEYS) {
    let min = rng.int(8, 11);
    let max = rng.int(13, 16);
    if (archetype.statFocus.includes(stat)) {
      min += rng.int(2, 4);
      max += rng.int(3, 5);
    } else if (archetype.statDump.includes(stat)) {
      min = Math.max(5, min - rng.int(2, 4));
      max = Math.max(9, max - rng.int(3, 4));
    } else if (rng.random() < 0.25) {
      const shift = rng.random() < 0.5 ? 2 : -2;
      min = Math.max(5, min + shift);
      max = Math.max(min + 3, max + shift);
    }
    max = Math.min(SPAWN_STAT_CAP, max);
    min = Math.min(min, max);
    ranges[stat] = [min, max];
  }
  return ranges;
}

function generatePhysicalTraits(archetype: Archetype): Culture['physicalTraits'] {
  const size =
    rng.random() < 0.75 && archetype.sizeBias.length > 0
      ? rng.pick(archetype.sizeBias)
      : rng.pick(SIZES);

  const box = SIZE_BOX[size];
  const hVar = rng.int(15, 35);
  const wVar = rng.int(10, 30);
  return {
    heightRange: [box.height[0] + rng.int(0, hVar), box.height[1] + rng.int(0, hVar)],
    weightRange: [box.weight[0] + rng.int(0, wVar), box.weight[1] + rng.int(0, wVar)],
    size
  };
}

function generateLoreFields(archetype: Archetype): Omit<CultureLore, 'description'> {
  return {
    epithet: rng.pick(archetype.epithets),
    origin: rng.pick(archetype.origins),
    homeland: rng.pick(archetype.homelands),
    temperament: rng.pick(archetype.temperaments),
    belief: rng.pick(archetype.beliefs)
  };
}
