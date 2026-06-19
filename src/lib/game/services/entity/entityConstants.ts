// Entity tunables + wild-food sets. Extracted from EntityService (P-4) so the spawning/AI/lifecycle
// modules and the shared helpers can all import one source of truth.
import { ticksFromSeconds } from '../../core/time';
import itemsData from '../../database/items.jsonc';
import { resourceObjectService } from '../ResourceObjectService';

export const SPAWN_CHECK_INTERVAL = ticksFromSeconds(20); // roll for a spawn every 20s
export const SPAWNS_PER_DAY = 2; // base pack spawns per in-game day (1–3 effective with night mult)
export const CHECKS_PER_DAY = (300 * 1) / 20; // TURNS_PER_DAY(300s) / 20s = 15 checks/day
export const BASE_SPAWN_CHANCE = SPAWNS_PER_DAY / CHECKS_PER_DAY; // per-check probability
export const NIGHT_SPAWN_MULT = 3; // ×multiplier when ambient light is low
export const NIGHT_THRESHOLD = 0.3; // ambient light below this counts as night
export const EDGE_BUFFER = 8; // tiles; no spawns within this band of the map edge
export const MIN_PAWN_DISTANCE = 12; // tiles; do not spawn packs on top of the colony
// Legacy flat caps — retained ONLY for the fixed-pack profiler/dev path (seedInitialEntities with an
// explicit pack count) so its benchmark population stays comparable. Normal play uses the
// area-scaled caps below.
export const MAX_HOSTILE = 40;
export const MAX_NEUTRAL = 40;

// ── Wild population scaling (area-based) ───────────────────────────────────────
// Wild population scales with map AREA rather than a fixed count. Tuned so a 500×500 map targets
// ~325 wild entities (≈10× the old fixed ~33). Clamped so tiny maps still feel alive and a huge
// 1000×1000 map doesn't melt the sim.
export const TARGET_ENTITIES_PER_TILE = 325 / (500 * 500); // ≈ 0.0013
export const MIN_TARGET_ENTITIES = 40;
export const MAX_TARGET_ENTITIES = 1400;

/** Target wild population for a map of `width`×`height`. */
export function targetEntityCount(width: number, height: number): number {
  const raw = Math.round(width * height * TARGET_ENTITIES_PER_TILE);
  return Math.max(MIN_TARGET_ENTITIES, Math.min(MAX_TARGET_ENTITIES, raw));
}

/**
 * Population ceilings for a map of this size. `total` bounds the whole wild population; the per-class
 * caps are loose guards (hostiles kept the minority) — with the roster cycled evenly during seeding,
 * the class mix follows the roster, not these caps.
 */
export function populationCaps(
  width: number,
  height: number
): { total: number; hostile: number; neutral: number } {
  const total = targetEntityCount(width, height);
  return { total, hostile: Math.ceil(total * 0.6), neutral: total };
}
export const CORPSE_DECAY_TICKS = ticksFromSeconds(200); // corpse persists ~200s then vanishes

// Movement / FSM timings
/** How long a startled animal freezes in place before it bolts into Fleeing. */
export const STARTLED_TICKS = ticksFromSeconds(1);
export const SAFE_RESET_TICKS = ticksFromSeconds(15);
// MAX_BLOCKED_TICKS now lives in MovementSystem (shared by the pawn + mob passes, MOVE-1).
export const FLEE_HEALTH_FRACTION = 0.2;

// ── Stamina (flee/exhaust pool) ────────────────────────────────────────────────
/** Stamina drained per second while an entity is actively fleeing. */
export const FLEE_STAMINA_DRAIN_PER_SECOND = 2.5;
// N-3: regen + the exit-from-Exhausted decision now live in the SHARED winded system
// (Combat.tickStaminaAndWinded regenerates stamina and clears `winded` at full); the mob FSM's
// Exhausted case just stands still until no longer winded. The bespoke EXHAUST_* constants are gone.

// ── Hunger / fatigue tunables ──────────────────────────────────────────────────
/** Hunger accrual per second for an omnivore at neutral condition. Halved so the whole
 *  starvation arc (hunger rise → collapse → death) spans ~a week of in-game time, not ~1 day. */
