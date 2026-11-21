import { buildingService } from '$lib/game/services/BuildingService';
import type { Building, GameState } from '$lib/game/core/types';

export const ZONES = 'ZONES';

const SECTION_ORDER = [
  'FIRE & COOKING',
  'WORKSHOPS',
  'SMELTING & FORGE',
  'ARCANE',
  'FARMING & SOIL',
  'KITCHEN & BREWING',
  'FOOD & HIDES',
  'TRAPS & WATER',
  'BEDS & SHELTER',
  'FURNITURE & STORAGE',
  'WALLS & DOORS',
  'ROOFS & WINDOWS',
  'KNOWLEDGE',
  'OTHER'
];

function classify(b: Building): string {
  const e = (b.effects ?? {}) as Record<string, number | boolean>;
  if (b.id === 'campfire' || b.id === 'hearth' || e.isFire) return 'FIRE & COOKING';
  if (e.farming) return 'FARMING & SOIL';
  if (e.cooking) return 'KITCHEN & BREWING';
  if (e.smeltingEnabled || e.smithingEnabled) return 'SMELTING & FORGE';
  if (
    e.butcheringEnabled ||
    e.leatherworkingEnabled ||
    b.id === 'drying_rack' ||
    b.id === 'hide_rack'
  )
    return 'FOOD & HIDES';
  if (e.trapEnabled || e.waterSource) return 'TRAPS & WATER';
  if (e.roof || e.window || b.id.includes('roof') || b.id === 'window') return 'ROOFS & WINDOWS';
  if (e.movementCost === 99 || b.id.includes('wall') || b.id.includes('door'))
    return 'WALLS & DOORS';
  if (e.sleepQuality || e.fatigueRecovery || b.category === 'shelter') return 'BEDS & SHELTER';
  if (e.comfort || b.isStorage || b.category === 'furniture') return 'FURNITURE & STORAGE';
  if (b.category === 'knowledge') return 'KNOWLEDGE';
  if (e.arcane) return 'ARCANE';
  if (e.craftingEnabled) return 'WORKSHOPS';
  return 'OTHER';
}

const ALL_BUILDING_DEFS: Building[] = [
  'housing',
  'production',
  'knowledge',
  'military',
  'food',
  'commerce',
  'magical',
  'exploration',
  'social',
  'furniture',
  'structure',
  'shelter'
].flatMap((cat) => buildingService.getBuildingsByCategory(cat));

export function unlockedBuildings(gs: GameState | null): Building[] {
  const done = gs?.completedResearch ?? [];
  return ALL_BUILDING_DEFS.filter(
    (b) =>
      !b.notBuildable &&
      (!b.debugOnly || gs?.debugMode) &&
      (gs?._devResearchGateOff ||
        !b.researchRequired ||
        done.includes(b.researchRequired as string))
  );
}

export function buildSections(defs: Building[]): { label: string; defs: Building[] }[] {
  return SECTION_ORDER.map((label) => ({
    label,
    defs: defs.filter((b) => classify(b) === label)
  })).filter((s) => s.defs.length > 0);
}
