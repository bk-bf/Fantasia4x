import { ticksFromSeconds } from '../../core/util/time';
import itemsData from '../../database/items/items.json';
import { resourceObjectService } from '../ResourceObjectService';

export const SPAWN_CHECK_INTERVAL = ticksFromSeconds(20);
export const SPAWNS_PER_DAY = 2;
export const CHECKS_PER_DAY = (300 * 1) / 20;
export const BASE_SPAWN_CHANCE = SPAWNS_PER_DAY / CHECKS_PER_DAY;
export const NIGHT_SPAWN_MULT = 3;
export const NIGHT_THRESHOLD = 0.3;
export const EDGE_BUFFER = 8;
export const MIN_PAWN_DISTANCE = 12;

export const MAX_HOSTILE = 40;
export const MAX_NEUTRAL = 40;

export const TARGET_ENTITIES_PER_TILE = 325 / (500 * 500);
export const MIN_TARGET_ENTITIES = 40;
export const MAX_TARGET_ENTITIES = 1400;

export function targetEntityCount(width: number, height: number): number {
  const raw = Math.round(width * height * TARGET_ENTITIES_PER_TILE);
  return Math.max(MIN_TARGET_ENTITIES, Math.min(MAX_TARGET_ENTITIES, raw));
}

export const LAIR_TICK_INTERVAL = ticksFromSeconds(300);
export const LAIR_BREED_WEEK_DAYS = 7;
export const LAIR_BREED_BASE = 0.7;
export const LAIR_MAX_POP = 10;
export const MIN_LAIR_SPACING = 10;
export const LAIR_GROW_CHANCE = 0.035;
export const LAIR_ESCALATION_CHANCE = 0.07;
export const LAIR_MAX_ESCALATION = 3;
export function maxLairCount(width: number, height: number): number {
  return Math.max(3, Math.min(60, Math.round((width * height) / 6000)));
}

export const STARTING_BUBBLE_RADIUS = 28;
export const STARTING_BUBBLE_TURNS = 30 * 300;

export function populationCaps(
  width: number,
  height: number
): { total: number; hostile: number; neutral: number } {
  const total = targetEntityCount(width, height);
  return { total, hostile: Math.ceil(total * 0.25), neutral: total };
}
export const CORPSE_DECAY_TICKS = ticksFromSeconds(400);

export const CARCASS_SCAVENGE_RADIUS = 20;
export const EAT_CARCASS_HUNGER_RESTORE = 45;

export const STARTLED_TICKS = ticksFromSeconds(1);
export const SAFE_RESET_TICKS = ticksFromSeconds(15);
export const FLEE_HEALTH_FRACTION = 0.2;

export const FLEE_STAMINA_DRAIN_PER_SECOND = 2.5;

export const BASE_HUNGER_PER_SECOND = 0.27;
export const BASE_FATIGUE_PER_SECOND = 0.32;
export const STARVATION_COLLAPSE_SEVERITY = 0.65;
export const HUNGER_EAT_THRESHOLD = 50;
export const SEED_HUNGER_GRACE = HUNGER_EAT_THRESHOLD;

export const HUNT_OVERSTRETCH_TILES = 16;
export const HUNGER_OVERSTRETCH_THRESHOLD = 75;

export function willFinishOffDowned(
  hunger: number,
  def: { predator?: boolean; diet?: string }
): boolean {
  return hunger >= HUNGER_EAT_THRESHOLD && (def.predator === true || def.diet === 'carnivore');
}
export const HUNGER_SATED_THRESHOLD = 10;
export const FORAGE_RADIUS = 120;
export const HUNT_RADIUS = 150;
export const EAT_GRASS_SECONDS = 1.25;
export const EAT_CORPSE_SECONDS = 0.5;
export const EAT_GRASS_HUNGER_RESTORE = 40;
export const EAT_CORPSE_HUNGER_RESTORE = 50;
export const CORPSE_PORTION = 0.5;
export const WANDER_MOVES_PER_SECOND = 1.0;
export const LIVE_RADIUS = 34;
export const AI_THROTTLE_TICKS = 60;
export const THREAT_INTERRUPT_RANGE = 6;
export const TERRITORIAL_LEASH = 8;
export const HUNT_COOLDOWN_SECONDS = 60;
export const FORAGE_COOLDOWN_SECONDS = 30;
export const FEEDING_STUCK_SECONDS = 30;
export const HUNT_GIVE_UP_SECONDS = 25;
export const SLEEP_FATIGUE_THRESHOLD = 60;
export const MOB_WEATHER_INTERVAL = 120;
export const MOB_WIND_ONSET = 0.45;
export function sleepWakeThreshold(hunger: number): number {
  return hunger >= 70 ? 30 : 0;
}
export const SLEEP_RECOVERY_PER_SECOND = 0.6;
export const SLEEP_MAX_HUNGER = 87;
export const EAT_FORAGE_HUNGER_RESTORE = 45;

export type TileFoodKind = 'grass' | 'forage';

export const FOOD_ITEM_IDS = new Set(
  (itemsData as Array<{ id: string; category?: string; nutrition?: number }>)
    .filter((i) => i.category === 'food' || (i.nutrition ?? 0) > 0)
    .map((i) => i.id)
);
export const WILD_FORAGE_RESOURCE_IDS = new Set(
  resourceObjectService
    .getAll()
    .filter(
      (r) =>
        !r.grazing &&
        r.interaction?.action === 'forage' &&
        (r.interaction.yields ?? []).some((y) => FOOD_ITEM_IDS.has(y.itemId))
    )
    .map((r) => r.id)
);
