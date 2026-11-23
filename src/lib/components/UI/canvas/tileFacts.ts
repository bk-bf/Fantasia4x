import type { PlacedBuilding, Season, WeatherState, WorldTile } from '$lib/game/core/types';
import {
  computeThermalAt,
  effectiveWindAt,
  ICE_VISIBLE,
  seasonBakedTemp,
  tileTemperature,
  tileWetness,
  windDegreeWord
} from '$lib/game/services/EnvironmentService';
import {
  BIOMES,
  SUBTERRAINS,
  soilFertilityPct,
  soilTierForTile,
  SOIL_TIER_NAME
} from '$lib/game/core/defs/terrains';
import {
  resourceObjectService,
  isGrowableResource
} from '$lib/game/services/ResourceObjectService';
import { buildingService } from '$lib/game/services/BuildingService';
import { cropGrowthDirection } from '$lib/game/core/rules/world/cropHealth';
import { isRoofBuilding } from '$lib/webgl/fantasia-world';

export interface TileFact {
  label: string;
  value: string;
}

export interface TileFacts {
  title: string;
  desc: string;
  rows: TileFact[];
}

export interface TileFactsInput {
  tile: WorldTile;
  light: number;
  floorName: string | null;
  resourceId: string | undefined;
  zoneType: string | null;
  buildings: PlacedBuilding[];
  worldMap: WorldTile[][];
  season: Season;
  weather: WeatherState | undefined;
  ambientTurn: number;
  debug: boolean;
}

const ZONE_NAMES: Record<string, string> = {
  stockpile: 'Stockpile',
  drink: 'Drinking spot',
  wash: 'Washing spot',
  grow: 'Field',
  restrict: 'Kept within',
  harvest: 'Marked to gather',
  mine: 'Marked to dig',
  construct: 'Building site'
};

export function footingWord(cost: number): string {
  if (cost <= 0) return 'impassable';
  if (cost <= 1.0) return 'firm';
  if (cost <= 1.5) return 'easy';
  if (cost <= 2.0) return 'slow';
  if (cost <= 3.0) return 'very slow';
  return 'barely passable';
}

const lightWord = (l: number) =>
  l >= 0.8 ? 'bright' : l >= 0.4 ? 'dim' : l >= 0.1 ? 'dark' : 'pitch dark';
const dampWord = (w: number) => (w < 10 ? 'dry' : w < 30 ? 'damp' : w < 60 ? 'wet' : 'soaked');
const growthMark = { falling: 'wilting', mature: 'ripe', rising: 'growing' } as const;

export function envFacts(i: TileFactsInput): TileFact[] {
  const { tile } = i;
  const thermal = computeThermalAt(tile.x, tile.y, i.buildings, i.worldMap);
  const temp = Math.round(
    tileTemperature(tile.terrainType, i.season, i.ambientTurn, i.weather, thermal)
  );
  const ice = Math.round(tile.ice ?? 0);
  const wet =
    tileWetness(tile.moisture ?? 0, i.weather, thermal, ice) *
    (tile.floor ? 1 - tile.floor.dryness : 1);
  const wind = windDegreeWord(effectiveWindAt(tile.x, tile.y, i.weather, thermal, i.worldMap));
  const baked = i.debug ? ` (${seasonBakedTemp(tile.terrainType, i.season)}°)` : '';
  return [
    { label: 'Light', value: `${lightWord(i.light)}, ${Math.round(i.light * 100)}%` },
    { label: 'Warmth', value: `${temp}°${baked}` },
    { label: 'Damp', value: `${dampWord(wet)}, ${Math.round(wet)}%` },
    { label: 'Wind', value: wind ? `${wind} windy` : 'still' }
  ];
}

export function tileFacts(i: TileFactsInput): TileFacts {
  const { tile } = i;
  const snow = Math.round(tile.snow ?? 0);
  const ice = Math.round(tile.ice ?? 0);
  const res = i.resourceId ? resourceObjectService.getById(i.resourceId) : undefined;
  const rows: TileFact[] = [
    {
      label: 'Footing',
      value: tile.walkable
        ? `${footingWord((tile.movementCost ?? 1) * (1 + (snow + ice) / 100))}${snow > 0 ? ', in snow' : ''}`
        : 'impassable'
    },
    ...envFacts(i)
  ];
  const tier = soilTierForTile(tile);
  rows.push({ label: 'Soil', value: `${SOIL_TIER_NAME[tier]}, ${soilFertilityPct(tile)}%` });
  const roof = i.buildings.find(
    (b) => b.x === tile.x && b.y === tile.y && b.status === 'complete' && isRoofBuilding(b)
  );
  if (roof) {
    const def = buildingService.getBuildingById(roof.type);
    rows.push({
      label: 'Roof',
      value: def?.conditionDecayPerTurn
        ? `${def.name}, ${Math.round(roof.condition ?? 100)}%`
        : (def?.name ?? 'roofed')
    });
  }
  if (res && tile.walkable && isGrowableResource(res)) {
    const pct = Math.round(tile.growth?.[res.id] ?? 100);
    const dir = res.crop
      ? cropGrowthDirection(pct, res.crop, {
          soilTier: tier,
          temp: Math.round(
            tileTemperature(
              tile.terrainType,
              i.season,
              i.ambientTurn,
              i.weather,
              computeThermalAt(tile.x, tile.y, i.buildings, i.worldMap)
            )
          ),
          moisture: tile.moisture ?? 0,
          snow
        })
      : pct >= 100
        ? 'mature'
        : 'rising';
    rows.push({ label: 'Growth', value: `${growthMark[dir]}, ${pct}%` });
  }
  if (tile.walkable && snow > 0) rows.push({ label: 'Snow', value: `${snow}%` });
  if (tile.walkable && ice >= ICE_VISIBLE) rows.push({ label: 'Ice', value: `${ice}%` });
  if (i.zoneType && ZONE_NAMES[i.zoneType])
    rows.push({ label: 'Zone', value: ZONE_NAMES[i.zoneType] });
  return {
    title:
      i.floorName ??
      SUBTERRAINS[tile.subType]?.displayName ??
      BIOMES[tile.terrainType]?.displayName ??
      '',
    desc: [BIOMES[tile.terrainType]?.displayName, res?.displayName].filter(Boolean).join(' · '),
    rows
  };
}
