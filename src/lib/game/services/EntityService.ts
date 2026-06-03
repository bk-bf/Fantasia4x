import type { GameState, Mob, MobState, Pawn } from '../core/types';
import { CREATURES, getCreatureById, type CreatureDefinition } from '../core/Creatures';
import { getAmbientLight } from './EnvironmentService';
import { ticksFromSeconds } from '../core/time';

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
            moveCooldown: this.moveInterval(def)
        };
    }

    // ===== STEPPING ================================================================

    stepEntities(state: GameState): GameState {
        const mobs = state.mobs;
        if (!mobs || mobs.length === 0) return state;

        const livePawns = state.pawns.filter((p) => p.position && p.isAlive !== false);
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
            const stepped = this.stepOne(mob, def, livePawns, state);
            next[i] = stepped;
            if (stepped !== mob) changed = true;
        }

        return changed ? { ...state, mobs: next } : state;
    }

    private stepOne(
        mob: Mob,
        def: CreatureDefinition,
        pawns: Pawn[],
        state: GameState
    ): Mob {
        // Movement throttle: only act when the per-entity cooldown elapses.
        const cooldown = mob.moveCooldown - 1;
        if (cooldown > 0) {
            return { ...mob, moveCooldown: cooldown };
        }

        const turn = state.turn;
        const nearest = this.nearestPawn(mob, pawns);
        const inVision =
            nearest && this.dist(mob, nearest.pos) <= def.stats.visionRange ? nearest : null;
        const isNight = getAmbientLight(turn) < NIGHT_THRESHOLD;

        let work: Mob = { ...mob, moveCooldown: this.moveInterval(def) };

        if (def.entityClass === 'animal') {
            work = this.stepAnimal(work, def, inVision, nearest, turn, state);
        } else {
            work = this.stepHostile(work, def, inVision, nearest, isNight, turn, state);
        }
        return work;
    }

    private stepHostile(
        mob: Mob,
        def: CreatureDefinition,
        inVision: { pos: { x: number; y: number } } | null,
        nearest: { pos: { x: number; y: number } } | null,
        isNight: boolean,
        turn: number,
        state: GameState
    ): Mob {
        const aggressive = def.behaviour === 'aggressive' || (def.nocturnalAggro && isNight);

        // Wounded entities flee regardless of state.
        if (mob.health <= mob.maxHealth * FLEE_HEALTH_FRACTION && mob.state !== 'Fleeing') {
            return { ...mob, state: 'Fleeing', stateSince: turn };
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
        state: GameState
    ): Mob {
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
            default:
                return { ...mob, state: 'Grazing', stateSince: turn };
        }
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
                return { ...m, state: 'Corpse' as MobState, diedAt: state.turn };
            }
            return m;
        });

        return changed ? { ...state, mobs: finalized } : state;
    }

    // ===== MOVEMENT HELPERS ========================================================

    /** Ticks between single-tile moves, derived from the creature's speed. */
    private moveInterval(def: CreatureDefinition): number {
        const speed = Math.max(1, def.stats.speed);
        return Math.max(1, Math.round(ticksFromSeconds(1) / speed));
    }

    private wanderStep(mob: Mob, def: CreatureDefinition, state: GameState): Mob {
        // 60% chance to idle, else drift one tile, biased to stay near home.
        if (Math.random() < 0.6) return mob;
        const tile = this.findNearbyWalkable(state, mob.x, mob.y, mob.homeX, mob.homeY);
        if (!tile) return mob;
        return { ...mob, x: tile.x, y: tile.y };
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
            if (this.isWalkable(state, c.x, c.y)) return { ...mob, x: c.x, y: c.y };
        }
        return mob;
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