export const BASE_HUNGER_PER_SECOND = 0.27;
/** Fatigue accrual per second at neutral condition. */
export const BASE_FATIGUE_PER_SECOND = 0.32;
/** Malnutrition severity (0–1) at which an entity collapses into an immobile, incapacitated state —
 *  it stops fleeing/hunting/wandering and lies down until it dies (malnutrition reaching lethal
 *  severity, in entityLifecycle) or recovers. 0.65 = the "severe" life-threatening malnutrition stage
 *  (conditions.jsonc), so reaching it takes in-game DAYS of starving — NOT the old instant hunger≥80
 *  collapse that dropped a mob mid-hunt. Mob starvation now reuses the pawn malnutrition condition. */
export const STARVATION_COLLAPSE_SEVERITY = 0.65;
/** Hunger threshold at which an entity transitions to a feeding state. */
export const HUNGER_EAT_THRESHOLD = 50;
/** Hunger threshold at which a feeding entity considers itself sated. */
export const HUNGER_SATED_THRESHOLD = 10;
/** Tile radius searched for edible grass resources. */
export const FORAGE_RADIUS = 120;
/** Tile radius searched for prey (corpse or live animal). */
export const HUNT_RADIUS = 150;
/** Real-time duration to eat a grass tile (seconds). */
export const EAT_GRASS_SECONDS = 1.25;
/** Real-time duration to consume a corpse (seconds). */
export const EAT_CORPSE_SECONDS = 0.5;
/** Hunger restored when finishing a grass meal. */
export const EAT_GRASS_HUNGER_RESTORE = 40;
/** Hunger restored when finishing a corpse meal. */
export const EAT_CORPSE_HUNGER_RESTORE = 50;
/** Fraction of the corpse consumed per eating session (1/CORPSE_PORTION meals to strip). */
export const CORPSE_PORTION = 0.5;
/** Average wander-step decisions per second while grazing (idle fraction excluded). */
export const WANDER_MOVES_PER_SECOND = 1.0;
/** Cooldown after a failed hunt before the entity can re-enter Hunting state (seconds). */
export const HUNT_COOLDOWN_SECONDS = 60;
/** Cooldown after finding no reachable food tile before re-entering Foraging (seconds). Mirrors
 *  HUNT_COOLDOWN so a boxed-in forager backs off instead of oscillating Grazing/Wander↔Foraging. */
export const FORAGE_COOLDOWN_SECONDS = 30;
/** Give up a hunt that has dragged on this long without closing to attack range — stops the
 *  endless uncatchable chase (equal-speed predators) that thrashed the AI + log. */
export const HUNT_GIVE_UP_SECONDS = 25;
/** Fatigue level at which mobs enter sleep — set lower than pawn (60 vs 72) so animals
 * sleep more naturally and spend a realistic fraction of time resting. */
export const SLEEP_FATIGUE_THRESHOLD = 60;
/** Natural wake-up fatigue level — mirrors shouldPawnSleep: wake at 0 when fed, 30 when hunger ≥ 70. */
export function sleepWakeThreshold(hunger: number): number {
  return hunger >= 70 ? 30 : 0;
}
/** Fatigue recovered per second while sleeping. Kept low (2.0) so animals sleep for a
 * substantial portion of their time rather than snapping back to full immediately. */
export const SLEEP_RECOVERY_PER_SECOND = 2.0;
/** Hunger accrual rate multiplier while sleeping (mirrors pawn hungerRate=0.33 sleeping effect). */
export const SLEEP_HUNGER_RATE = 0.33;
/** Hunger ceiling above which a mob won't enter sleep (mirrors pawn shouldPawnSleep: hunger < 87). */
export const SLEEP_MAX_HUNGER = 87;
/** Hunger restored when a foraging entity finishes eating from a wild forage node (berries…). */
export const EAT_FORAGE_HUNGER_RESTORE = 45;

// ── Wild food discovery (data-driven) ─────────────────────────────────────────
/**
 * Map-tile food sources (not items, so not part of `CreatureDefinition.eats`):
 * - `grass`   — grazeable tiles (resourceObjectService `grazing: true`). Herbivore staple.
 * - `forage`  — wild forage nodes whose yield is in `eats` (e.g. category `food` → berries).
 */
export type TileFoodKind = 'grass' | 'forage';

/** Item ids that count as food (category food, or any positive nutrition). */
export const FOOD_ITEM_IDS = new Set(
  (itemsData as Array<{ id: string; category?: string; nutrition?: number }>)
    .filter((i) => i.category === 'food' || (i.nutrition ?? 0) > 0)
    .map((i) => i.id)
);
/** Resource ids whose forage interaction yields a food item (berry bushes, mushrooms…).
 *  Detected once from the resource + item databases so new edible forage auto-qualifies. */
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
