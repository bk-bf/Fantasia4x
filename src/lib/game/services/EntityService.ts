import type {
  GameState,
  Mob,
  MobState,
  Pawn,
  EntityStats,
  EntityNeeds,
  EntityCondition,
  LimbState,
  DroppedItem
} from '../core/types';
import { CREATURES, getCreatureById, type CreatureDefinition } from '../core/Creatures';
import { getAmbientLight } from './EnvironmentService';
import { ticksFromSeconds, SECONDS_PER_TICK, perTick } from '../core/time';
import { conditionNeedMultipliers } from '../core/needs';
import { advanceAlongPath } from '../systems/MovementSystem';
import { resourceObjectService } from './ResourceObjectService';
import itemsData from '../database/items.jsonc';
import { absorbDropIfOnStockpileTile } from '../core/GameState';
import { wasmPathfinderService } from './WasmPathfinderService';
import { buildPathfindingGridsWithBlocked } from './PathfinderService';
import { occupancyService } from './OccupancyService';
import { calcMaxStamina, calcMaxBloodVolume } from '../entities/Pawns';
import { pawnStatService } from './PawnStatService';
import { createDefaultBodyParts } from '../systems/Combat';
import { gameLogger } from '../dev/gameLogger';
import { logHuntStart, logFlee, logEntityStateChange, logEntityDeath } from '../../stores/Log';
import { rng } from '../core/rng';

/**
 * EntityService — ENTITIES_SPAWNING spec, Phase A.
 *
 * Owns the lifecycle of live map entities (hostile mobs + neutral animals):
 *   • spawnEntities — DF-style periodic spawning, biome-weighted, capped
 *   • stepEntities  — advances each entity's FSM and movement one tick
 *   • removeDead    — clears corpses past their decay window
 *
 * Rosters are DB-driven (core/Creatures.ts ← database/creatures.jsonc). No
 * creature is hardcoded here. Combat resolution is deferred to COMBAT-SYSTEM;
 * in Phase A an `Attacking` mob simply holds position next to its target.
 */

// ── Tunables (authored in in-game seconds via ticksFromSeconds) ────────────────
const SPAWN_CHECK_INTERVAL = ticksFromSeconds(20); // roll for a spawn every 20s
const SPAWNS_PER_DAY = 2; // base pack spawns per in-game day (1–3 effective with night mult)
const CHECKS_PER_DAY = (300 * 1) / 20; // TURNS_PER_DAY(300s) / 20s = 15 checks/day
const BASE_SPAWN_CHANCE = SPAWNS_PER_DAY / CHECKS_PER_DAY; // per-check probability
const NIGHT_SPAWN_MULT = 3; // ×multiplier when ambient light is low
const NIGHT_THRESHOLD = 0.3; // ambient light below this counts as night
const EDGE_BUFFER = 8; // tiles; no spawns within this band of the map edge
const MIN_PAWN_DISTANCE = 12; // tiles; do not spawn packs on top of the colony
const MAX_HOSTILE = 40;
const MAX_NEUTRAL = 40;
const CORPSE_DECAY_TICKS = ticksFromSeconds(200); // corpse persists ~200s then vanishes

// Movement / FSM timings
/** How long a startled animal freezes in place before it bolts into Fleeing. */
const STARTLED_TICKS = ticksFromSeconds(1);
const SAFE_RESET_TICKS = ticksFromSeconds(15);
/** Ticks a mob may wait behind a blocking body before dropping its path to re-route. */
const MAX_BLOCKED_TICKS = ticksFromSeconds(1.5);
const FLEE_HEALTH_FRACTION = 0.2;

// ── Stamina (flee/exhaust pool) ────────────────────────────────────────────────
/** Stamina drained per second while an entity is actively fleeing. */
const FLEE_STAMINA_DRAIN_PER_SECOND = 2.5;
/** Stamina regenerated per second while exhausted (standing still). */
const EXHAUST_STAMINA_REGEN_PER_SECOND = 3.0;
/** Stamina threshold to exit Exhausted and resume normal behaviour. */
const EXHAUST_EXIT_STAMINA = 30;

// ── Hunger / fatigue tunables ──────────────────────────────────────────────────
/** Hunger accrual per second for an omnivore at neutral condition. Halved so the whole
 *  starvation arc (hunger rise → collapse → death) spans ~a week of in-game time, not ~1 day. */
const BASE_HUNGER_PER_SECOND = 0.27;
/** Fatigue accrual per second at neutral condition. */
const BASE_FATIGUE_PER_SECOND = 0.32;
/** HP drained per second once hunger reaches 100 (starving). Greatly reduced so a starving
 *  entity lingers (collapsed) for days rather than dying in under a minute. With ~50 HP this
 *  is ~28 in-game minutes-of-real-time → several in-game days from full hunger to death. */
const STARVATION_DAMAGE_PER_SECOND = 0.03;
/** Hunger at which an entity collapses into an immobile, incapacitated state — it stops
 *  fleeing/hunting/wandering and simply lies starving until it dies or (rarely) is relieved. */
const STARVATION_COLLAPSE_HUNGER = 80;
/** Hunger threshold at which an entity transitions to a feeding state. */
const HUNGER_EAT_THRESHOLD = 50;
/** Hunger threshold at which a feeding entity considers itself sated. */
const HUNGER_SATED_THRESHOLD = 10;
/** Tile radius searched for edible grass resources. */
const FORAGE_RADIUS = 120;
/** Tile radius searched for prey (corpse or live animal). */
const HUNT_RADIUS = 150;
/** Real-time duration to eat a grass tile (seconds). */
const EAT_GRASS_SECONDS = 1.25;
/** Real-time duration to consume a corpse (seconds). */
const EAT_CORPSE_SECONDS = 0.5;
/** Hunger restored when finishing a grass meal. */
const EAT_GRASS_HUNGER_RESTORE = 40;
/** Hunger restored when finishing a corpse meal. */
const EAT_CORPSE_HUNGER_RESTORE = 50;
/** Fraction of the corpse consumed per eating session (1/CORPSE_PORTION meals to strip). */
const CORPSE_PORTION = 0.5;
/** Average wander-step decisions per second while grazing (idle fraction excluded). */
const WANDER_MOVES_PER_SECOND = 1.0;
/** Cooldown after a failed hunt before the entity can re-enter Hunting state (seconds). */
const HUNT_COOLDOWN_SECONDS = 60;
/** Give up a hunt that has dragged on this long without closing to attack range — stops the
 *  endless uncatchable chase (equal-speed predators) that thrashed the AI + log. */
const HUNT_GIVE_UP_SECONDS = 25;
/** Fatigue level at which mobs enter sleep — set lower than pawn (60 vs 72) so animals
 * sleep more naturally and spend a realistic fraction of time resting. */
const SLEEP_FATIGUE_THRESHOLD = 60;
/** Natural wake-up fatigue level — mirrors shouldPawnSleep: wake at 0 when fed, 30 when hunger ≥ 70. */
function sleepWakeThreshold(hunger: number): number {
  return hunger >= 70 ? 30 : 0;
}
/** Fatigue recovered per second while sleeping. Kept low (2.0) so animals sleep for a
 * substantial portion of their time rather than snapping back to full immediately. */
const SLEEP_RECOVERY_PER_SECOND = 2.0;
/** Hunger accrual rate multiplier while sleeping (mirrors pawn hungerRate=0.33 sleeping effect). */
const SLEEP_HUNGER_RATE = 0.33;
/** Hunger ceiling above which a mob won't enter sleep (mirrors pawn shouldPawnSleep: hunger < 87). */
const SLEEP_MAX_HUNGER = 87;
/** Hunger restored when a foraging entity finishes eating from a wild forage node (berries…). */
const EAT_FORAGE_HUNGER_RESTORE = 45;

// ── Wild food discovery (data-driven) ─────────────────────────────────────────
/**
 * Map-tile food sources (not items, so not part of `CreatureDefinition.eats`):
 * - `grass`   — grazeable tiles (resourceObjectService `grazing: true`). Herbivore staple.
 * - `forage`  — wild forage nodes whose yield is in `eats` (e.g. category `food` → berries).
 */
type TileFoodKind = 'grass' | 'forage';

/** Item ids that count as food (category food, or any positive nutrition). */
const FOOD_ITEM_IDS = new Set(
  (itemsData as Array<{ id: string; category?: string; nutrition?: number }>)
    .filter((i) => i.category === 'food' || (i.nutrition ?? 0) > 0)
    .map((i) => i.id)
);
/** Resource ids whose forage interaction yields a food item (berry bushes, mushrooms…).
 *  Detected once from the resource + item databases so new edible forage auto-qualifies. */
