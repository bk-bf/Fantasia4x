export interface GroundLayer {
  level: number;
  water: boolean;
}

const LAND: Record<string, number> = {
  dirt: 4,
  grass: 5,
  tall_grass: 5,
  deep_grass: 5,
  savanna: 5,
  mossy_ground: 5,
  tree: 5,
  mud: 2,
  moss: 3,
  bog: 1.5,
  clay: 3,
  riverbank: 3,
  rocky: 5,
  cave: 4,
  tilled: 4,
  terra_preta: 5,
  bush: 5,
  scrubland: 5,
  wildflowers: 5,
  tree_stump: 5,
  fallen_logs: 5,
  dead_trees: 5,
  mushroom_patch: 5,
  quicksand: 2,
  mineral_deposit: 5,
  crystal_formation: 4
};

const WATER: Record<string, number> = { shallow_water: 1, water: 0, rapids: 0 };

const UNLISTED_LEVEL = 5;

export function groundLayer(subType: string): GroundLayer {
  if (subType in WATER) return { level: WATER[subType], water: true };
  return { level: LAND[subType] ?? UNLISTED_LEVEL, water: false };
}
