import type { WorldTile } from '../../types';
import { BIOMES, SUBTERRAINS, SPAWNABLE_BIOMES, WATER_SUBTYPES } from '../../defs/terrains';

export function pickSubterrain(biomeName: string, detailNoise: number): string {
  const parent = BIOMES[biomeName]?.parent;
  for (const [id, def] of Object.entries(SUBTERRAINS)) {
    const range = def.biomes?.[biomeName] ?? (parent ? def.biomes?.[parent] : undefined);
    if (!range) continue;
    const [min, max] = range;
    if ((min === null || detailNoise >= min) && (max === null || detailNoise < max)) {
      return id;
    }
  }
  return 'dirt';
}

export function isSpawnableTile(tile: WorldTile | undefined | null): boolean {
  if (!tile || !tile.walkable) return false;
  const biome = tile.terrainType;
  if (!SPAWNABLE_BIOMES.has(biome) && !SPAWNABLE_BIOMES.has(BIOMES[biome]?.parent ?? ''))
    return false;
  if (WATER_SUBTYPES.has(tile.subType)) return false;
  return true;
}

export function pickBiome(density: number): string | null {
  for (const [name, def] of Object.entries(BIOMES)) {
    if (!def.densityRange) continue;
    if (density >= def.densityRange[0] && density < def.densityRange[1]) return name;
  }
  return null;
}