const WILD_FORAGE_RESOURCE_IDS = new Set(
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

class EntityServiceImpl {
  private idCounter = 0;

  // ===== INITIAL SEEDING =========================================================

  /**
   * Populate a freshly generated / loaded world with a starting population so
   * entities are visible on the map immediately, without waiting for the slow
   * periodic spawner. Skips `nightOnly` creatures (they appear after dusk via
   * the regular spawner). Ignored if the world already has live entities.
   */
  seedInitialEntities(state: GameState, packs = 10): GameState {
    if ((state.mobs?.length ?? 0) > 0) return state;
    const dayCreatures = CREATURES.filter((c) => !c.nightOnly);
    if (dayCreatures.length === 0) return state;

    const seeded: Mob[] = [];
    let hostile = 0;
    let neutral = 0;

    // Guarantee variety: attempt one pack of EACH distinct day creature first (shuffled),
    // then fill any remaining slots at random. Without this, the seeded RNG could pick the
    // same few creatures every time, so a species like wolf would "never spawn anymore".
    const shuffled = [...dayCreatures].sort(() => rng.random() - 0.5);
    const picks: CreatureDefinition[] = shuffled.slice(0, packs);
    while (picks.length < packs) {
      picks.push(dayCreatures[Math.floor(rng.random() * dayCreatures.length)]);
    }

    for (const def of picks) {
      if (def.entityClass === 'mob' && hostile >= MAX_HOSTILE) continue;
      if (def.entityClass === 'animal' && neutral >= MAX_NEUTRAL) continue;

      const origin = this.findSpawnTile(state, def);
      if (!origin) continue;

      const [packMin, packMax] = def.pack;
      const packSize = packMin + Math.floor(rng.random() * (packMax - packMin + 1));
      for (let i = 0; i < packSize; i++) {
        const tile =
          i === 0 ? origin : (this.findNearbyWalkable(state, origin.x, origin.y) ?? origin);
        seeded.push(this.makeMob(def, tile.x, tile.y, state.turn));
        if (def.entityClass === 'mob') hostile++;
        else neutral++;
      }
    }

    return { ...state, mobs: [...(state.mobs ?? []), ...seeded] };
  }

  // ===== SPAWNING =================================================================

  spawnEntities(state: GameState): GameState {
    // Only roll on the spawn-check cadence to keep per-tick cost ~zero.
    if (state.turn % SPAWN_CHECK_INTERVAL !== 0) return state;

    const mobs = state.mobs ?? [];
    const isNight = getAmbientLight(state.turn) < NIGHT_THRESHOLD;
    const chance = BASE_SPAWN_CHANCE * (isNight ? NIGHT_SPAWN_MULT : 1);
    if (rng.random() > chance) return state;

    const hostileCount = mobs.filter((m) => m.entityClass === 'mob' && m.state !== 'Corpse').length;
    const neutralCount = mobs.filter(
      (m) => m.entityClass === 'animal' && m.state !== 'Corpse'
    ).length;

    const def = this.pickSpawnCreature(isNight);
    if (!def) return state;
    if (def.entityClass === 'mob' && hostileCount >= MAX_HOSTILE) return state;
    if (def.entityClass === 'animal' && neutralCount >= MAX_NEUTRAL) return state;

    const origin = this.findSpawnTile(state, def);
    if (!origin) return state;

    const [packMin, packMax] = def.pack;
    const packSize = packMin + Math.floor(rng.random() * (packMax - packMin + 1));
    const newMobs: Mob[] = [];
    for (let i = 0; i < packSize; i++) {
      const tile =
        i === 0 ? origin : (this.findNearbyWalkable(state, origin.x, origin.y) ?? origin);
      newMobs.push(this.makeMob(def, tile.x, tile.y, state.turn));
    }

    return { ...state, mobs: [...mobs, ...newMobs] };
  }

  private pickSpawnCreature(isNight: boolean): CreatureDefinition | undefined {
    const pool = CREATURES.filter((c) => !c.nightOnly || isNight);
    if (pool.length === 0) return undefined;
    return pool[Math.floor(rng.random() * pool.length)];
  }

  private findSpawnTile(
    state: GameState,
    def: CreatureDefinition
  ): { x: number; y: number } | null {
    const map = state.worldMap;
    const h = map.length;
    const w = map[0]?.length ?? 0;
    if (w === 0 || h === 0) return null;

    const pawnPositions = state.pawns.filter((p) => p.position).map((p) => p.position!);

    for (let attempt = 0; attempt < 40; attempt++) {
      const x = EDGE_BUFFER + Math.floor(rng.random() * (w - 2 * EDGE_BUFFER));
      const y = EDGE_BUFFER + Math.floor(rng.random() * (h - 2 * EDGE_BUFFER));
      const tile = map[y]?.[x];
      if (!tile || !tile.walkable) continue;

      const weight = def.biomeWeights[tile.terrainType] ?? 0;
      if (weight <= 0) continue;
      // Probabilistic accept by biome weight (max weight 1.2 → clamp).
      if (rng.random() > Math.min(1, weight)) continue;

      // Keep spawns away from the colony.
      const tooClose = pawnPositions.some(
        (p) => Math.abs(p.x - x) < MIN_PAWN_DISTANCE && Math.abs(p.y - y) < MIN_PAWN_DISTANCE
      );
      if (tooClose) continue;

      return { x, y };
    }
    return null;
  }

  private makeMob(def: CreatureDefinition, x: number, y: number, turn: number): Mob {
    const initialState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
    const sizeClass: 'large' | 'medium' | 'small' =
      def.stats.str >= 14 ? 'large' : def.stats.str >= 6 ? 'medium' : 'small';
    const stats: EntityStats = {
      strength: def.stats.str,
      dexterity: def.stats.dex,
      perception: def.stats.per,
      constitution: def.stats.con,
      intelligence: def.behaviour === 'passive' ? 4 : 8,
      charisma: 5
    };
    const needs: EntityNeeds = {
      hunger: 0,
      fatigue: 0,
      sleep: 0,
      lastSleep: turn,
      lastMeal: turn
    };
    return {
      id: `mob-${def.id}-${turn}-${this.idCounter}`,
      debugId: this.idCounter++,
      creatureId: def.id,
      entityClass: def.entityClass,
      x,
      y,
      health: def.stats.health,
      maxHealth: def.stats.health,
      state: initialState,
      homeX: x,
      homeY: y,
      stateSince: turn,
      path: [],
      pathIndex: 0,
      needs,
      conditions: [],
      stats,
      // ── Full health/survival parity with Pawn ────────────────────────────────────────
      bloodVolume: def.stats.health,
      maxBloodVolume: def.stats.health,
      isAlive: true,
      activeEffects: [],
      skills: {},
      stamina: calcMaxStamina(stats),
      maxStamina: calcMaxStamina(stats),
      limbs: [
        {
          id: 'head',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('head')
        },
        {
          id: 'torso',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('torso')
        },
        {
          id: 'left_arm',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('left_arm')
        },
        {
          id: 'right_arm',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('right_arm')
        },
        {
          id: 'left_leg',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('left_leg')
        },
        {
          id: 'right_leg',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: createDefaultBodyParts('right_leg')
        }
      ],
      // ── Combat & stat parity with Pawn ───────────────────────────────────────────
      // CreatureDefinition has no explicit size; derive a size class from strength
      // (bear str 22 → large, wolf 12 → medium, rabbit 1 → small).
      physicalTraits: {
        height: sizeClass === 'large' ? 180 : sizeClass === 'medium' ? 140 : 80,
        weight: sizeClass === 'large' ? 90 : sizeClass === 'medium' ? 50 : 20,
        size: sizeClass
      },
      injuries: [],
      pain: 0,
      aggroRange: def.behaviour === 'aggressive' ? 8 : 3,
      attackCooldown: 0,
      statusEffectDurations: {}
    };
  }

  // ===== STEPPING ================================================================

  stepEntities(state: GameState): GameState {
    const mobs = state.mobs;
    if (!mobs || mobs.length === 0) return state;

    const livePawns = state.pawns.filter((p) => p.position && p.isAlive !== false);
    // Accumulates entity-vs-entity damage dealt this tick (hunting mini-combat).
    const pendingDamage = new Map<string, number>();
    // Accumulates meat consumed from corpses this tick (corpseId → fraction eaten).
    const pendingMeatConsumption = new Map<string, number>();
    // Accumulates grass-tile depletions from foraging animals this tick.
    const pendingTileDepletion: Array<{ x: number; y: number; id: string }> = [];
    // Accumulates mob state changes triggered by other mobs (e.g. prey forced into Attacking).
    const pendingMobState = new Map<string, Partial<Mob>>();
    let changed = false;
    const next: Mob[] = new Array(mobs.length);

    for (let i = 0; i < mobs.length; i++) {
      const mob = mobs[i];
      if (mob.state === 'Corpse') {
        next[i] = mob;
        continue;
      }
      const def = getCreatureById(mob.creatureId);
      if (!def) {
        next[i] = mob;
        continue;
      }
      const stepped = this.stepOne(
        mob,
        def,
        livePawns,
        mobs,
        state,
        pendingDamage,
        pendingMeatConsumption,
        pendingTileDepletion,
        pendingMobState
      );
      const ticked = this.tickMobStatusEffectDurations(stepped);
      next[i] = ticked;
      if (ticked !== mob) changed = true;
    }

    // Apply pending mob state changes (e.g. prey forced into Attacking by hunter).
    if (pendingMobState.size > 0) {
      changed = true;
      for (let i = 0; i < next.length; i++) {
        const updates = pendingMobState.get(next[i].id);
        if (!updates) continue;
        next[i] = { ...next[i], ...updates };
      }
    }

    // Apply corpse meat consumption accumulated this tick.
    if (pendingMeatConsumption.size > 0) {
      changed = true;
      for (let i = 0; i < next.length; i++) {
        const consumed = pendingMeatConsumption.get(next[i].id);
        if (!consumed || next[i].state !== 'Corpse') continue;
        const newMeatLeft = Math.max(0, (next[i].intactness ?? 1.0) - consumed);
        next[i] = { ...next[i], intactness: newMeatLeft };
      }
    }

    // Apply accumulated hunting damage after all mob steps.
    if (pendingDamage.size > 0) {
      changed = true;
      for (let i = 0; i < next.length; i++) {
        const dmg = pendingDamage.get(next[i].id);
        if (!dmg || dmg <= 0) continue;
        let m = next[i];
        const newHealth = Math.max(0, m.health - dmg);

        // Distribute damage to a random non-missing body-part limb,
        // causing proportional bleeding. Head/torso dealt half damage
        // to avoid trivial instakills from light attacks.
        let limbs = m.limbs ? [...m.limbs] : undefined;
        if (limbs) {
          const candidates = limbs.filter(
            (l) => !l.isMissing && l.id !== 'head' && l.id !== 'torso'
          );
          if (candidates.length > 0) {
            const hit = candidates[Math.floor(rng.random() * candidates.length)];
            const hitIdx = limbs.findIndex((l) => l.id === hit.id);
            const limbDmg = dmg * 0.5;
            const newLimbHealth = Math.max(0, hit.health - limbDmg);
            // Bleed rate scales with damage severity on that limb.
            const bleedRate = newLimbHealth < 60 ? (60 - newLimbHealth) * 0.4 : 0;
            limbs[hitIdx] = { ...hit, health: newLimbHealth, bleedRate };
          }
        }

        next[i] = { ...m, health: newHealth, limbs };
      }
    }

    let finalState = changed ? { ...state, mobs: next } : state;

    // Apply foraging tile depletions immutably after the mob loop.
    if (pendingTileDepletion.length > 0) {
      let worldMap = finalState.worldMap;
      for (const { x, y, id } of pendingTileDepletion) {
        const tile = worldMap[y]?.[x];
        if (!tile) continue;
        const current = tile.resources?.[id] ?? 0;
        if (current <= 0) continue;
        const newAmount = Math.max(0, current - 1);
        const newTile = { ...tile, resources: { ...tile.resources, [id]: newAmount } };
        worldMap = worldMap.map((row, ry) =>
          ry === y ? row.map((col, rx) => (rx === x ? newTile : col)) : row
        );
      }
      finalState = { ...finalState, worldMap };
    }

    return finalState;
  }

  private stepOne(
    mob: Mob,
    def: CreatureDefinition,
    pawns: Pawn[],
    allMobs: Mob[],
    state: GameState,
    pendingDamage: Map<string, number>,
    pendingMeatConsumption: Map<string, number>,
    pendingTileDepletion: Array<{ x: number; y: number; id: string }>,
    pendingMobState: Map<string, Partial<Mob>>
  ): Mob {
    // FSM runs every tick. Movement advancement is handled separately by
    // advanceMobMovement(), which uses the shared MovementSystem path engine.
    const turn = state.turn;

    // Periodic entity-state snapshot — every 300 turns (~5 s at 60 tps).
    if (turn % 300 === 0) {
      const pathLen = mob.path?.length ?? 0;
      const pathIdx = mob.pathIndex ?? 0;
      gameLogger.log(
        turn,
        'ENTITY-STATE',
        `${def.id}#${mob.id.slice(-6)} state=${mob.state} pos=(${mob.x},${mob.y})` +
          ` hunger=${mob.needs.hunger.toFixed(1)} fatigue=${mob.needs.fatigue.toFixed(1)}` +
          ` path=${pathLen > 0 ? `${pathIdx}/${pathLen} end=(${mob.path![pathLen - 1].x},${mob.path![pathLen - 1].y})` : 'none'}` +
          (mob.huntTargetId ? ` prey=${mob.huntTargetId.slice(-6)}` : '')
      );
    }

    // Starvation collapse: once hunger passes the collapse threshold the entity is
    // incapacitated — it does NOT flee, hunt, or wander. It lies in place (path cleared)
    // and slowly dies. This replaces the old behaviour where starvation HP-drain dropped
    // health below the flee threshold and the entity confusingly "started fleeing".
    if (mob.needs.hunger >= STARVATION_COLLAPSE_HUNGER) {
      if (mob.state === 'Collapsed') return mob;
      logEntityStateChange(
        mob.id,
        this.entityName(mob),
        mob.state,
        'Collapsed',
        turn,
        mob.x,
        mob.y
      );
      return {
        ...mob,
        state: 'Collapsed',
        stateSince: turn,
        path: [],
        huntTargetId: undefined,
        eatProgress: undefined
      };
    }
    // Recovered (e.g. fed): leave the collapsed state and resume normal behaviour.
    if (mob.state === 'Collapsed') {
      return { ...mob, state: 'Wander', stateSince: turn };
    }

    const nearest = this.nearestPawn(mob, pawns);
    const inVision =
      nearest && this.dist(mob, nearest.pos) <= def.stats.visionRange ? nearest : null;
    const isNight = getAmbientLight(turn) < NIGHT_THRESHOLD;

    // Passive creatures (herbivores, timid omnivores) use the prey FSM.
    // Neutral/aggressive creatures with fight potential use the hostile FSM.
    if (def.behaviour === 'passive') {
      return this.stepAnimal(
        mob,
        def,
        inVision,
        nearest,
        turn,
        state,
        allMobs,
        pendingDamage,
        pendingMeatConsumption,
        pendingTileDepletion,
        pendingMobState
      );
    }
    return this.stepHostile(
      mob,
      def,
      inVision,
      nearest,
      isNight,
      turn,
      state,
      allMobs,
      pendingDamage,
      pendingMeatConsumption,
      pendingTileDepletion,
      pendingMobState
    );
  }

  private entityName(mob: Mob): string {
    const def = getCreatureById(mob.creatureId);
    return def ? `${def.name} #${mob.debugId ?? mob.id.slice(-4)}` : mob.id.slice(-6);
  }

  /** Decrement temporary status effect durations and remove expired ones from activeEffects. */
  private tickMobStatusEffectDurations(mob: Mob): Mob {
    const durations = mob.statusEffectDurations;
    if (!durations || Object.keys(durations).length === 0) return mob;
    const next: Record<string, number> = {};
    for (const [key, val] of Object.entries(durations)) {
      const remaining = val - 1;
      if (remaining > 0) next[key] = remaining;
    }
    const changed =
      Object.keys(next).length !== Object.keys(durations).length ||
      Object.entries(next).some(([k, v]) => v !== durations[k]);
    if (!changed) return mob;
    const activeEffects = (mob.activeEffects ?? []).filter((e) => next[e] !== undefined);
    return { ...mob, statusEffectDurations: next, activeEffects };
  }

  private stepHostile(
    mob: Mob,
    def: CreatureDefinition,
    inVision: { pos: { x: number; y: number } } | null,
    nearest: { pos: { x: number; y: number } } | null,
    isNight: boolean,
    turn: number,
    state: GameState,
    allMobs: Mob[],
    pendingDamage: Map<string, number>,
    pendingMeatConsumption: Map<string, number>,
    pendingTileDepletion: Array<{ x: number; y: number; id: string }>,
    pendingMobState: Map<string, Partial<Mob>>
  ): Mob {
    // nocturnalAggro promotes neutral → aggressive at night; otherwise use the data value.
    const effectiveBehaviour = def.nocturnalAggro && isNight ? 'aggressive' : def.behaviour;
    const aggressive = effectiveBehaviour === 'aggressive';

    // Wounded entities flee regardless of state.
    if (mob.health <= mob.maxHealth * FLEE_HEALTH_FRACTION && mob.state !== 'Fleeing') {
      const threat =
        inVision ?? (def.huntable ? this.nearestPredatorThreat(mob, def, allMobs) : null);
      const threatName = threat
        ? (state.pawns.find(
            (p) =>
              p.position &&
              Math.abs(p.position.x - mob.x) <= 1 &&
              Math.abs(p.position.y - mob.y) <= 1
          )?.name ?? 'predator')
        : undefined;
      logFlee(
        mob.id,
        this.entityName(mob),
        threat ? 'threat' : undefined,
        threatName,
        turn,
        mob.x,
        mob.y
      );
      return {
        ...mob,
        state: 'Fleeing',
        stateSince: turn,
        eatProgress: undefined,
        huntTargetId: undefined,
        path: []
      };
    }

    // Huntable neutral animals (boar, elk, etc.) also react to predators and pack deaths.
    // They flee from flagged predators just like passive animals do, and panic when
    // they see a corpse of the same species within vision range.
    if (def.huntable && mob.state !== 'Fleeing' && mob.state !== 'Attacking') {
      const predThreat = this.nearestPredatorThreat(mob, def, allMobs);
      if (predThreat) {
        return {
          ...mob,
          state: 'Fleeing',
          stateSince: turn,
          eatProgress: undefined,
          huntTargetId: undefined,
          path: []
        };
      }
      // Corpse alarm: visible pack-mate corpse triggers panic flight.
      const packCorpse = allMobs.find(
        (m) =>
          m.state === 'Corpse' &&
          m.creatureId === mob.creatureId &&
          this.dist(mob, { x: m.x, y: m.y }) <= def.stats.visionRange
      );
      if (packCorpse) {
        return {
          ...mob,
          state: 'Fleeing',
          stateSince: turn,
          eatProgress: undefined,
          huntTargetId: undefined,
          path: []
        };
      }
    }

    // ── Hunger-driven FSM ───────────────────────────────────────────
    // Aggressive mobs prioritise attacking pawns over feeding.
    // Non-aggressive (passive/neutral) hostile mobs will hunt when hungry.
    // Hunger check runs BEFORE sleep so mobs eat before resting.
    // Predators (incl. omnivore predators like goblins/bears) hunt prey & corpses —
    // previously only strict carnivores could, so omnivore predators just starved.
    const canHunt = def.predator || def.diet === 'carnivore';
    if (mob.state === 'Hunting' || mob.state === 'Eating' || mob.state === 'Foraging') {
      // Snap back to aggro if a pawn enters vision while aggressive.
      if (inVision && aggressive) {
        return {
          ...mob,
          state: 'Alerted',
          stateSince: turn,
          eatProgress: undefined,
          huntTargetId: undefined
        };
      }
      if (mob.needs.hunger <= HUNGER_SATED_THRESHOLD) {
        return {
          ...mob,
          state: 'Wander',
          stateSince: turn,
          eatProgress: undefined,
          huntTargetId: undefined
        };
      }
      // Foraging (and grazing-style Eating with no hunt target) routes to the forage
      // stepper; corpse-eating (huntTargetId set) and Hunting route to the hunt stepper.
      if (mob.state === 'Foraging' || (mob.state === 'Eating' && !mob.huntTargetId)) {
        return this.stepForaging(mob, def, turn, state, pendingTileDepletion);
      }
      return this.stepHunting(
        mob,
        def,
        turn,
        state,
        allMobs,
        pendingDamage,
        pendingMeatConsumption,
        pendingMobState
      );
    }
    if (
      !inVision &&
      mob.needs.hunger >= HUNGER_EAT_THRESHOLD &&
      mob.state !== 'Fleeing' &&
      mob.state !== 'Sleeping'
      // (Hunting/Eating/Foraging already excluded by the early-return guard above)
    ) {
      // Forage real food (and graze, for herbivores) first; fall back to hunting live
      // prey or scavenging a corpse only if nothing forageable is in range. A creature
      // can scavenge (`eats` includes meat/organic) without being a hunter — only
      // `predator`/`carnivore` mobs will go after LIVE prey.
      const tileKinds = new Set<TileFoodKind>();
      if (def.grazes) tileKinds.add('grass');
      if (def.eats.includes('food')) tileKinds.add('forage');
      const canForage = tileKinds.size > 0;
      const canScavengeOrHunt =
        canHunt || def.eats.includes('meat') || def.eats.includes('organic');
      const forageReachable = () =>
        canForage &&
        this.findNearestFoodTile(state, mob.x, mob.y, FORAGE_RADIUS, tileKinds) !== null;
      const tryHunt = (): Mob | null => {
        if (!canScavengeOrHunt) return null;
        const prey = this.findNearestPrey(mob, allMobs, canHunt);
        if (!prey) return null;
        const preyDef = getCreatureById(prey.creatureId);
        const preyName = preyDef
          ? `${preyDef.name} #${prey.debugId ?? prey.id.slice(-4)}`
          : prey.id.slice(-6);
        logHuntStart(mob.id, this.entityName(mob), prey.id, preyName, turn, mob.x, mob.y);
        return { ...mob, state: 'Hunting', stateSince: turn, path: [] };
      };

      if (forageReachable()) return { ...mob, state: 'Foraging', stateSince: turn, path: [] };
      const hunted = tryHunt();
      if (hunted) return hunted;
    }

    // ── Fatigue-driven sleep (safe, no pawn in vision, not hungry) ──────────
    if (
      !inVision &&
      mob.needs.fatigue >= SLEEP_FATIGUE_THRESHOLD &&
      mob.needs.hunger < SLEEP_MAX_HUNGER &&
      mob.state !== 'Sleeping' &&
      mob.state !== 'Fleeing' &&
      mob.state !== 'Alerted' &&
      mob.state !== 'Attacking'
    ) {
      return { ...mob, state: 'Sleeping', stateSince: turn, path: [] };
    }

    switch (mob.state) {
      case 'Wander': {
        // Aggressive creatures attack on full sight range.
        // Neutral creatures are territorial: defend personal space when a pawn
        // steps within half their vision range (e.g. bears charge if approached).
        const tooClose =
          !aggressive &&
          inVision &&
          this.dist(mob, inVision.pos) <= Math.ceil(def.stats.visionRange * 0.5);
        if (inVision && (aggressive || tooClose)) {
          return this.moveToward(
            { ...mob, state: 'Alerted', stateSince: turn },
            inVision.pos,
            state
          );
        }
        return this.wanderStep(mob, def, state);
      }
      case 'Alerted': {
        if (!nearest || this.dist(mob, nearest.pos) > def.stats.visionRange * 1.5) {
          return { ...mob, state: 'Wander', stateSince: turn };
        }
        if (this.adjacent(mob, nearest.pos)) {
          // Engagement logging is owned by combatService (one Chronicle entry per
          // engagement, opened on the first resolved swing) — the FSM only holds state.
          return { ...mob, state: 'Attacking', stateSince: turn };
        }
        return this.moveToward(mob, nearest.pos, state);
      }
      case 'Attacking': {
        // COMBAT-SYSTEM owns damage resolution.
        // combatService.tickCombat() (called from GameEngineImpl after entityStep)
        // resolves hits for all mobs in Attacking state. The FSM only holds position.
        if (!nearest || !this.adjacent(mob, nearest.pos)) {
          return { ...mob, state: 'Alerted', stateSince: turn };
        }
        return mob;
      }
      case 'Fleeing': {
        // For huntable neutral animals, also flee from nearby predators.
        const predThreat = def.huntable ? this.nearestPredatorThreat(mob, def, allMobs) : null;
        const pawnDist = nearest ? this.dist(mob, nearest.pos) : Infinity;
        const predDist = predThreat ? this.dist(mob, predThreat.pos) : Infinity;
        const closestDist = Math.min(pawnDist, predDist);
        // Stop fleeing if threat is gone or after a safety timeout.
        if (closestDist > def.stats.fleeRange || turn - mob.stateSince > SAFE_RESET_TICKS) {
          return { ...mob, state: 'Wander', stateSince: turn };
        }
        // Drain stamina while fleeing; transition to Exhausted when empty.
        const curStamina = mob.stamina ?? mob.maxStamina ?? calcMaxStamina(mob.stats);
        const drainedStamina = curStamina - FLEE_STAMINA_DRAIN_PER_SECOND * SECONDS_PER_TICK;
        if (drainedStamina <= 0) {
          return { ...mob, state: 'Exhausted', stateSince: turn, stamina: 0, path: [] };
        }
        // Always move away whenever the threat is still within flee range.
        const fleeTarget = pawnDist <= predDist ? nearest : predThreat;
        if (fleeTarget)
          return { ...this.moveAway(mob, fleeTarget.pos, state), stamina: drainedStamina };
        return { ...this.wanderStep(mob, def, state), stamina: drainedStamina };
      }
      case 'Exhausted': {
        // Regenerate stamina while resting; resume normal behaviour when recovered.
        const exhaustStamina = mob.stamina ?? 0;
        const regenStamina = Math.min(
          exhaustStamina + EXHAUST_STAMINA_REGEN_PER_SECOND * SECONDS_PER_TICK,
          mob.maxStamina ?? calcMaxStamina(mob.stats)
        );
        if (regenStamina >= EXHAUST_EXIT_STAMINA) {
          return { ...mob, state: 'Wander', stateSince: turn, path: [], stamina: regenStamina };
        }
        return { ...mob, path: [], stamina: regenStamina }; // stay still while recovering
      }
      case 'Sleeping': {
        // Woken by a pawn entering vision.
        if (inVision) return { ...mob, state: 'Alerted', stateSince: turn };
        // Natural wake when rested or force-wake when ravenously hungry.
        if (
          mob.needs.fatigue <= sleepWakeThreshold(mob.needs.hunger) ||
          mob.needs.hunger >= SLEEP_MAX_HUNGER
        ) {
          return { ...mob, state: 'Wander', stateSince: turn };
        }
        return { ...mob, path: [] }; // stay still
      }
      default:
        return { ...mob, state: 'Wander', stateSince: turn };
    }
  }

  private stepAnimal(
    mob: Mob,
    def: CreatureDefinition,
    inVision: { pos: { x: number; y: number } } | null,
    nearest: { pos: { x: number; y: number } } | null,
    turn: number,
    state: GameState,
    allMobs: Mob[],
    pendingDamage: Map<string, number>,
    pendingMeatConsumption: Map<string, number>,
    pendingTileDepletion: Array<{ x: number; y: number; id: string }>,
    pendingMobState: Map<string, Partial<Mob>>
  ): Mob {
    // Vision range is set per-creature in creatures.jsonc; herbivores have wide
    // ranges (12-15 tiles) so detection and flee distances are fully data-driven.

    // Combined threat: pawn in vision OR a predatory mob nearby.
    const predatorThreat = this.nearestPredatorThreat(mob, def, allMobs);
    const threat = inVision ?? predatorThreat;

    // ── Hunger / fatigue FSM transitions (only when safe) ──────────────────────
    if (!threat) {
      const hungry = mob.needs.hunger >= HUNGER_EAT_THRESHOLD;
      const sated = mob.needs.hunger <= HUNGER_SATED_THRESHOLD;

      // Exit feeding states when sated.
      if (
        sated &&
        (mob.state === 'Foraging' || mob.state === 'Hunting' || mob.state === 'Eating')
      ) {
        return {
          ...mob,
          state: 'Grazing',
          stateSince: turn,
          eatProgress: undefined,
          huntTargetId: undefined,
          path: []
        };
      }

      // Enter a feeding state — hunger takes priority over sleep so animals eat before resting.
      if (
        hungry &&
        mob.state !== 'Foraging' &&
        mob.state !== 'Hunting' &&
        mob.state !== 'Eating' &&
        mob.state !== 'Fleeing' &&
        mob.state !== 'Startled' &&
        mob.state !== 'Sleeping'
      ) {
        // Forage (graze grass / eat wild food) first; hunt or scavenge a corpse only
        // as a fallback. Live-prey hunting requires `predator`/`carnivore`; scavenging
        // a corpse only requires `meat`/`organic` in `eats`.
        const canForage = def.grazes || def.eats.includes('food');
        const canHuntLive = def.predator || def.diet === 'carnivore';
        const canScavengeOrHunt =
          canHuntLive || def.eats.includes('meat') || def.eats.includes('organic');
        // Check hunt cooldown before entering Hunting state.
        const huntCooldownExpired = !mob.huntCooldownUntil || turn >= mob.huntCooldownUntil;
        if (canForage) return { ...mob, state: 'Foraging', stateSince: turn, path: [] };
        if (canScavengeOrHunt && huntCooldownExpired)
          return { ...mob, state: 'Hunting', stateSince: turn, path: [] };
      }

      // Enter sleep only when not hungry (mirrors pawn shouldPawnSleep).
      if (
        mob.needs.fatigue >= SLEEP_FATIGUE_THRESHOLD &&
        mob.needs.hunger < SLEEP_MAX_HUNGER &&
        mob.state !== 'Sleeping' &&
        mob.state !== 'Fleeing' &&
        mob.state !== 'Startled' &&
        mob.state !== 'Foraging' &&
        mob.state !== 'Hunting' &&
        mob.state !== 'Eating'
      ) {
        return { ...mob, state: 'Sleeping', stateSince: turn, path: [] };
      }
    } else if (mob.state === 'Foraging' || mob.state === 'Hunting' || mob.state === 'Eating') {
      // Threatened while eating — drop food and flee.
      const threatName = inVision
        ? (state.pawns.find(
            (p) =>
              p.position &&
              Math.abs(p.position.x - mob.x) <= def.stats.visionRange &&
              Math.abs(p.position.y - mob.y) <= def.stats.visionRange
          )?.name ?? 'predator')
        : 'predator';
      logFlee(
        mob.id,
        this.entityName(mob),
        inVision ? 'threat' : undefined,
        threatName,
        turn,
        mob.x,
        mob.y
      );
      return {
        ...mob,
        state: 'Startled',
        stateSince: turn,
        eatProgress: undefined,
        huntTargetId: undefined,
        path: []
      };
    }

    switch (mob.state) {
      case 'Grazing': {
        if (threat) return { ...mob, state: 'Startled', stateSince: turn, path: [] };
        return this.wanderStep(mob, def, state);
      }
      case 'Startled': {
        // Committed freeze: hold still for the full startle duration, then
        // ALWAYS bolt. Never returns to Grazing — that path would allow a
        // Grazing↔Startled flicker. Fleeing is the only exit.
        if (turn - mob.stateSince >= STARTLED_TICKS) {
          return { ...mob, state: 'Fleeing', stateSince: turn, path: [] };
        }
        return { ...mob, path: [] }; // frozen in place
      }
      case 'Fleeing': {
        // Drain stamina while fleeing; transition to Exhausted when empty.
        const curStamina = mob.stamina ?? mob.maxStamina ?? calcMaxStamina(mob.stats);
        const drainedStamina = curStamina - FLEE_STAMINA_DRAIN_PER_SECOND * SECONDS_PER_TICK;
        if (drainedStamina <= 0) {
          // Exhaustion is a transient, repeating state (flee → exhaust → recover → flee);
          // not chronicle-worthy — logging it floods the log.
          return { ...mob, state: 'Exhausted', stateSince: turn, stamina: 0 };
        }
        // Flee from the closest current threat (pawn or predator).
        const pawnDist = nearest ? this.dist(mob, nearest.pos) : Infinity;
        const predDist = predatorThreat ? this.dist(mob, predatorThreat.pos) : Infinity;
        const closestDist = Math.min(pawnDist, predDist);
        // Flee until the threat is beyond this creature's defined flee range.
        if (closestDist > def.stats.fleeRange) {
          return { ...mob, state: 'Grazing', stateSince: turn, path: [], stamina: drainedStamina };
        }
        const fleeFrom = pawnDist <= predDist ? nearest!.pos : predatorThreat!.pos;
        return { ...this.moveAway(mob, fleeFrom, state), stamina: drainedStamina };
      }
      case 'Exhausted': {
        // Regenerate stamina while resting; resume normal behaviour when recovered.
        const exhaustStamina = mob.stamina ?? 0;
        const regenStamina = Math.min(
          exhaustStamina + EXHAUST_STAMINA_REGEN_PER_SECOND * SECONDS_PER_TICK,
          mob.maxStamina ?? calcMaxStamina(mob.stats)
        );
        if (regenStamina >= EXHAUST_EXIT_STAMINA) {
          return { ...mob, state: 'Grazing', stateSince: turn, path: [], stamina: regenStamina };
        }
        return { ...mob, path: [], stamina: regenStamina }; // stay still while recovering
      }
      case 'Sleeping': {
        // Woken by any threat — bolt immediately.
        if (threat) return { ...mob, state: 'Startled', stateSince: turn, path: [] };
        // Natural wake-up when rested, or force-wake when ravenously hungry.
        if (
          mob.needs.fatigue <= sleepWakeThreshold(mob.needs.hunger) ||
          mob.needs.hunger >= SLEEP_MAX_HUNGER
        ) {
          return { ...mob, state: 'Grazing', stateSince: turn, path: [] };
        }
        return { ...mob, path: [] }; // stay still while sleeping
      }
      case 'Tamed':
        return mob; // Phase C — taming not yet implemented
      case 'Attacking': {
        // Prey forced into combat by a hunter — either a predator MOB (state Attacking)
        // or a colonist PAWN (state Hunting/Fighting). Stay and fight while that attacker
        // is still adjacent and engaged; if it's gone or has moved off, break and flee.
        // (Resolving the attacker from BOTH mobs and pawns is what lets the predator-prey
        // "fight back" circuit trigger no matter who corners the animal.)
        const atk = this.huntAttacker(mob, state, allMobs);
        if (atk && this.adjacent(mob, atk)) {
          return mob; // hold position, combatService resolves damage
        }
        // Attacker gone or moved away — flee.
        return { ...mob, state: 'Fleeing', stateSince: turn, huntTargetId: undefined, path: [] };
      }
      case 'Foraging':
        return this.stepForaging(mob, def, turn, state, pendingTileDepletion);
      case 'Hunting':
        return this.stepHunting(
          mob,
          def,
          turn,
          state,
          allMobs,
          pendingDamage,
          pendingMeatConsumption,
          pendingMobState
        );
      case 'Eating':
        // Eating is a sub-state of Foraging/Hunting — route back to the correct handler.
        if (mob.huntTargetId) {
          return this.stepHunting(
            mob,
            def,
            turn,
            state,
            allMobs,
            pendingDamage,
            pendingMeatConsumption,
            pendingMobState
          );
        }
        return this.stepForaging(mob, def, turn, state, pendingTileDepletion);
      default:
        return { ...mob, state: 'Grazing', stateSince: turn, path: [] };
    }
  }

  // ===== FEEDING MECHANICS ======================================================

  /**
   * Advance a Foraging entity toward the nearest grass tile, then eat from it.
   * No item spawns — primitive entities consume the resource directly.
   * Eating duration is time-based; the entity stays still (path: []) while eating.
   */
  private stepForaging(
    mob: Mob,
    def: CreatureDefinition,
    turn: number,
    state: GameState,
    pendingTileDepletion: Array<{ x: number; y: number; id: string }>
  ): Mob {
    // What this creature will graze/forage from tiles, in priority order: grass first
    // (herbivore staple), then wild forage nodes (berries/mushrooms — `eats` has 'food').
    const tileKindOrder: TileFoodKind[] = [];
    if (def.grazes) tileKindOrder.push('grass');
    if (def.eats.includes('food')) tileKindOrder.push('forage');
    const kinds = new Set<TileFoodKind>(tileKindOrder);
    // Idle/rest state differs by FSM: passive animals graze, hostile mobs wander.
    const idleState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';

    // Eating in progress — stay still and advance progress by elapsed seconds.
    const progress = mob.eatProgress ?? 0;
    if (progress > 0) {
      const next = progress + SECONDS_PER_TICK / EAT_GRASS_SECONDS;
      if (next >= 1) {
        // Deplete the edible resource (grass OR wild forage node) on the current tile,
        // restoring more hunger from real forage food than from plain grass.
        const tile = state.worldMap[mob.y]?.[mob.x];
        const edibleId = this.edibleResourceOnTile(tile, kinds);
        if (edibleId) pendingTileDepletion.push({ x: mob.x, y: mob.y, id: edibleId });
        const restore =
          edibleId && WILD_FORAGE_RESOURCE_IDS.has(edibleId)
            ? EAT_FORAGE_HUNGER_RESTORE
            : EAT_GRASS_HUNGER_RESTORE;

        const newHunger = Math.max(0, mob.needs.hunger - restore);
        // Stay Foraging until sated so the animal repeats eating on the next cycle.
        return {
          ...mob,
          eatProgress: undefined,
          path: [],
          needs: { ...mob.needs, hunger: newHunger, lastMeal: turn },
          state: newHunger > HUNGER_SATED_THRESHOLD ? 'Foraging' : idleState,
          stateSince: turn
        };
      }
      return { ...mob, eatProgress: next, path: [], state: 'Eating' as MobState };
    }

    // Already mid-path toward the food tile — let movement engine finish it.
    if (mob.path && mob.path.length > 0 && (mob.pathIndex ?? 0) < mob.path.length) {
      return mob;
    }

    // Path done — decide next step. Search in priority order so herbivores head for
    // grass before wild forage, and omnivores head for real forage food (berries/mushrooms).
    let target: { x: number; y: number } | null = null;
    for (const kind of tileKindOrder) {
      target = this.findNearestFoodTile(state, mob.x, mob.y, FORAGE_RADIUS, new Set([kind]));
      if (target) break;
    }
    if (!target) {
      // No edible tile in range — exit Foraging state and wander.
      if (turn % 300 === 0) {
        gameLogger.log(
          turn,
          'ENTITY-FEED',
          `FORAGE-NO-TARGET ${mob.id} @(${mob.x},${mob.y}) hunger=${mob.needs.hunger.toFixed(1)}`
        );
      }
      return { ...this.wanderStep(mob, def, state), state: idleState, stateSince: turn };
    }

    if (target.x === mob.x && target.y === mob.y) {
      return { ...mob, eatProgress: SECONDS_PER_TICK / EAT_GRASS_SECONDS, path: [] };
    }

    // Route to the food tile via A*. If unreachable, bail to wandering so the
    // animal keeps moving (and re-evaluates) instead of starving frozen in place.
    const newPath = this.pathTo(state, mob.x, mob.y, target.x, target.y, mob.id);
    if (!newPath.length) {
      gameLogger.log(
        turn,
        'ENTITY-FEED',
        `FORAGE-UNREACHABLE ${mob.id} @(${mob.x},${mob.y}) food@(${target.x},${target.y})`
      );
      return { ...this.wanderStep(mob, def, state), state: idleState, stateSince: turn };
    }
    return { ...mob, path: newPath, pathIndex: 0, nextCellCostLeft: undefined };
  }

  /**
   * Advance a Hunting entity toward its locked target or find new prey.
   * Once a target is locked (huntTargetId set), the hunter pursues it exclusively
   * unless the target becomes invalid (gone, stripped) or a corpse appears (free food).
   * If pathfinding fails, the hunter enters Wander with a cooldown before re-hunting.
   */
  private stepHunting(
    mob: Mob,
    def: CreatureDefinition,
    turn: number,
    state: GameState,
    allMobs: Mob[],
    pendingDamage: Map<string, number>,
    pendingMeatConsumption: Map<string, number>,
    pendingMobState: Map<string, Partial<Mob>>
  ): Mob {
    // Eating a corpse — stay still.
    const progress = mob.eatProgress ?? 0;
    if (progress > 0) {
      const target = mob.huntTargetId ? allMobs.find((m) => m.id === mob.huntTargetId) : null;
      // Abort if target gone, stripped, or no longer a corpse.
      if (!target || target.state !== 'Corpse' || (target.intactness ?? 1.0) <= 0) {
        const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
        return {
          ...mob,
          eatProgress: undefined,
          huntTargetId: undefined,
          path: [],
          state: restState,
          stateSince: turn
        };
      }
      const next = progress + SECONDS_PER_TICK / EAT_CORPSE_SECONDS;
      if (next >= 1) {
        // Record the portion consumed so the corpse's meatLeft is updated after the loop.
        pendingMeatConsumption.set(
          target.id,
          (pendingMeatConsumption.get(target.id) ?? 0) + CORPSE_PORTION
        );
        const newHunger = Math.max(0, mob.needs.hunger - EAT_CORPSE_HUNGER_RESTORE);
        const targetStripped = (target.intactness ?? 1.0) - CORPSE_PORTION <= 0;
        const stillHungry = newHunger > HUNGER_SATED_THRESHOLD;

        // Continue eating the same corpse if still hungry and meat remains.
        if (stillHungry && !targetStripped) {
          return {
            ...mob,
            eatProgress: SECONDS_PER_TICK / EAT_CORPSE_SECONDS,
            needs: { ...mob.needs, hunger: newHunger, lastMeal: turn }
          };
        }

        const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
        return {
          ...mob,
          eatProgress: undefined,
          huntTargetId: undefined,
          path: [],
          needs: { ...mob.needs, hunger: newHunger, lastMeal: turn },
          state: restState,
          stateSince: turn
        };
      }
      return { ...mob, eatProgress: next, path: [], state: 'Eating' as MobState };
    }

    // Determine prey: lock onto existing target or find new prey. Live-prey hunting
    // requires `predator`/`carnivore`; scavenging a corpse only requires `eats`
    // to include `meat`/`organic`.
    const allowLivePrey = def.predator || def.diet === 'carnivore';
    let prey: Mob | null = null;
    if (mob.huntTargetId) {
      // Locked onto a target — stick with it unless it's invalid.
      const lockedTarget = allMobs.find((m) => m.id === mob.huntTargetId);
      if (lockedTarget && lockedTarget.state !== 'Tamed') {
        // Target is valid. Allow switching to a corpse if one appears (free food).
        if (lockedTarget.state === 'Corpse' && (lockedTarget.intactness ?? 1.0) <= 0) {
          // Locked target is stripped — clear and find new prey.
          prey = this.findNearestPrey(mob, allMobs, allowLivePrey);
        } else {
          prey = lockedTarget;
        }
      } else {
        // Locked target is gone — find new prey.
        prey = this.findNearestPrey(mob, allMobs, allowLivePrey);
      }
    } else {
      // No locked target — find nearest prey.
      prey = this.findNearestPrey(mob, allMobs, allowLivePrey);
    }

    if (!prey) {
      // No prey in range — exit Hunting state and wander.
      const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
      return {
        ...this.wanderStep(mob, def, state),
        huntTargetId: undefined,
        state: restState,
        stateSince: turn
      };
    }

    const preyPos = { x: prey.x, y: prey.y };

    if (this.adjacent(mob, preyPos)) {
      if (prey.state === 'Corpse') {
        // Only start eating if meat remains (guards against race with pendingMeatConsumption).
        if ((prey.intactness ?? 1.0) <= 0) {
          const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
          return {
            ...this.wanderStep(mob, def, state),
            huntTargetId: undefined,
            state: restState,
            stateSince: turn
          };
        }
        return {
          ...mob,
          huntTargetId: prey.id,
          eatProgress: SECONDS_PER_TICK / EAT_CORPSE_SECONDS,
          path: []
        };
      }
      // Live prey — both enter combat (Attacking state) and fight it out.
      // combatService.tickCombat() resolves actual damage each tick.
      pendingMobState.set(prey.id, { state: 'Attacking', stateSince: turn, huntTargetId: mob.id });
      return { ...mob, state: 'Attacking', stateSince: turn, huntTargetId: prey.id, path: [] };
    }

    // Hunt give-up: if we've chased this whole hunt (stateSince = when Hunting began) without
    // ever closing to attack range, abandon it and cool down. Prevents the endless chase of
    // uncatchable prey (e.g. equal-speed Wolf↔Wolf) that re-triggered every tick.
    if (turn - mob.stateSince > ticksFromSeconds(HUNT_GIVE_UP_SECONDS)) {
      const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
      return {
        ...this.wanderStep(mob, def, state),
        huntTargetId: undefined,
        huntCooldownUntil: turn + ticksFromSeconds(HUNT_COOLDOWN_SECONDS),
        state: restState,
        stateSince: turn
      };
    }

    // Pursue prey via A*. Re-path when our route is exhausted or the prey has
    // drifted away from the path's end tile; otherwise keep following the route.
    // Throttle re-pathing to every 10 ticks to prevent main-thread stalls when
    // many hunters chase fleeing prey simultaneously.
    const pathEnd = mob.path && mob.path.length > 0 ? mob.path[mob.path.length - 1] : null;
    const pathExhausted = !mob.path?.length || (mob.pathIndex ?? 0) >= mob.path.length;
    const preyMoved =
      !pathEnd || Math.max(Math.abs(pathEnd.x - preyPos.x), Math.abs(pathEnd.y - preyPos.y)) > 1.5;
    const repathDue = pathExhausted || (preyMoved && (turn - mob.stateSince) % 10 === 0);
    if (repathDue) {
      // Path to an unoccupied tile adjacent to the prey so the wolf arrives in
      // attack range without needing to land on the prey's own tile.
      const approachTile = this.bestApproachTile(state, mob, preyPos, mob.id) ?? preyPos;
      const newPath = this.pathTo(state, mob.x, mob.y, approachTile.x, approachTile.y, mob.id);
      if (!newPath.length) {
        gameLogger.log(
          turn,
          'ENTITY-FEED',
          `HUNT-UNREACHABLE ${mob.id} @(${mob.x},${mob.y}) prey ${prey.id}@(${preyPos.x},${preyPos.y})`
        );
        // Set cooldown and transition to Wander.
        const cooldownUntil = turn + ticksFromSeconds(HUNT_COOLDOWN_SECONDS);
        const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
        return {
          ...this.wanderStep(mob, def, state),
          huntTargetId: undefined,
          huntCooldownUntil: cooldownUntil,
          state: restState,
          stateSince: turn
        };
      }
      return {
        ...mob,
        huntTargetId: prey.id,
        path: newPath,
        pathIndex: 0,
        nextCellCostLeft: undefined
      };
    }
    return { ...mob, huntTargetId: prey.id };
  }

  // ===== FORAGING QUERIES =======================================================

  /** Nearest walkable tile within radius that has a resource with `grazing: true`. */
  /**
   * The id of an edible resource on a tile that matches the given food kinds, or null.
   * `grass` matches grazing resources; `forage` matches wild edible forage nodes (berries…).
   */
  private edibleResourceOnTile(
    tile: { resources?: Record<string, number> } | undefined,
    kinds: Set<TileFoodKind>
  ): string | null {
    if (!tile?.resources) return null;
    const wantGrass = kinds.has('grass');
    const wantForage = kinds.has('forage');
    for (const [k, v] of Object.entries(tile.resources)) {
      if ((v ?? 0) <= 0) continue;
      if (wantGrass && resourceObjectService.getById(k)?.grazing) return k;
      if (wantForage && WILD_FORAGE_RESOURCE_IDS.has(k)) return k;
    }
    return null;
  }

  /** Nearest tile (Manhattan) within `radius` that carries food matching `kinds`. */
  private findNearestFoodTile(
    state: GameState,
    x: number,
    y: number,
    radius: number,
    kinds: Set<TileFoodKind>
  ): { x: number; y: number } | null {
    if (kinds.size === 0) return null;
    let bestDist = Infinity;
    let best: { x: number; y: number } | null = null;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const tile = state.worldMap[ny]?.[nx];
        if (!tile?.walkable) continue;
        if (!this.edibleResourceOnTile(tile, kinds)) continue;
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist < bestDist) {
          bestDist = dist;
          best = { x: nx, y: ny };
        }
      }
    }
    return best;
  }

  /**
   * Nearest corpse (preferred) within HUNT_RADIUS, or — if `allowLivePrey` — the nearest
   * live huntable creature. `allowLivePrey` should be `predator || diet === 'carnivore'`:
   * scavenging a corpse doesn't require being a hunter, but stalking live prey does.
   */
  private findNearestPrey(mob: Mob, allMobs: Mob[], allowLivePrey: boolean): Mob | null {
    let best: Mob | null = null;
    let bestDist = Infinity;
    for (const candidate of allMobs) {
      if (candidate.id === mob.id) continue;
      const raw = Math.abs(candidate.x - mob.x) + Math.abs(candidate.y - mob.y);
      if (candidate.state === 'Corpse') {
        if ((candidate.intactness ?? 1.0) <= 0) continue; // stripped — skip
        // Corpses weighted as 50% closer — free food with no danger.
        const d = raw * 0.5;
        if (d < bestDist) {
          bestDist = d;
          best = candidate;
        }
      } else if (
        allowLivePrey &&
        getCreatureById(candidate.creatureId)?.huntable &&
        candidate.state !== 'Tamed' &&
        raw <= HUNT_RADIUS
      ) {
        if (raw < bestDist) {
          bestDist = raw;
          best = candidate;
        }
      }
    }
    return best;
  }

  /**
   * Returns the nearest predator within the prey's vision range.
   * Threat identity is driven solely by the `predator` flag in creatures.jsonc
   * (wolf, bear, goblin, wraith). Diet is irrelevant here \u2014 a passive omnivore
   * chicken is not a predator, so flockmates never frighten each other.
   */
  /**
   * Position of whatever is currently attacking `mob` (tracked via `huntTargetId`) — a predator
   * MOB still in Attacking, or a colonist PAWN still Hunting/Fighting — or null if that attacker
   * is gone or has disengaged. This is the hook that lets the cornered-prey "fight back" state
   * trigger no matter who corners the animal (predator or hunter).
   */
  private huntAttacker(
    mob: Mob,
    state: GameState,
    allMobs: Mob[]
  ): { x: number; y: number } | null {
    if (!mob.huntTargetId) return null;
    const m = allMobs.find((a) => a.id === mob.huntTargetId);
    if (m) return m.state === 'Attacking' ? { x: m.x, y: m.y } : null;
    const p = state.pawns.find((pp) => pp.id === mob.huntTargetId);
    if (
      p &&
      p.isAlive !== false &&
      p.position &&
      (p.currentState === 'Hunting' || p.currentState === 'Fighting')
    ) {
      return { x: p.position.x, y: p.position.y };
    }
    return null;
  }

  private nearestPredatorThreat(
    prey: Mob,
    def: CreatureDefinition,
    allMobs: Mob[]
  ): { pos: { x: number; y: number } } | null {
    if (!def.huntable) return null;
    let best: Mob | null = null;
    let bestDist = Infinity;
    for (const m of allMobs) {
      if (m.id === prey.id || m.state === 'Corpse') continue;
      const mDef = getCreatureById(m.creatureId);
      if (!mDef || !mDef.predator) continue; // only flagged predators frighten prey
      const d = this.dist(prey, { x: m.x, y: m.y });
      if (d <= def.stats.visionRange && d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    return best ? { pos: { x: best.x, y: best.y } } : null;
  }

  stepHunger(state: GameState): GameState {
    const mobs = state.mobs;
    if (!mobs || mobs.length === 0) return state;
    const { turn } = state;

    const next = mobs.map((mob): Mob => {
      if (mob.state === 'Corpse' || mob.isAlive === false) return mob;
      const def = getCreatureById(mob.creatureId);
      if (!def) return mob;

      // Diet affects how fast hunger accrues. `none` (e.g. shadow_wraith) never gets hungry.
      const dietMult =
        def.diet === 'none'
          ? 0
          : def.diet === 'carnivore'
            ? 1.0
            : def.diet === 'herbivore'
              ? 0.5
              : 0.7; // omnivore

      const condMults = conditionNeedMultipliers(mob.conditions ?? []);
      // Body size drives appetite via the same data-driven `hunger_rate` stat as pawns.
      const sizeRate = pawnStatService.evaluateStat('hunger_rate', mob);
      const hungerDelta =
        BASE_HUNGER_PER_SECOND * SECONDS_PER_TICK * dietMult * condMults.hungerRate * sizeRate;
      const fatigueDelta = BASE_FATIGUE_PER_SECOND * SECONDS_PER_TICK * condMults.fatigueRate;

      // Sleeping: hunger accrues at 33% rate; fatigue recovers instead of rising.
      const sleepingNow = mob.state === 'Sleeping';
      const newHunger = Math.min(
        100,
        mob.needs.hunger + hungerDelta * (sleepingNow ? SLEEP_HUNGER_RATE : 1)
      );
      const newFatigue = sleepingNow
        ? Math.max(0, mob.needs.fatigue - SLEEP_RECOVERY_PER_SECOND * SECONDS_PER_TICK)
        : Math.min(100, mob.needs.fatigue + fatigueDelta);
      // Starvation: drain HP once hunger is capped at 100.
      const healthDelta = newHunger >= 100 ? -(STARVATION_DAMAGE_PER_SECOND * SECONDS_PER_TICK) : 0;

      // ── Blood loss ──────────────────────────────────────────────────────────────────
      const limbs = mob.limbs ? [...mob.limbs] : undefined;
      const totalBleedRate = (limbs ?? []).reduce((sum, l) => sum + (l.bleedRate ?? 0), 0);
      const maxBV = mob.maxBloodVolume ?? 100;
      let bloodVolume = mob.bloodVolume ?? maxBV;

      if (totalBleedRate > 0) {
        bloodVolume = Math.max(0, bloodVolume - perTick(totalBleedRate));
      } else if (bloodVolume < maxBV) {
        // Slow regeneration when not bleeding (~2000s to full recovery).
        bloodVolume = Math.min(maxBV, bloodVolume + perTick(0.05));
      }

      // Sync blood_loss condition severity (mirrors pawn tickConditions).
      let conditions = [...(mob.conditions ?? [])];
      const bloodSeverity = Math.round((1 - bloodVolume / maxBV) * 1000) / 1000;
      const bloodLossIdx = conditions.findIndex((c) => c.id === 'blood_loss');
      if (bloodSeverity > 0) {
        if (bloodLossIdx === -1) conditions.push({ id: 'blood_loss', severity: bloodSeverity });
        else conditions[bloodLossIdx] = { ...conditions[bloodLossIdx], severity: bloodSeverity };
      } else if (bloodLossIdx !== -1) {
        conditions.splice(bloodLossIdx, 1);
      }

      // Death by blood loss.
      if (bloodVolume <= 0) {
        logEntityDeath(mob.id, this.entityName(mob), 'blood_loss', turn, mob.x, mob.y);
        return {
          ...mob,
          state: 'Corpse',
          isAlive: false,
          diedAt: turn,
          intactness: 1.0,
          bloodVolume: 0,
          conditions,
          limbs: limbs ?? mob.limbs
        };
      }

      // Critical limb destruction (head or torso at 0 HP).
      if (limbs) {
        for (const limb of limbs) {
          if (limb.health <= 0 && (limb.id === 'head' || limb.id === 'torso')) {
            logEntityDeath(mob.id, this.entityName(mob), 'critical_limb', turn, mob.x, mob.y);
            return {
              ...mob,
              state: 'Corpse',
              isAlive: false,
              diedAt: turn,
              intactness: 1.0,
              bloodVolume,
              conditions,
              limbs
            };
          }
        }
      }

      return {
        ...mob,
        needs: {
          ...mob.needs,
          hunger: newHunger,
          fatigue: newFatigue
        },
        health: Math.max(0, mob.health + healthDelta),
        bloodVolume,
        conditions,
        limbs: limbs ?? mob.limbs
      };
    });

    // Drop a carcass item for every mob that just died this tick.
    let result: GameState = { ...state, mobs: next };
    for (let i = 0; i < mobs.length; i++) {
      if (mobs[i].state !== 'Corpse' && next[i].state === 'Corpse') {
        result = this.dropCarcass(result, next[i]);
      }
    }
    return result;
  }

  // ===== DECAY ===================================================================

  /** Drop a carcass DroppedItem at the mob's position when it dies. */
  private dropCarcass(state: GameState, mob: Mob): GameState {
    const def = getCreatureById(mob.creatureId);
    const carcassId = def?.carcassItemId;
    if (!carcassId) return state; // no carcass for this creature (e.g. shadow_wraith)
    const id = `carcass-${mob.id}-${state.turn}`;
    const drop: DroppedItem = { id, resourceId: carcassId, x: mob.x, y: mob.y, quantity: 1 };
    let next: GameState = { ...state, droppedItems: [...(state.droppedItems ?? []), drop] };
    next = absorbDropIfOnStockpileTile(next, id);
    return next;
  }

  removeDead(state: GameState): GameState {
    const mobs = state.mobs;
    if (!mobs || mobs.length === 0) return state;

    const kept = mobs.filter((m) => {
      if (m.health <= 0 && m.state !== 'Corpse') return true; // becomes corpse below
      if (m.state === 'Corpse' && m.diedAt !== undefined) {
        return state.turn - m.diedAt < CORPSE_DECAY_TICKS;
      }
      return true;
    });

    // Convert freshly-killed entities to corpses.
    let changed = kept.length !== mobs.length;
    const finalized = kept.map((m) => {
      if (m.health <= 0 && m.state !== 'Corpse') {
        changed = true;
        // Attribute the death so the log says "died of …" rather than the old
        // misfire where a starving entity "started fleeing" just before dying.
        const cause =
          m.needs.hunger >= 95
            ? 'starvation'
            : (m.bloodVolume ?? 1) <= 0
              ? 'blood_loss'
              : 'injuries';
        logEntityDeath(m.id, this.entityName(m), cause, state.turn, m.x, m.y);
        return {
          ...m,
          state: 'Corpse' as MobState,
          isAlive: false,
          diedAt: state.turn,
          intactness: 1.0
        };
      }
      return m;
    });

    if (!changed) return state;
    let result: GameState = { ...state, mobs: finalized };
    // Drop a carcass item for each mob freshly converted to Corpse this pass.
    for (let i = 0; i < kept.length; i++) {
      if (kept[i].state !== 'Corpse' && finalized[i].state === 'Corpse') {
        result = this.dropCarcass(result, finalized[i]);
      }
    }
    return result;
  }

  // ===== MOVEMENT HELPERS ========================================================

  /**
   * Set a 1-tile path step toward or away from a reference position.
   * The movement engine (advanceMobMovement) will advance the entity
   * along this path on the same tick.
   */
  private wanderStep(mob: Mob, def: CreatureDefinition, state: GameState): Mob {
    // Still following a path — let it finish before picking the next step.
    if (mob.path && mob.path.length > 0 && (mob.pathIndex ?? 0) < mob.path.length) return mob;
    // Probabilistic idle: ~WANDER_MOVES_PER_SECOND steps/sec on average.
    if (rng.random() >= WANDER_MOVES_PER_SECOND * SECONDS_PER_TICK) return mob;
    const tile = this.findNearbyWalkable(state, mob.x, mob.y, mob.homeX, mob.homeY, mob.id);
    if (!tile) return mob;
    return { ...mob, path: [tile], pathIndex: 0, nextCellCostLeft: undefined };
  }

  private moveToward(mob: Mob, target: { x: number; y: number }, state: GameState): Mob {
    return this.stepDirectional(mob, target, state, 1);
  }

  private moveAway(mob: Mob, threat: { x: number; y: number }, state: GameState): Mob {
    return this.stepDirectional(mob, threat, state, -1);
  }

  /**
   * Nearest walkable tile adjacent to `target` (excluding target itself), ranked
   * by Manhattan distance from `from`. Used so hunters path to a tile beside their
   * prey rather than onto the prey's occupied tile.
   */
  private bestApproachTile(
    state: GameState,
    from: { x: number; y: number },
    target: { x: number; y: number },
    selfId: string
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = target.x + dx;
        const ny = target.y + dy;
        if (!this.isWalkable(state, nx, ny)) continue;
        if (occupancyService.isBlocked(state, nx, ny, selfId)) continue;
        const d = Math.abs(nx - from.x) + Math.abs(ny - from.y);
        if (d < bestDist) {
          bestDist = d;
          best = { x: nx, y: ny };
        }
      }
    }
    return best;
  }

  private stepDirectional(
    mob: Mob,
    ref: { x: number; y: number },
    state: GameState,
    sign: 1 | -1
  ): Mob {
    const dx = Math.sign(ref.x - mob.x) * sign;
    const dy = Math.sign(ref.y - mob.y) * sign;
    // Primary candidates: diagonal away + 2 cardinal fallbacks.
    // Filter self-tile: when dx or dy is 0, one candidate can equal (mob.x, mob.y),
    // which would produce a stuck self-referential path.
    const primary = [
      { x: mob.x + dx, y: mob.y + dy },
      { x: mob.x + dx, y: mob.y },
      { x: mob.x, y: mob.y + dy }
    ].filter((c) => c.x !== mob.x || c.y !== mob.y);

    for (const c of primary) {
      if (
        this.isWalkable(state, c.x, c.y) &&
        !occupancyService.isBlocked(state, c.x, c.y, mob.id)
      ) {
        const currentNext = mob.path?.[mob.pathIndex ?? 0];
        if (currentNext && currentNext.x === c.x && currentNext.y === c.y) return mob;
        return { ...mob, path: [c], pathIndex: 0, nextCellCostLeft: undefined };
      }
    }

    // All primary directions blocked (cornered against terrain) — try the full 8
    // neighbours sorted by how well they move away from / toward the reference point.
    const allNeighbours = [
      { x: mob.x - 1, y: mob.y - 1 },
      { x: mob.x, y: mob.y - 1 },
      { x: mob.x + 1, y: mob.y - 1 },
      { x: mob.x - 1, y: mob.y },
      { x: mob.x + 1, y: mob.y },
      { x: mob.x - 1, y: mob.y + 1 },
      { x: mob.x, y: mob.y + 1 },
      { x: mob.x + 1, y: mob.y + 1 }
    ].sort((a, b) => {
      const dA = Math.abs(a.x - ref.x) + Math.abs(a.y - ref.y);
      const dB = Math.abs(b.x - ref.x) + Math.abs(b.y - ref.y);
      // sign = -1 (flee): maximise distance → sort descending
      // sign = +1 (approach): minimise distance → sort ascending
      return (dA - dB) * sign;
    });

    for (const c of allNeighbours) {
      if (
        this.isWalkable(state, c.x, c.y) &&
        !occupancyService.isBlocked(state, c.x, c.y, mob.id)
      ) {
        const currentNext = mob.path?.[mob.pathIndex ?? 0];
        if (currentNext && currentNext.x === c.x && currentNext.y === c.y) return mob;
        return { ...mob, path: [c], pathIndex: 0, nextCellCostLeft: undefined };
      }
    }
    return mob; // truly boxed in on all sides
  }

  /**
   * Advance all moving mobs along their paths using the shared MovementSystem.
   * Called once per tick in GameEngineImpl, after stepEntities().
   */
  advanceMobMovement(state: GameState): GameState {
    const mobs = state.mobs;
    if (!mobs || mobs.length === 0) return state;

    // Hard tile occupancy: one entity body per tile, no phasing. A mob may not
    // enter a tile that holds another entity (pawn or mob) and two mobs may not
    // converge on the same free tile in one tick. `occupancy` = every body's
    // CURRENT tile; `claimed` = tiles a mover has committed to entering this tick.
    const occupancy = occupancyService.blockedTiles(state); // includes self; self-tile guarded below
    const claimed = new Set<string>();
    // A mob already mid-crossing (nextCellCostLeft set) committed to its target on a
    // prior tick — it owns that tile, so reserve it before anyone else can claim it.
    for (const m of mobs) {
      if (m.state === 'Corpse' || !m.path?.length || m.nextCellCostLeft == null) continue;
      const t = m.path[m.pathIndex ?? 0];
      if (t) claimed.add(`${t.x},${t.y}`);
    }

    let changed = false;
    const next: Mob[] = new Array(mobs.length);

    for (let i = 0; i < mobs.length; i++) {
      const mob = mobs[i];
      const target = mob.path?.[mob.pathIndex ?? 0];
      if (!mob.path || mob.path.length === 0 || !target) {
        next[i] = mob;
        continue;
      }
      const targetKey = `${target.x},${target.y}`;
      const selfKey = `${mob.x},${mob.y}`;
      const midCrossing = mob.nextCellCostLeft != null;
      // Blocked if the target tile holds another body, or another fresh mover has
      // already claimed it this tick (a mid-crosser already owns its own claim).
      const blocked =
        (occupancy.has(targetKey) && targetKey !== selfKey) ||
        (!midCrossing && claimed.has(targetKey));

      if (blocked) {
        const bt = (mob.blockedTicks ?? 0) + 1;
        next[i] =
          bt > MAX_BLOCKED_TICKS
            ? // Stuck too long (e.g. corridor deadlock) — drop the path so the
              // FSM re-routes around the obstruction next tick.
              { ...mob, path: [], pathIndex: 0, nextCellCostLeft: undefined, blockedTicks: 0 }
            : { ...mob, blockedTicks: bt };
        changed = true;
        continue;
      }

      if (!midCrossing) claimed.add(targetKey);
      const def = getCreatureById(mob.creatureId);
      const speed = def ? Math.max(0.5, def.stats.speed) : 1;
      const moved = advanceAlongPath(mob, speed, state.worldMap);
      next[i] = mob.blockedTicks ? { ...moved, blockedTicks: 0 } : moved;
      if (next[i] !== mob) changed = true;
    }

    return changed ? { ...state, mobs: next } : state;
  }

  private findNearbyWalkable(
    state: GameState,
    x: number,
    y: number,
    homeX?: number,
    homeY?: number,
    selfId?: string
  ): { x: number; y: number } | null {
    const HOME_RANGE = 10;
    // Enumerate all 8 neighbours in random order (Fisher-Yates) so every walkable
    // direction is considered exactly once — no wasted random retries that could
    // leave a boxed-in animal stuck even when an exit exists.
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: 1, dy: 1 }
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rng.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const { dx, dy } of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.isWalkable(state, nx, ny)) continue;
      // Diagonal wall-cut prevention (mirrors WASM A*): a diagonal step is only
      // allowed if at least one shared orthogonal neighbour is walkable.
      if (
        dx !== 0 &&
        dy !== 0 &&
        !this.isWalkable(state, x + dx, y) &&
        !this.isWalkable(state, x, y + dy)
      ) {
        continue;
      }
      if (
        homeX !== undefined &&
        homeY !== undefined &&
        (Math.abs(nx - homeX) > HOME_RANGE || Math.abs(ny - homeY) > HOME_RANGE)
      ) {
        continue;
      }
      if (selfId && occupancyService.isBlocked(state, nx, ny, selfId)) continue;
      return { x: nx, y: ny };
    }
    return null;
  }

  private isWalkable(state: GameState, x: number, y: number): boolean {
    const tile = state.worldMap[y]?.[x];
    return !!tile && tile.walkable;
  }

  // ===== QUERY HELPERS ===========================================================

  private nearestPawn(
    mob: Mob,
    pawns: Pawn[]
  ): { pawn: Pawn; pos: { x: number; y: number } } | null {
    let best: { pawn: Pawn; pos: { x: number; y: number } } | null = null;
    let bestDist = Infinity;
    for (const p of pawns) {
      const pos = p.position!;
      const d = Math.abs(pos.x - mob.x) + Math.abs(pos.y - mob.y);
      if (d < bestDist) {
        bestDist = d;
        best = { pawn: p, pos };
      }
    }
    return best;
  }

  private dist(mob: Mob, pos: { x: number; y: number }): number {
    return Math.max(Math.abs(pos.x - mob.x), Math.abs(pos.y - mob.y));
  }

  /**
   * WASM A* path from (sx,sy) to (ex,ey). Returns the route EXCLUDING the start
   * tile, or [] if WASM is not ready or the target is unreachable. The terrain layer
   * is memoized per-worldMap reference; the entity-aware grid clones only the walkable
   * mask (occupancyService is the single source of "what's blocked"), so a path that
   * routes around bodies costs one mask clone, not a full grid rebuild.
   */
  private pathTo(
    state: GameState,
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    selfId?: string
  ): { x: number; y: number }[] {
    if (!wasmPathfinderService.isReady()) return [];
    // Entities are solid: every pawn/mob body (except the mover itself) is a wall,
    // so paths route AROUND other entities and never plan through an occupied tile.
    // The movement engine additionally blocks entry into a tile that becomes
    // occupied after this path was computed.
    const blocked = occupancyService.blockedTiles(state, selfId);
    const { walkable, costs, width, height } = buildPathfindingGridsWithBlocked(
      state.worldMap,
      blocked,
      sx,
      sy,
      ex,
      ey
    );
    return wasmPathfinderService.findPath(walkable, costs, width, height, sx, sy, ex, ey);
  }

  private adjacent(mob: Mob, pos: { x: number; y: number }): boolean {
    return Math.abs(pos.x - mob.x) <= 1 && Math.abs(pos.y - mob.y) <= 1;
  }

  /**
   * Drop carcasses for mobs that were killed by the combat tick this frame.
   * Combat sets state='Corpse' directly, bypassing stepHunger/removeDead, so
   * without this call those corpses would never produce a carcass item.
   */
  handleFreshCombatCorpses(prevState: GameState, nextState: GameState): GameState {
    const prevMobs = prevState.mobs ?? [];
    const nextMobs = nextState.mobs ?? [];
    let result = nextState;
    for (let i = 0; i < nextMobs.length; i++) {
      const prev = prevMobs[i];
      const next = nextMobs[i];
      if (prev?.state !== 'Corpse' && next?.state === 'Corpse') {
        result = this.dropCarcass(result, next);
      }
    }
    return result;
  }
}

export const entityService = new EntityServiceImpl();
