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

// ── Lair lifecycle (ENTITIES_SPAWNING territory) ───────────────────────────────
/** Lair maintenance (repopulate emptied lairs, grow new ones) runs once per in-game day — a full-map
 *  lair scan amortised over the day is cheap. */
export const LAIR_TICK_INTERVAL = ticksFromSeconds(300);
/** Per-daily-check chance an EMPTIED (pack wiped) but un-destroyed lair re-occupies. ~12 days mean. */
export const LAIR_REPOP_CHANCE = 0.08;
/** Per-daily-check chance a NEW lair grows on an eligible grass/bush tile (toward the world cap). */
export const LAIR_GROW_CHANCE = 0.06;
/** World lair ceiling, area-scaled (~1 per 6000 tiles). Growth tops up toward this after lairs are
 *  destroyed — never beyond it; so the map's danger density self-heals to its intended level. */
export function maxLairCount(width: number, height: number): number {
  return Math.max(3, Math.min(60, Math.round((width * height) / 6000)));
}

/** Opening-game safety bubble around the colony start (the map centre — see `spawnPawnsOnMap`): no lair
 *  packs seed, repopulate, or grow within this radius for the first in-game month, so the player isn't
 *  boxed in by a den on the doorstep before they can arm up. Purely time-boxed — it lifts after, and the
 *  world fills in normally. */
export const STARTING_BUBBLE_RADIUS = 28; // tiles from the start tile (Euclidean)
export const STARTING_BUBBLE_TURNS = 30 * 300; // ~one in-game month (30 days × TURNS_PER_DAY=300)

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
  // Hostiles (entityClass 'mob' — goblins, gnolls, orcs, raiders…) capped to ~1/4 of the population
  // so the wilds stay survivable; the rest is prey/neutral wildlife. Tunable.
  return { total, hostile: Math.ceil(total * 0.25), neutral: total };
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

// Collapse thresholds (COLLAPSE_CONSCIOUSNESS / RECOVER_CONSCIOUSNESS) live in core/needs — the single
// shared band for pawns + mobs. The mob FSM (entityAI) imports them from there, not here.

/**
 * Soft territory leash (lair system). The hard leash pens a mob to `lairRange` of its lair, but a hard
 * cutoff makes a hunter OSCILLATE at the boundary — it spots prey just outside, lunges, gets yanked home,
 * re-spots, lunges… With overstretch the leash STRETCHES by this many tiles while the mob is actively
 * pursuing prey (Hunting/Attacking) or is critically hungry (survival > territory, like Fleeing/Exhausted
 * are exempt): it can chase past the boundary and commit to the kill, then — once the hunt ends and the
 * normal `lairRange` applies again — it's compelled back home. Bounds the stray so the map isn't a churn
 * of free-roaming packs.
 */
export const HUNT_OVERSTRETCH_TILES = 16;
/** Hunger at/above which a predator may overstretch its leash to range for food (desperation). */
export const HUNGER_OVERSTRETCH_THRESHOLD = 75;

/**
 * Whether a mob FINISHES OFF a downed (Collapsed) pawn instead of leaving it be. Only a hungry
 * carnivore/predator does — it's a meal. Everything else disengages and wanders off (a downed pawn is
 * no threat). Shared by the entity FSM (whether to keep engaging a collapsed pawn) and Combat (whether
 * to land the killing blow), so the two never disagree and strand a mob frozen beside the body.
 */
export function willFinishOffDowned(
  hunger: number,
  def: { predator?: boolean; diet?: string }
): boolean {
  return hunger >= HUNGER_EAT_THRESHOLD && (def.predator === true || def.diet === 'carnivore');
}
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
/**
 * §LOD — COMPLEXITY bubble (not a vision bubble — everything is rendered regardless of distance; this
 * gates THINKING, not drawing). Only mobs within this Chebyshev range (tiles) of a live pawn run the
 * full per-tick sim (FSM, A* pathfinding, hunger, combat). Outside it a mob just takes a cheap random
 * drift (backgroundDrift) — no behaviour modelled, since simulating believable off-screen behaviour
 * would be faking a sim that isn't running. THE primary scaling lever: stepOne/stepHunger run for the
 * handful near the colony, not all ~900 mobs. Wide enough that nearby visible animals act real; tunable.
 */
