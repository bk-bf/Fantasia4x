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
export const MAX_HOSTILE = 40;
export const MAX_NEUTRAL = 40;
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
/** Stamina regenerated per second while exhausted (standing still). */
export const EXHAUST_STAMINA_REGEN_PER_SECOND = 3.0;
/** Stamina threshold to exit Exhausted and resume normal behaviour. */
export const EXHAUST_EXIT_STAMINA = 30;

// ── Hunger / fatigue tunables ──────────────────────────────────────────────────
/** Hunger accrual per second for an omnivore at neutral condition. Halved so the whole
 *  starvation arc (hunger rise → collapse → death) spans ~a week of in-game time, not ~1 day. */
export const BASE_HUNGER_PER_SECOND = 0.27;
/** Fatigue accrual per second at neutral condition. */
export const BASE_FATIGUE_PER_SECOND = 0.32;
/** HP drained per second once hunger reaches 100 (starving). Greatly reduced so a starving
 *  entity lingers (collapsed) for days rather than dying in under a minute. With ~50 HP this
 *  is ~28 in-game minutes-of-real-time → several in-game days from full hunger to death. */
export const STARVATION_DAMAGE_PER_SECOND = 0.03;
/** Hunger at which an entity collapses into an immobile, incapacitated state — it stops
 *  fleeing/hunting/wandering and simply lies starving until it dies or (rarely) is relieved. */
export const STARVATION_COLLAPSE_HUNGER = 80;
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
