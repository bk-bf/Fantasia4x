import type { GameState, Mob, MobState, Pawn, EntityStats, EntityNeeds, EntityCondition, LimbState } from '../core/types';
import { CREATURES, getCreatureById, type CreatureDefinition } from '../core/Creatures';
import { getAmbientLight } from './EnvironmentService';
import { ticksFromSeconds, SECONDS_PER_TICK, perTick } from '../core/time';
import { conditionNeedMultipliers } from '../core/needs';
import { advanceAlongPath } from '../systems/MovementSystem';

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
const MAX_HOSTILE = 20;
const MAX_NEUTRAL = 20;
const CORPSE_DECAY_TICKS = ticksFromSeconds(200); // corpse persists ~200s then vanishes

// Movement / FSM timings
const STARTLED_TICKS = ticksFromSeconds(1);
const FLEE_TO_EXHAUST_TICKS = ticksFromSeconds(20);
const EXHAUST_RECOVER_TICKS = ticksFromSeconds(15);
const SAFE_RESET_TICKS = ticksFromSeconds(15);
const FLEE_HEALTH_FRACTION = 0.2;

// ── Hunger / fatigue tunables ──────────────────────────────────────────────────
/** Hunger accrual per second for an omnivore at neutral condition. */
const BASE_HUNGER_PER_SECOND = 0.54;
/** Fatigue accrual per second at neutral condition. */
const BASE_FATIGUE_PER_SECOND = 0.32;
/** HP drained per second once hunger reaches 100 (starving). */
const STARVATION_DAMAGE_PER_SECOND = 1;
/** Hunger threshold at which an entity transitions to a feeding state. */
const HUNGER_EAT_THRESHOLD = 60;
/** Hunger threshold at which a feeding entity considers itself sated. */
const HUNGER_SATED_THRESHOLD = 10;
/** Tile radius searched for edible grass resources. */
const FORAGE_RADIUS = 15;
/** Tile radius searched for prey (corpse or live animal). */
const HUNT_RADIUS = 20;
/** Tile resource keys counted as edible grass for herbivores/omnivores. */
const GRASS_RESOURCES = ['grass_patch', 'tall_grass_patch', 'deep_grass_patch'] as const;
/** Real-time duration to eat a grass tile (seconds). */
const EAT_GRASS_SECONDS = 1.25;
/** Real-time duration to consume a corpse (seconds). */
const EAT_CORPSE_SECONDS = 2.0;
/** Hunger restored when finishing a grass meal. */
const EAT_GRASS_HUNGER_RESTORE = 40;
/** Hunger restored when finishing a corpse meal. */
const EAT_CORPSE_HUNGER_RESTORE = 50;
/** Average wander-step decisions per second while grazing (idle fraction excluded). */
const WANDER_MOVES_PER_SECOND = 1.0;

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

        for (let p = 0; p < packs; p++) {
            const def = dayCreatures[Math.floor(Math.random() * dayCreatures.length)];
            if (def.entityClass === 'mob' && hostile >= MAX_HOSTILE) continue;
            if (def.entityClass === 'animal' && neutral >= MAX_NEUTRAL) continue;

            const origin = this.findSpawnTile(state, def);
            if (!origin) continue;

            const [packMin, packMax] = def.pack;
            const packSize = packMin + Math.floor(Math.random() * (packMax - packMin + 1));
            for (let i = 0; i < packSize; i++) {
                const tile =
                    i === 0 ? origin : this.findNearbyWalkable(state, origin.x, origin.y) ?? origin;
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
        if (Math.random() > chance) return state;

        const hostileCount = mobs.filter((m) => m.entityClass === 'mob' && m.state !== 'Corpse').length;
        const neutralCount = mobs.filter((m) => m.entityClass === 'animal' && m.state !== 'Corpse').length;

        const def = this.pickSpawnCreature(isNight);
        if (!def) return state;
        if (def.entityClass === 'mob' && hostileCount >= MAX_HOSTILE) return state;
        if (def.entityClass === 'animal' && neutralCount >= MAX_NEUTRAL) return state;

        const origin = this.findSpawnTile(state, def);
        if (!origin) return state;

        const [packMin, packMax] = def.pack;
        const packSize = packMin + Math.floor(Math.random() * (packMax - packMin + 1));
        const newMobs: Mob[] = [];
        for (let i = 0; i < packSize; i++) {
            const tile = i === 0 ? origin : this.findNearbyWalkable(state, origin.x, origin.y) ?? origin;
            newMobs.push(this.makeMob(def, tile.x, tile.y, state.turn));
        }

        return { ...state, mobs: [...mobs, ...newMobs] };
    }

    private pickSpawnCreature(isNight: boolean): CreatureDefinition | undefined {
        const pool = CREATURES.filter((c) => !c.nightOnly || isNight);
        if (pool.length === 0) return undefined;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    private findSpawnTile(
        state: GameState,
        def: CreatureDefinition
    ): { x: number; y: number } | null {
        const map = state.worldMap;
        const h = map.length;
        const w = map[0]?.length ?? 0;
        if (w === 0 || h === 0) return null;

        const pawnPositions = state.pawns
            .filter((p) => p.position)
            .map((p) => p.position!);

        for (let attempt = 0; attempt < 40; attempt++) {
            const x = EDGE_BUFFER + Math.floor(Math.random() * (w - 2 * EDGE_BUFFER));
            const y = EDGE_BUFFER + Math.floor(Math.random() * (h - 2 * EDGE_BUFFER));
            const tile = map[y]?.[x];
            if (!tile || !tile.walkable) continue;

            const weight = def.biomeWeights[tile.terrainType] ?? 0;
            if (weight <= 0) continue;
            // Probabilistic accept by biome weight (max weight 1.2 → clamp).
            if (Math.random() > Math.min(1, weight)) continue;

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
        const initialState: MobState = def.entityClass === 'mob' ? 'Wander' : 'Grazing';
        const stats: EntityStats = {
            strength: def.stats.strength,
            dexterity: Math.round(def.stats.speed * 1.5),
            wisdom: def.stats.visionRange,
            constitution: Math.round(10 + (def.stats.health - 30) / 5),
            intelligence: def.entityClass === 'animal' ? 4 : 8,
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
            id: `mob-${def.id}-${turn}-${this.idCounter++}`,
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
            bloodVolume: 100,
            isAlive: true,
            activeEffects: [],
            skills: {},
            limbs: [
                { id: 'head', health: 100, isMissing: false, bleedRate: 0 },
                { id: 'torso', health: 100, isMissing: false, bleedRate: 0 },
                { id: 'left_arm', health: 100, isMissing: false, bleedRate: 0 },
                { id: 'right_arm', health: 100, isMissing: false, bleedRate: 0 },
                { id: 'left_leg', health: 100, isMissing: false, bleedRate: 0 },
                { id: 'right_leg', health: 100, isMissing: false, bleedRate: 0 }
            ]
        };
    }

    // ===== STEPPING ================================================================

    stepEntities(state: GameState): GameState {
        const mobs = state.mobs;
        if (!mobs || mobs.length === 0) return state;

        const livePawns = state.pawns.filter((p) => p.position && p.isAlive !== false);
        // Accumulates entity-vs-entity damage dealt this tick (hunting mini-combat).
        const pendingDamage = new Map<string, number>();
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
            const stepped = this.stepOne(mob, def, livePawns, mobs, state, pendingDamage);
            next[i] = stepped;
            if (stepped !== mob) changed = true;
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
                        const hit = candidates[Math.floor(Math.random() * candidates.length)];
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

        return changed ? { ...state, mobs: next } : state;
    }

    private stepOne(
        mob: Mob,
        def: CreatureDefinition,
        pawns: Pawn[],
        allMobs: Mob[],
        state: GameState,
        pendingDamage: Map<string, number>
    ): Mob {
        // FSM runs every tick. Movement advancement is handled separately by
        // advanceMobMovement(), which uses the shared MovementSystem path engine.
        const turn = state.turn;
        const nearest = this.nearestPawn(mob, pawns);
        const inVision =
            nearest && this.dist(mob, nearest.pos) <= def.stats.visionRange ? nearest : null;
        const isNight = getAmbientLight(turn) < NIGHT_THRESHOLD;

        if (def.entityClass === 'animal') {
            return this.stepAnimal(mob, def, inVision, nearest, turn, state, allMobs, pendingDamage);
        }
        return this.stepHostile(mob, def, inVision, nearest, isNight, turn, state, allMobs, pendingDamage);
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
        pendingDamage: Map<string, number>
    ): Mob {
        const aggressive = def.behaviour === 'aggressive' || (def.nocturnalAggro && isNight);

        // Wounded entities flee regardless of state.
        if (mob.health <= mob.maxHealth * FLEE_HEALTH_FRACTION && mob.state !== 'Fleeing') {
            return { ...mob, state: 'Fleeing', stateSince: turn, eatProgress: undefined, huntTargetId: undefined };
        }

        // ── Hunger-driven FSM ───────────────────────────────────────────
        // Aggressive mobs prioritise attacking pawns over feeding.
        // Non-aggressive (passive/neutral) hostile mobs will hunt when hungry.
        const canHunt = def.diet !== 'herbivore';
        if (mob.state === 'Hunting') {
            // Snap back to aggro if a pawn enters vision while aggressive.
            if (inVision && aggressive) {
                return { ...mob, state: 'Alerted', stateSince: turn, eatProgress: undefined, huntTargetId: undefined };
            }
            if (mob.needs.hunger <= HUNGER_SATED_THRESHOLD) {
                return { ...mob, state: 'Wander', stateSince: turn, eatProgress: undefined, huntTargetId: undefined };
            }
            return this.stepHunting(mob, def, turn, state, allMobs, pendingDamage);
        }
        if (!inVision && canHunt && mob.needs.hunger >= HUNGER_EAT_THRESHOLD &&
            mob.state !== 'Fleeing') {
            return { ...mob, state: 'Hunting', stateSince: turn };
        }

        switch (mob.state) {
            case 'Wander': {
                if (inVision && aggressive) {
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
                    return { ...mob, state: 'Attacking', stateSince: turn };
                }
                return this.moveToward(mob, nearest.pos, state);
            }
            case 'Attacking': {
                // COMBAT-SYSTEM owns damage resolution; Phase A just holds the line.
                if (!nearest || !this.adjacent(mob, nearest.pos)) {
                    return { ...mob, state: 'Alerted', stateSince: turn };
                }
                return mob;
            }
            case 'Fleeing': {
                if (nearest && this.dist(mob, nearest.pos) <= def.stats.visionRange) {
                    return this.moveAway(mob, nearest.pos, state);
                }
                if (turn - mob.stateSince > SAFE_RESET_TICKS) {
                    return { ...mob, state: 'Wander', stateSince: turn };
                }
                return this.wanderStep(mob, def, state);
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
        pendingDamage: Map<string, number>
    ): Mob {
        // ── Hunger-driven FSM transitions (only when safe) ───────────────────────
        if (!inVision) {
            const hungry = mob.needs.hunger >= HUNGER_EAT_THRESHOLD;
            const sated = mob.needs.hunger <= HUNGER_SATED_THRESHOLD;

            // Exit feeding states when sated.
            if (sated && (mob.state === 'Foraging' || mob.state === 'Hunting')) {
                return { ...mob, state: 'Grazing', stateSince: turn, eatProgress: undefined, huntTargetId: undefined };
            }

            // Enter a feeding state from any non-feeding, non-flight state.
            if (hungry && mob.state !== 'Foraging' && mob.state !== 'Hunting' &&
                mob.state !== 'Fleeing' && mob.state !== 'Startled') {
                const canForage = def.diet !== 'carnivore';
                const canHunt = def.diet !== 'herbivore';
                if (canForage) return { ...mob, state: 'Foraging', stateSince: turn };
                if (canHunt) return { ...mob, state: 'Hunting', stateSince: turn };
            }
        } else if (mob.state === 'Foraging' || mob.state === 'Hunting') {
            // Threatened while eating — drop food and flee.
            return { ...mob, state: 'Startled', stateSince: turn, eatProgress: undefined, huntTargetId: undefined };
        }

        switch (mob.state) {
            case 'Grazing': {
                if (inVision) return { ...mob, state: 'Startled', stateSince: turn };
                return this.wanderStep(mob, def, state);
            }
            case 'Startled': {
                if (turn - mob.stateSince >= STARTLED_TICKS) {
                    return { ...mob, state: 'Fleeing', stateSince: turn };
                }
                return mob; // frozen
            }
            case 'Fleeing': {
                if (turn - mob.stateSince > FLEE_TO_EXHAUST_TICKS) {
                    return { ...mob, state: 'Exhausted', stateSince: turn };
                }
                if (!nearest || this.dist(mob, nearest.pos) > def.stats.visionRange * 1.5) {
                    return { ...mob, state: 'Grazing', stateSince: turn };
                }
                if (nearest) return this.moveAway(mob, nearest.pos, state);
                return this.wanderStep(mob, def, state);
            }
            case 'Exhausted': {
                if (turn - mob.stateSince > EXHAUST_RECOVER_TICKS) {
                    return { ...mob, state: 'Grazing', stateSince: turn };
                }
                return this.wanderStep(mob, def, state); // slow drift, huntable
            }
            case 'Tamed':
                return mob; // Phase C — taming not yet implemented
            case 'Foraging':
                return this.stepForaging(mob, def, turn, state);
            case 'Hunting':
                return this.stepHunting(mob, def, turn, state, allMobs, pendingDamage);
            default:
                return { ...mob, state: 'Grazing', stateSince: turn };
        }
    }

    // ===== FEEDING MECHANICS ======================================================

    /**
     * Advance a Foraging entity toward the nearest grass tile, then eat from it.
     * No item spawns — primitive entities consume the resource directly.
     * Eating duration is time-based; the entity stays still (path: []) while eating.
     */
    private stepForaging(mob: Mob, def: CreatureDefinition, turn: number, state: GameState): Mob {
        // Eating in progress — stay still and advance progress by elapsed seconds.
        const progress = mob.eatProgress ?? 0;
        if (progress > 0) {
            const next = progress + SECONDS_PER_TICK / EAT_GRASS_SECONDS;
            if (next >= 1) {
                return {
                    ...mob,
                    eatProgress: undefined,
                    path: [],
                    needs: {
                        ...mob.needs,
                        hunger: Math.max(0, mob.needs.hunger - EAT_GRASS_HUNGER_RESTORE),
                        lastMeal: turn
                    },
                    state: 'Grazing',
                    stateSince: turn
                };
            }
            return { ...mob, eatProgress: next, path: [] };
        }

        // Already mid-path toward the food tile — let movement engine finish it.
        if (mob.path && mob.path.length > 0 && (mob.pathIndex ?? 0) < mob.path.length) {
            return mob;
        }

        // Path done — decide next step.
        const target = this.findNearestEdibleTile(state, mob.x, mob.y, FORAGE_RADIUS);
        if (!target) return this.wanderStep(mob, def, state);

        if (target.x === mob.x && target.y === mob.y) {
            return { ...mob, eatProgress: SECONDS_PER_TICK / EAT_GRASS_SECONDS, path: [] };
        }
        return this.moveToward(mob, target, state);
    }

    /**
     * Advance a Hunting entity toward the nearest corpse or live animal, then eat.
     * Mini-combat roll on contact with a live animal; no item spawns on kill.
     */
    private stepHunting(
        mob: Mob,
        def: CreatureDefinition,
        turn: number,
        state: GameState,
        allMobs: Mob[],
        pendingDamage: Map<string, number>
    ): Mob {
        // Eating a corpse — stay still.
        const progress = mob.eatProgress ?? 0;
        if (progress > 0) {
            const target = mob.huntTargetId ? allMobs.find((m) => m.id === mob.huntTargetId) : null;
            if (!target || target.state !== 'Corpse') {
                return { ...mob, eatProgress: undefined, huntTargetId: undefined, path: [] };
            }
            const next = progress + SECONDS_PER_TICK / EAT_CORPSE_SECONDS;
            if (next >= 1) {
                const restState: MobState = def.entityClass === 'animal' ? 'Grazing' : 'Wander';
                return {
                    ...mob,
                    eatProgress: undefined,
                    huntTargetId: undefined,
                    path: [],
                    needs: {
                        ...mob.needs,
                        hunger: Math.max(0, mob.needs.hunger - EAT_CORPSE_HUNGER_RESTORE),
                        lastMeal: turn
                    },
                    state: restState,
                    stateSince: turn
                };
            }
            return { ...mob, eatProgress: next, path: [] };
        }

        const prey = this.findNearestPrey(mob, allMobs);
        if (!prey) return { ...mob, huntTargetId: undefined, ...this.wanderStep(mob, def, state) };

        const preyPos = { x: prey.x, y: prey.y };

        if (this.adjacent(mob, preyPos)) {
            if (prey.state === 'Corpse') {
                return { ...mob, huntTargetId: prey.id, eatProgress: SECONDS_PER_TICK / EAT_CORPSE_SECONDS, path: [] };
            }
            // Live prey — STR vs STR mini-combat roll.
            const hitChance = Math.min(0.9, Math.max(0.1, 0.5 + (mob.stats.strength - prey.stats.strength) * 0.05));
            if (Math.random() < hitChance) {
                pendingDamage.set(prey.id, (pendingDamage.get(prey.id) ?? 0) + mob.stats.strength);
            }
            return { ...mob, huntTargetId: prey.id, path: [] };
        }

        // Pursue prey — always refresh path for responsive tracking.
        return this.moveToward({ ...mob, huntTargetId: prey.id }, preyPos, state);
    }

    // ===== FORAGING QUERIES =======================================================

    /** Nearest walkable tile within radius that has a grass resource node. */
    private findNearestEdibleTile(
        state: GameState,
        x: number,
        y: number,
        radius: number
    ): { x: number; y: number } | null {
        let bestDist = Infinity;
        let best: { x: number; y: number } | null = null;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                const tile = state.worldMap[ny]?.[nx];
                if (!tile?.walkable) continue;
                const hasGrass = GRASS_RESOURCES.some((k) => (tile.resources?.[k] ?? 0) > 0);
                if (!hasGrass) continue;
                const dist = Math.abs(dx) + Math.abs(dy);
                if (dist < bestDist) { bestDist = dist; best = { x: nx, y: ny }; }
            }
        }
        return best;
    }

    /** Nearest corpse (preferred) or live non-tamed animal within HUNT_RADIUS. */
    private findNearestPrey(mob: Mob, allMobs: Mob[]): Mob | null {
        let best: Mob | null = null;
        let bestDist = Infinity;
        for (const candidate of allMobs) {
            if (candidate.id === mob.id) continue;
            const raw = Math.abs(candidate.x - mob.x) + Math.abs(candidate.y - mob.y);
            if (candidate.state === 'Corpse') {
                // Corpses weighted as 50% closer — free food with no danger.
                const d = raw * 0.5;
                if (d < bestDist) { bestDist = d; best = candidate; }
            } else if (
                candidate.entityClass === 'animal' &&
                candidate.state !== 'Tamed' &&
                raw <= HUNT_RADIUS
            ) {
                if (raw < bestDist) { bestDist = raw; best = candidate; }
            }
        }
        return best;
    }

    stepHunger(state: GameState): GameState {
        const mobs = state.mobs;
        if (!mobs || mobs.length === 0) return state;
        const { turn } = state;

        const next = mobs.map((mob): Mob => {
            if (mob.state === 'Corpse' || mob.isAlive === false) return mob;
            const def = getCreatureById(mob.creatureId);
            if (!def) return mob;

            // Diet affects how fast hunger accrues.
            const dietMult =
                def.diet === 'carnivore' ? 1.0 :
                    def.diet === 'herbivore' ? 0.5 :
                        0.7; // omnivore

            const condMults = conditionNeedMultipliers(mob.conditions ?? []);
            const hungerDelta = BASE_HUNGER_PER_SECOND * SECONDS_PER_TICK * dietMult * condMults.hungerRate;
            const fatigueDelta = BASE_FATIGUE_PER_SECOND * SECONDS_PER_TICK * condMults.fatigueRate;

            const newHunger = Math.min(100, mob.needs.hunger + hungerDelta);
            // Starvation: drain HP once hunger is capped at 100.
            const healthDelta = newHunger >= 100 ? -(STARVATION_DAMAGE_PER_SECOND * SECONDS_PER_TICK) : 0;

            // ── Blood loss ──────────────────────────────────────────────────────────────────
            const limbs = mob.limbs ? [...mob.limbs] : undefined;
            const totalBleedRate = (limbs ?? []).reduce((sum, l) => sum + (l.bleedRate ?? 0), 0);
            let bloodVolume = mob.bloodVolume ?? 100;

            if (totalBleedRate > 0) {
                bloodVolume = Math.max(0, bloodVolume - perTick(totalBleedRate));
            } else if (bloodVolume < 100) {
                // Slow regeneration when not bleeding (~2000s to full recovery).
                bloodVolume = Math.min(100, bloodVolume + perTick(0.05));
            }

            // Sync blood_loss condition severity (mirrors pawn tickConditions).
            let conditions = [...(mob.conditions ?? [])];
            const bloodSeverity = Math.round((1 - bloodVolume / 100) * 1000) / 1000;
            const bloodLossIdx = conditions.findIndex((c) => c.id === 'blood_loss');
            if (bloodSeverity > 0) {
                if (bloodLossIdx === -1) conditions.push({ id: 'blood_loss', severity: bloodSeverity });
                else conditions[bloodLossIdx] = { ...conditions[bloodLossIdx], severity: bloodSeverity };
            } else if (bloodLossIdx !== -1) {
                conditions.splice(bloodLossIdx, 1);
            }

            // Death by blood loss.
            if (bloodVolume <= 0) {
                return {
                    ...mob, state: 'Corpse', isAlive: false, diedAt: turn,
                    bloodVolume: 0, conditions, limbs: limbs ?? mob.limbs
                };
            }

            // Critical limb destruction (head or torso at 0 HP).
            if (limbs) {
                for (const limb of limbs) {
                    if (limb.health <= 0 && (limb.id === 'head' || limb.id === 'torso')) {
                        return {
                            ...mob, state: 'Corpse', isAlive: false, diedAt: turn,
                            bloodVolume, conditions, limbs
                        };
                    }
                }
            }

            return {
                ...mob,
                needs: {
                    ...mob.needs,
                    hunger: newHunger,
                    fatigue: Math.min(100, mob.needs.fatigue + fatigueDelta)
                },
                health: Math.max(0, mob.health + healthDelta),
                bloodVolume,
                conditions,
                limbs: limbs ?? mob.limbs
            };
        });

        return { ...state, mobs: next };
    }

    // ===== DECAY ===================================================================

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
                return { ...m, state: 'Corpse' as MobState, isAlive: false, diedAt: state.turn };
            }
            return m;
        });

        return changed ? { ...state, mobs: finalized } : state;
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
        if (Math.random() >= WANDER_MOVES_PER_SECOND * SECONDS_PER_TICK) return mob;
        const tile = this.findNearbyWalkable(state, mob.x, mob.y, mob.homeX, mob.homeY);
        if (!tile) return mob;
        return { ...mob, path: [tile], pathIndex: 0, nextCellCostLeft: undefined };
    }

    private moveToward(mob: Mob, target: { x: number; y: number }, state: GameState): Mob {
        return this.stepDirectional(mob, target, state, 1);
    }

    private moveAway(mob: Mob, threat: { x: number; y: number }, state: GameState): Mob {
        return this.stepDirectional(mob, threat, state, -1);
    }

    private stepDirectional(
        mob: Mob,
        ref: { x: number; y: number },
        state: GameState,
        sign: 1 | -1
    ): Mob {
        const dx = Math.sign(ref.x - mob.x) * sign;
        const dy = Math.sign(ref.y - mob.y) * sign;
        // Try diagonal first, then the two cardinal fallbacks.
        const candidates = [
            { x: mob.x + dx, y: mob.y + dy },
            { x: mob.x + dx, y: mob.y },
            { x: mob.x, y: mob.y + dy }
        ];
        for (const c of candidates) {
            if (this.isWalkable(state, c.x, c.y)) {
                // Override path with new 1-tile step (urgent directional moves always redirect).
                return { ...mob, path: [c], pathIndex: 0, nextCellCostLeft: undefined };
            }
        }
        return mob;
    }

    /**
     * Advance all moving mobs along their paths using the shared MovementSystem.
     * Called once per tick in GameEngineImpl, after stepEntities().
     */
    advanceMobMovement(state: GameState): GameState {
        const mobs = state.mobs;
        if (!mobs || mobs.length === 0) return state;

        let changed = false;
        const next: Mob[] = new Array(mobs.length);

        for (let i = 0; i < mobs.length; i++) {
            const mob = mobs[i];
            if (!mob.path || mob.path.length === 0) {
                next[i] = mob;
                continue;
            }
            const def = getCreatureById(mob.creatureId);
            const speed = def ? Math.max(0.5, def.stats.speed) : 1;
            const moved = advanceAlongPath(mob, speed, state.worldMap);
            next[i] = moved;
            if (moved !== mob) changed = true;
        }

        return changed ? { ...state, mobs: next } : state;
    }

    private findNearbyWalkable(
        state: GameState,
        x: number,
        y: number,
        homeX?: number,
        homeY?: number
    ): { x: number; y: number } | null {
        const HOME_RANGE = 10;
        for (let attempt = 0; attempt < 8; attempt++) {
            const nx = x + (Math.floor(Math.random() * 3) - 1);
            const ny = y + (Math.floor(Math.random() * 3) - 1);
            if (nx === x && ny === y) continue;
            if (!this.isWalkable(state, nx, ny)) continue;
            if (
                homeX !== undefined &&
                homeY !== undefined &&
                (Math.abs(nx - homeX) > HOME_RANGE || Math.abs(ny - homeY) > HOME_RANGE)
            ) {
                continue;
            }
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

    private adjacent(mob: Mob, pos: { x: number; y: number }): boolean {
        return Math.abs(pos.x - mob.x) <= 1 && Math.abs(pos.y - mob.y) <= 1;
    }
}

export const entityService = new EntityServiceImpl();
