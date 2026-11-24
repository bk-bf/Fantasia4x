import { rng } from '$lib/game/core/util/rng';
import { generateCulture, sizeFromHeight, TRAIT_DATABASE } from '$lib/game/core/gen/culture';
import { buildPawnFromCulture } from '$lib/game/entities/Pawns';
import loreData from '$lib/game/database/social/culture-lore.json';

export function folkData(seed: number) {
rng.reseed(seed);
const archetypes = loreData.archetypes as Parameters<typeof generateCulture>[0][];
const cultures = archetypes.map((archetype, ci) => {
  const c = generateCulture(archetype);
  const pawns = Array.from({ length: 10 }, (_, i) => {
    const p = buildPawnFromCulture(c, ci * 100 + i);
    return {
      id: p.id,
      name: p.name,
      sex: p.sex,
      age: p.age,
      height: p.physicalTraits.height,
      weight: p.physicalTraits.weight,
      size: p.physicalTraits.size,
      traits: p.traits.map((t) => t.id)
    };
  });
  return {
    id: c.id,
    name: c.name,
    archetype: c.archetype,
    description: c.lore.description,
    physicalTraits: c.physicalTraits,
    pawns
  };
});
const names = Object.fromEntries(TRAIT_DATABASE.map((t) => [t.id, t.name]));
const rarity = Object.fromEntries(TRAIT_DATABASE.map((t) => [t.id, t.rarity ?? 'common']));
const sizes: Record<string, [number, number]> = {};
for (let cm = 60; cm <= 320; cm++) {
  const k = sizeFromHeight(cm);
  sizes[k] = sizes[k] ? [sizes[k][0], cm] : [cm, cm];
}
const lore = archetypes.map((a) => ({ name: a.name, sizeBias: a.sizeBias, traits: a.traits }));
  return { cultures, archetypes: lore, sizes, traitNames: names, traitRarity: rarity };
}