export const LIVE_RADIUS = 34;
/**
 * §LOD temporal throttle — OUTSIDE the complexity bubble a mob runs its full FSM DECISION (stepOne:
 * threat scan, state choice, A* re-path) + hunger only every Nth tick, STAGGERED by id so ~mobs/N think
 * per tick. Movement and combat still run EVERY tick (smooth), so this slows decisions, not motion —
 * imperceptible (no animal re-decides 60×/s). THE primary sim-cost lever now. Modular: raise N for more
 * savings at the cost of more decision latency; lower for snappier off-bubble AI.
 */
export const AI_THROTTLE_TICKS = 60; // ~1s at 60tps; also the elapsed-tick scale for off-bubble eating
/** §LOD — a throttled (off-bubble) mob thinks IMMEDIATELY anyway if a predator is within this many
 *  tiles (cheap per-tick interrupt via the cached threat map), so fleeing isn't delayed by up to
 *  AI_THROTTLE_TICKS. Small — only imminent danger justifies bypassing the throttle. */
export const THREAT_INTERRUPT_RANGE = 6;
/** Cooldown after a failed hunt before the entity can re-enter Hunting state (seconds). */
export const HUNT_COOLDOWN_SECONDS = 60;
/** Cooldown after finding no reachable food tile before re-entering Foraging (seconds). Mirrors
 *  HUNT_COOLDOWN so a boxed-in forager backs off instead of oscillating Grazing/Wander↔Foraging. */
export const FORAGE_COOLDOWN_SECONDS = 30;
/** An exhausted forager that hasn't landed a single bite in this long is stuck (e.g. its one reachable
 *  forage tile is permanently body-blocked by a packmate — kobold pack gridlock). It bails to sleep
 *  instead of grinding the spot forever, since the Foraging state otherwise has no fatigue exit. Well
 *  above a normal forage cycle (EAT_GRASS_SECONDS = 1.25s/bite + a short approach), so a mob that is
 *  actually eating — which resets stateSince every bite — never trips it. */
export const FEEDING_STUCK_SECONDS = 30;
/** Give up a hunt that has dragged on this long without closing to attack range — stops the
 *  endless uncatchable chase (equal-speed predators) that thrashed the AI + log. */
export const HUNT_GIVE_UP_SECONDS = 25;
/** Fatigue level at which mobs enter sleep — set lower than pawn (60 vs 72) so animals
 * sleep more naturally and spend a realistic fraction of time resting. */
export const SLEEP_FATIGUE_THRESHOLD = 60;
// The `tired` (Exhausted) badge threshold is now the single shared TIRED_FATIGUE_THRESHOLD in core/needs
// (100 — pawns + mobs agree). entityLifecycle imports it from there.
/** Weather exposure for creatures is HARDIER than pawns (fur/hide/instinct) and runs on a slow cadence
 *  (cost: there can be 100+ mobs). `windchilled` only bites a creature in stronger wind than a pawn
 *  (onset 0.45 vs 0.2). `wet` onsets at a FULL meter (100) for EVERY entity — susceptibility is the
 *  fill rate (the `wetness_resistance` stat, CON-based), NOT a different threshold (so no MOB_WET_THRESHOLD). */
export const MOB_WEATHER_INTERVAL = 120; // ticks (~2 in-game s) between creature weather-exposure passes
export const MOB_WIND_ONSET = 0.45; // effective wind a creature shrugs off before feeling windchill
/** Natural wake-up fatigue level — mirrors shouldPawnSleep: wake at 0 when fed, 30 when hunger ≥ 70. */
export function sleepWakeThreshold(hunger: number): number {
  return hunger >= 70 ? 30 : 0;
}
/** Fatigue recovered per second while sleeping. Kept low (2.0) so animals sleep for a
 * substantial portion of their time rather than snapping back to full immediately. */
export const SLEEP_RECOVERY_PER_SECOND = 2.0;
// The sleeping/eating hunger-rate now comes straight from the conditions.jsonc `sleeping`/`eating`
// modifiers (transientNeedMultipliers), shared with pawns — no hardcoded SLEEP_HUNGER_RATE here.
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
