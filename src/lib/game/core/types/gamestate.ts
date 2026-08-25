import type { Culture, CultureRelation } from './culture';
import type { Kingdom, KingdomParty, KingdomRelation } from './kingdom';
import type { PawnRelationship } from './social';
import type { WorldTile } from './world';
import type { Season, WeatherState } from './environment';
import type {
  PlacedBuilding,
  StockpileZone,
  DesignationType,
  FilterableZoneType,
  ZoneFilter,
  ZoneInstance
} from './buildings';
import type { Job, DroppedItem, WorkAssignment } from './jobs';
import type { CraftingInProgress } from './items';
import type { ResearchProject } from './research';
import type { Pawn, Mob, TamedAnimal } from './entities';
import type { DeadPawnRecord } from './health';
import type { PendingEvent } from './events';

export interface FoodSettings {
  allowedFoodItemIds?: string[];
}

export type DisableableNeed =
  | 'hunger'
  | 'fatigue'
  | 'thirst'
  | 'hygiene'
  | 'wetness'
  | 'relaxation'
  | 'comfort'
  | 'mobHunger';

export interface GameState {
  seed: number;
  turn: number;
  culture: Culture;
  culturePool: Culture[];
  cultureRelations: CultureRelation[];
  kingdoms?: Kingdom[];
  kingdomRelations?: KingdomRelation[];
  kingdomParties?: KingdomParty[];
  nextKingdomVisitTurn?: number;
  relationships?: PawnRelationship[];
  worldPawns?: Pawn[];
  worldMap: WorldTile[][];
  season?: Season;
  seasonDay?: number;
  weather?: WeatherState;
  _debugSeason?: Season;
  _debugTimeOfDay?: number;
  _devResearchGateOff?: boolean;
  _needsDisabled?: Partial<Record<DisableableNeed, boolean>>;
  _devInfiniteFuel?: boolean;
  _devCropGrowthScale?: number;
  _devFreezeDeterioration?: boolean;
  _devFreezeSpoilage?: boolean;
  avgTemperature?: number;
  buildingCounts: Record<string, number>;
  buildings: PlacedBuilding[];
  stockpile: Record<string, number>;
  stockpileZones: StockpileZone[];
  designations: Record<string, DesignationType>;
  zoneTiles?: Record<string, DesignationType[]>;
  zoneFilters?: Partial<Record<FilterableZoneType, ZoneFilter>>;
  zoneInstances?: ZoneInstance[];
  designationZoneId?: Record<string, Partial<Record<DesignationType, string>>>;
  vesselFilterDefaults?: Record<string, string[]>;
  foodSettings?: FoodSettings;
  jobs: Job[];
  maxPopulation: number;
  availableResearch: string[];
  completedResearch: string[];
  currentResearch?: ResearchProject;
  _woodBonus?: number;
  _stoneBonus?: number;
  equippedItems: {
    weapon: string | null;
    head: string | null;
    chest: string | null;
    legs: string | null;
    feet: string | null;
    hands: string | null;
  };
  craftingQueue: CraftingInProgress[];
  currentToolLevel: number;
  workAssignments: Record<string, WorkAssignment>;
  pawns: Pawn[];
  pawnStats: {};
  craftingStationAssignments?: Record<string, string | null>;
  craftingOrderConfigs?: Record<
    string,
    { amount: number; mode: 'once' | 'stockpile'; targetStockpile?: number }
  >;
  droppedItems?: DroppedItem[];
  _carcassCondition?: Record<string, number>;
  deadPawns?: DeadPawnRecord[];
  mobs?: Mob[];
  lairEscalation?: Record<string, number>;
  tamedAnimals?: TamedAnimal[];
  stockpileDecaySeconds?: Record<string, number>;
  toolWear?: Record<string, number>;
  pendingEvent?: PendingEvent;
}
