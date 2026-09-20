export interface GrowthStage {
  minGrowth: number;
  scale: number;
}

export const GROWTH_STAGES: readonly GrowthStage[] = [
  { minGrowth: 20, scale: 0.5 },
  { minGrowth: 50, scale: 0.75 },
  { minGrowth: 80, scale: 1 }
];

export const RESOURCE_VISIBLE_GROWTH = GROWTH_STAGES[0].minGrowth;

export function growthStageIndex(growth: number): number {
  let idx = -1;
  for (let i = 0; i < GROWTH_STAGES.length; i++) {
    if (growth >= GROWTH_STAGES[i].minGrowth) idx = i;
  }
  return idx;
}

export function growthScale(growth: number): number {
  const idx = growthStageIndex(growth);
  return idx < 0 ? 0 : GROWTH_STAGES[idx].scale;
}
