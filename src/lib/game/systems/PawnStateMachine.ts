/**
 * PawnStateMachine — Phase 5a/5e
 *
 * Turn-based state machine for pawn behaviour.
 * States: Idle → MovingToResource → Working → Idle
 *         Idle → Hungry → Eating → Idle
 *         Idle → Tired  → Sleeping → Idle
 *
 * Phase 5 change: Idle now picks jobs through JobService instead of directly
 * scanning designations. All job completion side-effects live in JobService.
 *
 * Port of Celestia pawn_state_machine.gd + states/*.gd, adapted to
 * turn-based ticks and Fantasia4x GameState immutability.
 */

import type { GameState, Pawn, ConditionDef, ConditionStage } from '../core/types';
import { addToStockpileZone } from '../core/GameState';
import ITEMS_DATABASE from '../database/items.jsonc';
import conditionsData from '../database/conditions.jsonc';
import { jobService, BASE_WORK_RATE } from '../services/JobService';
import { pawnService } from '../services/PawnService';
import { itemService } from '../services/ItemService';
import { wasmPathfinderService } from '../services/WasmPathfinderService';
import { buildPathfindingGrids } from '../services/PathfinderService';
import { logActivity } from '../../stores/Log';

// ===== STATE NAME CONSTANTS =====
export const PAWN_STATE = {
    IDLE: 'Idle',
    MOVING_TO_RESOURCE: 'MovingToResource',
    WORKING: 'Working',
    HUNGRY: 'Hungry',
    TIRED: 'Tired',
    MOVING_TO_NEED: 'MovingToNeed',
    EATING: 'Eating',
    SLEEPING: 'Sleeping',
    HAULING: 'Hauling',
    MOVING_TO_DEPOSIT: 'MovingToDeposit'
} as const;

export type PawnStateName = (typeof PAWN_STATE)[keyof typeof PAWN_STATE];

// ===== NEED THRESHOLDS =====
// Calibrated to 1 in-game day = 300 turns (1 turn ≈ 5 in-game min; 1 day ≈ 5 real min at 1 turn/sec):
//   Hunger:  0.54/turn → 0→70 in ~130 turns ≈ 0.43 days  (matches Rimworld ~10.5h hunger trigger)
//   Fatigue: 0.32/turn → 0→72 in ~225 turns ≈ 0.75 days  (matches Rimworld ~18h sleep trigger)
//   Bed sleep: 0.72/turn → 72→0 in ~100 turns = 1/3 day ≈ 8h   (Rimworld 8h bed sleep)
//   Ground:    0.58/turn → 72→0 in ~124 turns ≈ 9.9h             (Rimworld ~10h ground sleep)
//   At 2× speed everything is 2× faster; at 4× speed 4× faster — matching Rimworld multi-speed feel.
const HUNGER_THRESHOLD = 70;           // Seek food at 70% (= Rimworld 30% saturation trigger)
const CRITICAL_HUNGER = 87;            // Interrupt work — ravenous (Rimworld 12.5% sat = 87.5%)
const FATIGUE_THRESHOLD = 72;          // Seek rest after ~225 turns ≈ 0.75 days (28% rest = 72% fatigue)
const CRITICAL_FATIGUE = 95;           // Emergency work interrupt — near collapse
const EATING_TURNS = 2;                // Turns to eat at a campfire (~2 in-game min)
const EATING_TURNS_GROUND = 3;         // Turns eating in-place (cold, uncomfortable)
const SLEEPING_TURNS = 100;            // Full recovery in bed: 72 / 0.72 = 100 turns = 1/3 day (progress bar ref)
const SLEEPING_TURNS_GROUND = 124;     // Full recovery on ground: 72 / 0.58 ≈ 124 turns ≈ 9.9h
const HUNGER_PER_FOOD_UNIT = 30;       // Base hunger restored per 1 unit (×nutrition)
const SAFE_HUNGER = 10;                // Target hunger level after a full meal
const MAX_UNITS_PER_FOOD_TYPE = 3;     // Cap per food type per meal — avoids hoarding
const FATIGUE_PER_SLEEPING_TURN = 0.72; // Bed: 72 fatigue → 0 in ~100 turns = 8 in-game hours
const FATIGUE_PER_SLEEPING_GROUND = 0.58; // Ground: 72 → 0 in ~124 turns ≈ 9.9 in-game hours
// Wake thresholds — prevents yo-yo by requiring proper rest before resuming activity
const SLEEP_WAKE_THRESHOLD_FED = 0;    // Sleep until fully restored when not hungry
const SLEEP_WAKE_THRESHOLD_HUNGRY = 30; // Allow early waking at 30% to go eat

// ===== CONDITION CONSTANTS (SURVIVAL-HEALTH spec) =====
const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];
const MALNUTRITION_ONSET_HUNGER   = 87;    // same as CRITICAL_HUNGER — condition starts here
const MALNUTRITION_SAFE_HUNGER    = 40;    // below this threshold, condition recovers
const MALNUTRITION_RATE_CRITICAL  = 0.0008; // +/turn at hunger 87–99  → lethal in ~1250 turns ≈ 4.2 days
const MALNUTRITION_RATE_MAX       = 0.002;  // +/turn at hunger 100    → lethal in ~500 turns ≈ 1.7 days
const MALNUTRITION_RECOVERY_RATE  = 0.0003; // −/turn when hunger < 40 → fully clears in ~3333 turns ≈ 11 days
const BLOOD_REGEN_PER_TURN        = 0.05;   // blood volume +/turn when not bleeding → 0→100 in 2000 turns ≈ 6.7 days

/** Return the active ConditionStage for a condition at the given severity, or undefined. */
function getConditionStage(conditionId: string, severity: number): ConditionStage | undefined {
    const def = CONDITIONS_DB.find((d) => d.id === conditionId);
    if (!def) return undefined;
    let active: ConditionStage | undefined;
    for (const stage of def.stages) {
        if (severity >= stage.minSeverity) active = stage;
    }
    return active;
}

// ===== HELPERS =====

/**
 * Kill a pawn: set isAlive=false, record DeadPawnRecord, log, apply mood penalty to survivors.
 */
function killPawn(
    pawn: Pawn,
    cause: 'malnutrition' | 'blood_loss' | 'critical_limb' | 'combat' | 'exhaustion_cascade',
    gameState: GameState
): GameState {
    logActivity({
        turn: gameState.turn,
        type: 'event',
        actor: pawn.id,
        action: 'died',
        target: cause,
        result: `${pawn.name} has died of ${cause.replace('_', ' ')}.`,
        severity: 'critical'
    });

    const deadRecord = {
        name: pawn.name,
        cause,
        turn: gameState.turn,
        stats: {
            strength:     pawn.stats.strength     ?? 10,
            dexterity:    pawn.stats.dexterity     ?? 10,
            intelligence: pawn.stats.intelligence  ?? 10
        }
    };

    // Apply mood penalty to all living pawns
    const pawns = gameState.pawns.map((p) => {
        if (p.id === pawn.id) {
            return {
                ...p,
                isAlive: false,
                currentState: 'Dead',
                activeJob: undefined,
                path: [],
                isMoving: false
            };
        }
        if (p.isAlive === false) return p;
        return {
            ...p,
            state: { ...p.state, mood: Math.max(0, (p.state?.mood ?? 50) - 5) }
        };
    });

    return {
        ...gameState,
        pawns,
        deadPawns: [...(gameState.deadPawns ?? []), deadRecord]
    };
}

/**
 * Tick all progressive health conditions for a single pawn:
 * malnutrition progression, blood loss, critical limb checks.
 * Returns updated GameState (may trigger death via killPawn).
 */
function tickConditions(pawn: Pawn, gameState: GameState): GameState {
    const hunger = pawn.needs?.hunger ?? 0;
    let conditions = [...(pawn.conditions ?? [])];
    let bloodVolume = pawn.bloodVolume ?? 100;
    const limbs = pawn.limbs ?? [];

    // ── Malnutrition ──────────────────────────────────────────────────────────
    const malnutritionIdx = conditions.findIndex((c) => c.id === 'malnutrition');

    if (hunger >= MALNUTRITION_ONSET_HUNGER) {
        const rate = hunger >= 100 ? MALNUTRITION_RATE_MAX : MALNUTRITION_RATE_CRITICAL;
        if (malnutritionIdx === -1) {
            conditions.push({ id: 'malnutrition', severity: rate });
        } else {
            conditions[malnutritionIdx] = {
                ...conditions[malnutritionIdx],
                severity: Math.min(1.0, conditions[malnutritionIdx].severity + rate)
            };
        }
    } else if (hunger < MALNUTRITION_SAFE_HUNGER && malnutritionIdx !== -1) {
        const newSeverity = conditions[malnutritionIdx].severity - MALNUTRITION_RECOVERY_RATE;
        if (newSeverity <= 0) {
            conditions.splice(malnutritionIdx, 1);
        } else {
            conditions[malnutritionIdx] = { ...conditions[malnutritionIdx], severity: newSeverity };
        }
    }

    // Check malnutrition lethality (re-find in case just added)
    const malnutritionCurrent = conditions.find((c) => c.id === 'malnutrition');
    const malnutritionDef = CONDITIONS_DB.find((d) => d.id === 'malnutrition');
    if (malnutritionCurrent && malnutritionDef && malnutritionCurrent.severity >= malnutritionDef.lethalSeverity) {
        const updated = { ...pawn, conditions, bloodVolume };
        return killPawn(
            { ...gameState.pawns.find((p) => p.id === pawn.id)!, ...updated },
            'malnutrition',
            { ...gameState, pawns: gameState.pawns.map((p) => p.id === pawn.id ? { ...p, conditions, bloodVolume } : p) }
        );
    }

    // ── Blood Loss ────────────────────────────────────────────────────────────
    const totalBleedRate = limbs.reduce((sum, l) => sum + (l.bleedRate ?? 0), 0);

    if (totalBleedRate > 0) {
        bloodVolume = Math.max(0, bloodVolume - totalBleedRate);
    }

    // Sync blood_loss condition severity = 1 - (bloodVolume / 100)
    const bloodSeverity = 1 - (bloodVolume / 100);
    const bloodLossIdx = conditions.findIndex((c) => c.id === 'blood_loss');
    if (bloodSeverity > 0) {
        if (bloodLossIdx === -1) {
            conditions.push({ id: 'blood_loss', severity: bloodSeverity });
        } else {
            conditions[bloodLossIdx] = { ...conditions[bloodLossIdx], severity: bloodSeverity };
        }
    } else if (bloodLossIdx !== -1) {
        conditions.splice(bloodLossIdx, 1);
    }

    // Regen blood when not bleeding
    if (totalBleedRate === 0 && bloodVolume < 100) {
        bloodVolume = Math.min(100, bloodVolume + BLOOD_REGEN_PER_TURN);
    }

    // Check blood loss lethality
    if (bloodVolume <= 0) {
        const updatedGs = { ...gameState, pawns: gameState.pawns.map((p) => p.id === pawn.id ? { ...p, conditions, bloodVolume: 0, limbs } : p) };
        return killPawn(updatedGs.pawns.find((p) => p.id === pawn.id)!, 'blood_loss', updatedGs);
    }

    // ── Critical Limb Destruction ─────────────────────────────────────────────
    for (const limb of limbs) {
        if (limb.health <= 0 && (limb.id === 'head' || limb.id === 'torso')) {
            const updatedGs = { ...gameState, pawns: gameState.pawns.map((p) => p.id === pawn.id ? { ...p, conditions, bloodVolume, limbs } : p) };
            return killPawn(updatedGs.pawns.find((p) => p.id === pawn.id)!, 'critical_limb', updatedGs);
        }
    }

    // ── Persist updated condition/blood state ──────────────────────────────────
    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id ? { ...p, conditions, bloodVolume, limbs } : p
        )
    };
}

function isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
}

/** Tiles held by pawns that are currently stationary (eating, sleeping, or working). */
function getOccupiedTiles(excludePawnId: string, gs: GameState): Set<string> {
    const occupied = new Set<string>();
    for (const p of gs.pawns) {
        if (p.id === excludePawnId || !p.position) continue;
        const state = p.currentState ?? PAWN_STATE.IDLE;
        if (
            state === PAWN_STATE.EATING ||
            state === PAWN_STATE.SLEEPING ||
            state === PAWN_STATE.WORKING
        ) {
            occupied.add(`${p.position.x},${p.position.y}`);
        }
    }
    return occupied;
}

function findAdjacentApproach(
    tx: number,
    ty: number,
    worldMap: GameState['worldMap'],
    occupied?: Set<string>
): { x: number; y: number } | null {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = tx + dx;
            const ny = ty + dy;
            if (worldMap[ny]?.[nx]?.walkable && !occupied?.has(`${nx},${ny}`)) return { x: nx, y: ny };
        }
    }
    return null;
}

function tryAssignPath(
    pawn: Pawn,
    tx: number,
    ty: number,
    gameState: GameState
): GameState | null {
    if (!pawn.position) return null;
    if (!wasmPathfinderService.isReady()) return null;
    if (isAdjacent(pawn.position.x, pawn.position.y, tx, ty)) return null;
    const occupied = getOccupiedTiles(pawn.id, gameState);
    const approach = findAdjacentApproach(tx, ty, gameState.worldMap, occupied);
    if (!approach) return null;
    const { walkable, costs, width, height } = buildPathfindingGrids(gameState.worldMap);
    const path = wasmPathfinderService.findPath(
        walkable, costs, width, height,
        pawn.position.x, pawn.position.y,
        approach.x, approach.y
    );
    if (path.length === 0) return null;
    return pawnService.assignPath(pawn.id, path, gameState);
}

/** Quick check: is there any food available at all (no allocation). */
function hasAvailableFood(gs: GameState): boolean {
    return gs.item.some((i) => {
        if (i.amount <= 0) return false;
        const def = ITEMS_DATABASE.find((d: any) => d.id === i.id);
        return def?.category === 'food' || (def?.nutrition ?? 0) > 0;
    }) || Object.entries(gs.stockpile ?? {}).some(([id, amount]) => {
        if (amount <= 0) return false;
        const def = ITEMS_DATABASE.find((d: any) => d.id === id);
        return def?.category === 'food' || (def?.nutrition ?? 0) > 0;
    });
}

type MealPortion = { source: 'item' | 'stockpile'; id: string; units: number };

/**
 * Select a balanced meal that brings the pawn to SAFE_HUNGER.
 * Takes the most nutritious food first, capped at MAX_UNITS_PER_FOOD_TYPE per type,
 * then supplements with less nutritious options if needed.
 */
function selectFoodForMeal(pawn: Pawn, gs: GameState): MealPortion[] {
    const hungerToSatisfy = Math.max(0, (pawn.needs?.hunger ?? 0) - SAFE_HUNGER);
    if (hungerToSatisfy <= 0) return [];

    type FoodOption = { source: 'item' | 'stockpile'; id: string; available: number; nutrition: number };
    const seenIds = new Set<string>();
    const options: FoodOption[] = [];

    for (const i of gs.item) {
        if (i.amount <= 0) continue;
        const def = ITEMS_DATABASE.find((d: any) => d.id === i.id);
        const nutrition = def?.nutrition ?? 0;
        if (def?.category !== 'food' && nutrition <= 0) continue;
        seenIds.add(i.id);
        options.push({ source: 'item', id: i.id, available: i.amount, nutrition });
    }
    for (const [id, amount] of Object.entries(gs.stockpile ?? {})) {
        if (amount <= 0 || seenIds.has(id)) continue;
        const def = ITEMS_DATABASE.find((d: any) => d.id === id);
        const nutrition = def?.nutrition ?? 0;
        if (def?.category !== 'food' && nutrition <= 0) continue;
        options.push({ source: 'stockpile', id, available: amount, nutrition });
    }

    options.sort((a, b) => b.nutrition - a.nutrition);

    const meal: MealPortion[] = [];
    let remaining = hungerToSatisfy;
    for (const food of options) {
        if (remaining <= 0) break;
        const hungerPerUnit = food.nutrition * HUNGER_PER_FOOD_UNIT;
        if (hungerPerUnit <= 0) continue;
        const unitsNeeded = Math.ceil(remaining / hungerPerUnit);
        const unitsTaken = Math.min(unitsNeeded, MAX_UNITS_PER_FOOD_TYPE, food.available);
        if (unitsTaken <= 0) continue;
        meal.push({ source: food.source, id: food.id, units: unitsTaken });
        remaining -= unitsTaken * hungerPerUnit;
    }
    return meal;
}

/** Consume a pre-selected meal, returning updated state and total hunger to recover. */
function consumeMeal(meal: MealPortion[], gs: GameState): { state: GameState; hungerRecovered: number } {
    let state = gs;
    let hungerRecovered = 0;
    for (const { source, id, units } of meal) {
        const def = ITEMS_DATABASE.find((d: any) => d.id === id);
        if (source === 'item') {
            state = {
                ...state,
                item: state.item.map((i) =>
                    i.id === id ? { ...i, amount: Math.max(0, i.amount - units) } : i
                )
            };
        } else {
            const newStockpile = { ...(state.stockpile ?? {}) };
            newStockpile[id] = Math.max(0, (newStockpile[id] ?? 0) - units);
            state = { ...state, stockpile: newStockpile };
        }
    }
    return { state, hungerRecovered };
}

// Building type lists — module-level for use in helpers
const CAMPFIRE_TYPES = ['campfire'];
const REST_TYPES = ['lean_to_shelter', 'woodland_shelter', 'stone_hut'];

/** Phase 6: find the nearest complete storage building (campfire etc.) to a pawn. */
function findNearestStorageBuilding(
    pawn: Pawn,
    gs: GameState
): { x: number; y: number; buildingId: string } | null {
    if (!pawn.position) return null;
    let best: { x: number; y: number; buildingId: string; dist: number } | null = null;
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        if (!CAMPFIRE_TYPES.includes(b.type)) continue;
        const dist = Math.abs(b.x - pawn.position.x) + Math.abs(b.y - pawn.position.y);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, buildingId: b.id, dist };
    }
    return best ? { x: best.x, y: best.y, buildingId: best.buildingId } : null;
}

/** Phase 6: find the nearest complete rest building (shelter etc.) to a pawn. */
function findNearestRestBuilding(
    pawn: Pawn,
    gs: GameState
): { x: number; y: number; buildingId: string } | null {
    if (!pawn.position) return null;
    let best: { x: number; y: number; buildingId: string; dist: number } | null = null;
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        if (!REST_TYPES.includes(b.type)) continue;
        const dist = Math.abs(b.x - pawn.position.x) + Math.abs(b.y - pawn.position.y);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, buildingId: b.id, dist };
    }
    return best ? { x: best.x, y: best.y, buildingId: best.buildingId } : null;
}

/** True when the pawn is adjacent to a lit campfire (better eating). */
function isAtFoodBuilding(pawn: Pawn, gs: GameState): boolean {
    if (!pawn.position) return false;
    return (gs.buildings ?? []).some(
        (b) => b.status === 'complete' && CAMPFIRE_TYPES.includes(b.type) &&
            isAdjacent(pawn.position!.x, pawn.position!.y, b.x, b.y)
    );
}

/** True when the pawn is adjacent to a shelter (better sleep). */
function isAtRestBuilding(pawn: Pawn, gs: GameState): boolean {
    if (!pawn.position) return false;
    return (gs.buildings ?? []).some(
        (b) => b.status === 'complete' && REST_TYPES.includes(b.type) &&
            isAdjacent(pawn.position!.x, pawn.position!.y, b.x, b.y)
    );
}



function transitionTo(pawn: Pawn, state: PawnStateName, gs: GameState): GameState {
    return {
        ...gs,
        pawns: gs.pawns.map((p) =>
            p.id === pawn.id ? { ...p, currentState: state } : p
        )
    };
}

function goIdle(pawn: Pawn, gs: GameState): GameState {
    return {
        ...gs,
        pawns: gs.pawns.map((p) =>
            p.id === pawn.id
                ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined, isMoving: false, path: [] }
                : p
        )
    };
}

// ===== PER-PAWN STATE HANDLERS =====

// ===== HAULING HELPERS =====

/** Storage building types that accept deposited resources. */
const DEPOSIT_TYPES = ['storage_rack', 'campfire', 'lean_to_shelter', 'woodland_shelter', 'stone_hut'];

/**
 * Find the nearest complete storage building to deposit hauled items.
 * Falls back to any complete building if no storage type found.
 * Returns null if no buildings exist (pawn will deposit in-place).
 */
function findNearestDepositPoint(
    pawn: Pawn,
    gs: GameState
): { x: number; y: number } | null {
    if (!pawn.position) return null;
    const { x: px, y: py } = pawn.position;

    let best: { x: number; y: number; dist: number } | null = null;

    // First priority: stockpile zones designated on the map
    for (const [key, type] of Object.entries(gs.designations ?? {})) {
        if (type !== 'stockpile') continue;
        const [x, y] = key.split(',').map(Number);
        const dist = Math.abs(x - px) + Math.abs(y - py);
        if (!best || dist < best.dist) best = { x, y, dist };
    }
    if (best) return { x: best.x, y: best.y };

    // Second priority: designated storage building types
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        if (!DEPOSIT_TYPES.includes(b.type)) continue;
        const dist = Math.abs(b.x - px) + Math.abs(b.y - py);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, dist };
    }
    if (best) return { x: best.x, y: best.y };

    // Fallback: any complete building
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        const dist = Math.abs(b.x - px) + Math.abs(b.y - py);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, dist };
    }
    return best ? { x: best.x, y: best.y } : null;
}

/** Transfer everything in pawn.inventory into the correct stockpile zone. */
function depositInventory(pawn: Pawn, gs: GameState): GameState {
    const inv = pawn.inventory?.items ?? {};
    if (Object.keys(inv).length === 0) return goIdle(pawn, gs);

    // Collect all stockpile tile coordinates
    const stockpileTiles = Object.entries(gs.designations ?? {})
        .filter(([, t]) => t === 'stockpile')
        .map(([key]) => {
            const [x, y] = key.split(',').map(Number);
            return { key, x, y };
        });

    const newDropped = [...(gs.droppedItems ?? [])];

    for (const [resourceId, qty] of Object.entries(inv)) {
        if (qty <= 0) continue;

        // Try to stack onto an existing stored tile of the same type
        const existingIdx = newDropped.findIndex((d) => d.stored && d.resourceId === resourceId);
        if (existingIdx >= 0) {
            newDropped[existingIdx] = {
                ...newDropped[existingIdx],
                quantity: newDropped[existingIdx].quantity + qty
            };
        } else {
            // Find a free stockpile tile (no stored item on it yet)
            const usedCoords = new Set(newDropped.filter((d) => d.stored).map((d) => `${d.x},${d.y}`));
            const freeTile = stockpileTiles.find((t) => !usedCoords.has(t.key));
            if (freeTile) {
                newDropped.push({
                    id: `stored-${resourceId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    resourceId,
                    x: freeTile.x,
                    y: freeTile.y,
                    quantity: qty,
                    stored: true
                });
            }
            // If no free tile, items still go into the zone inventory below
        }
    }

    // Find the zone to credit: the stockpile tile adjacent to (or at) the pawn's position
    const depositTileKey = pawn.position
        ? stockpileTiles.find(({ x, y }) =>
              isAdjacent(pawn.position!.x, pawn.position!.y, x, y) ||
              (x === pawn.position!.x && y === pawn.position!.y)
          )?.key ?? null
        : null;

    const newPawns = gs.pawns.map((p) =>
        p.id === pawn.id
            ? {
                ...p,
                currentState: PAWN_STATE.IDLE,
                activeJob: undefined,
                inventory: { ...(p.inventory ?? { items: {}, maxSlots: 20, currentSlots: 0 }), items: {}, currentSlots: 0 }
            }
            : p
    );

    console.log(`[PawnSM] ${pawn.name} deposited inventory:`, inv);
    const afterDrop = { ...gs, pawns: newPawns, droppedItems: newDropped };
    return addToStockpileZone(afterDrop, depositTileKey, inv);
}

function handleHauling(pawn: Pawn, gameState: GameState): GameState {
    // Pawn just picked up an item and needs to find a deposit point
    const deposit = findNearestDepositPoint(pawn, gameState);
    if (!deposit) {
        // No building to deposit at — drop straight to stockpile
        return depositInventory(pawn, gameState);
    }

    const alreadyAdjacent = pawn.position &&
        isAdjacent(pawn.position.x, pawn.position.y, deposit.x, deposit.y);

    if (alreadyAdjacent) {
        return depositInventory(pawn, gameState);
    }

    const afterPath = pawn.position
        ? tryAssignPath(pawn, deposit.x, deposit.y, gameState)
        : null;

    if (!afterPath) {
        return depositInventory(pawn, gameState);
    }

    return {
        ...afterPath,
        pawns: afterPath.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    currentState: PAWN_STATE.MOVING_TO_DEPOSIT,
                    activeJob: {
                        type: 'need' as const,
                        targetX: deposit.x,
                        targetY: deposit.y,
                        progress: 0,
                        timeRequired: 1,
                        depositX: deposit.x,
                        depositY: deposit.y
                    }
                }
                : p
        )
    };
}

function handleMovingToDeposit(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob) return depositInventory(pawn, gameState);

    if (pawn.hasReachedDestination && pawn.position) {
        const adjacent = isAdjacent(
            pawn.position.x, pawn.position.y,
            activeJob.targetX, activeJob.targetY
        );
        if (adjacent) {
            return depositInventory(pawn, { ...gameState, pawns: gameState.pawns.map((p) => p.id === pawn.id ? { ...p, hasReachedDestination: false } : p) });
        }
        // Didn't quite make it — deposit in place anyway
        return depositInventory(pawn, gameState);
    }
    return gameState;
}

/**
 * Derive the pawn's activeEffects list from current state flags and needs.
 * Called after each tick so PawnService.calculateNeedsUpdate always reads fresh values.
 */
function syncActiveEffects(pawn: Pawn): Pawn {
    const effects: string[] = [];
    const isEating = pawn.state?.isEating || pawn.currentState === PAWN_STATE.EATING;
    const isSleeping = pawn.state?.isSleeping || pawn.currentState === PAWN_STATE.SLEEPING;

    if (isEating) effects.push('eating');
    if (isSleeping) effects.push('sleeping');
    // Only show need-state badges when the pawn is NOT already acting on them.
    // Eating supersedes hungry; sleeping supersedes tired.
    if (!isSleeping && (pawn.needs?.fatigue ?? 0) >= FATIGUE_THRESHOLD) effects.push('tired');
    if (!isEating && (pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD) effects.push('hungry');

    // Push condition stage labels as active effects (e.g. "malnutrition:moderate").
    for (const condition of (pawn.conditions ?? [])) {
        const stage = getConditionStage(condition.id, condition.severity);
        if (stage) effects.push(`${condition.id}:${stage.label}`);
    }

    const current = pawn.activeEffects ?? [];
    if (effects.length === current.length && effects.every((e, i) => e === current[i])) return pawn;
    return { ...pawn, activeEffects: effects };
}

// ===== PER-PAWN STATE HANDLERS =====

function tickPawn(pawn: Pawn, gameState: GameState): GameState {
    const state = pawn.currentState ?? PAWN_STATE.IDLE;
    switch (state) {
        case PAWN_STATE.IDLE: return handleIdle(pawn, gameState);
        case PAWN_STATE.MOVING_TO_RESOURCE: return handleMovingToResource(pawn, gameState);
        case PAWN_STATE.WORKING: return handleWorking(pawn, gameState);
        case PAWN_STATE.HUNGRY: return handleHungry(pawn, gameState);
        case PAWN_STATE.TIRED: return handleTired(pawn, gameState);
        case PAWN_STATE.MOVING_TO_NEED: return handleMovingToNeed(pawn, gameState);
        case PAWN_STATE.EATING: return handleEating(pawn, gameState);
        case PAWN_STATE.SLEEPING: return handleSleeping(pawn, gameState);
        case PAWN_STATE.HAULING: return handleHauling(pawn, gameState);
        case PAWN_STATE.MOVING_TO_DEPOSIT: return handleMovingToDeposit(pawn, gameState);
        default: return gameState;
    }
}

function handleIdle(pawn: Pawn, gameState: GameState): GameState {
    if ((pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD && hasAvailableFood(gameState)) {
        return transitionTo(pawn, PAWN_STATE.HUNGRY, gameState);
    }
    // Sleep if fatigued — pawn will collapse in-place if no shelter exists
    if ((pawn.needs?.fatigue ?? 0) >= FATIGUE_THRESHOLD) {
        return transitionTo(pawn, PAWN_STATE.TIRED, gameState);
    }

    // Don't pick jobs until the pathfinder is ready — prevents endless pick/release cycles
    if (!wasmPathfinderService.isReady()) return gameState;

    const availableJobs = jobService.getAvailableJobs(pawn, gameState);
    const job = availableJobs[0];
    if (!job) return gameState;

    let gs = jobService.claimJob(pawn.id, job.id, gameState);

    const activeJob = {
        type: job.type as 'harvest' | 'construct' | 'craft' | 'haul',
        jobId: job.id,
        targetX: job.targetX,
        targetY: job.targetY,
        resourceId: job.resourceId,
        droppedItemId: job.droppedItemId,
        buildingId: job.buildingId,
        craftQueueId: job.craftQueueId,
        progress: 0,
        timeRequired: job.workRequired
    };

    const atSite =
        job.type === 'craft' ||
        (job.targetX === 0 && job.targetY === 0) || // abstract building placed off-map
        (pawn.position && isAdjacent(pawn.position.x, pawn.position.y, job.targetX, job.targetY));

    if (atSite) {
        return {
            ...gs,
            pawns: gs.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.WORKING, activeJob }
                    : p
            )
        };
    }

    const afterPath = tryAssignPath(pawn, job.targetX, job.targetY, gs);
    if (!afterPath) {
        return jobService.releaseJob(pawn.id, job.id, gs);
    }

    return {
        ...afterPath,
        pawns: afterPath.pawns.map((p) =>
            p.id === pawn.id
                ? { ...p, currentState: PAWN_STATE.MOVING_TO_RESOURCE, activeJob }
                : p
        )
    };
}

function handleMovingToResource(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob || activeJob.type === 'need') return goIdle(pawn, gameState);

    const jobInPool = activeJob.jobId
        ? (gameState.jobs ?? []).find((j) => j.id === activeJob.jobId)
        : null;
    if (!jobInPool) return goIdle(pawn, gameState);

    if (pawn.hasReachedDestination && pawn.position) {
        const adjacent = isAdjacent(
            pawn.position.x, pawn.position.y,
            activeJob.targetX, activeJob.targetY
        );
        if (adjacent) {
            return {
                ...gameState,
                pawns: gameState.pawns.map((p) =>
                    p.id === pawn.id
                        ? { ...p, currentState: PAWN_STATE.WORKING, hasReachedDestination: false }
                        : p
                )
            };
        }
        return goIdle(pawn, gameState);
    }
    return gameState;
}

function handleWorking(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob || activeJob.type === 'need') return goIdle(pawn, gameState);

    const jobId = activeJob.jobId;
    if (!jobId) return goIdle(pawn, gameState);

    const jobInPool = (gameState.jobs ?? []).find((j) => j.id === jobId);
    if (!jobInPool) return goIdle(pawn, gameState);

    // Critical needs: pawn drops the job and attends to survival immediately
    if ((pawn.needs?.hunger ?? 0) >= CRITICAL_HUNGER && hasAvailableFood(gameState)) {
        const gs = jobService.releaseJob(pawn.id, jobId, gameState);
        return transitionTo(pawn, PAWN_STATE.HUNGRY, gs);
    }
    if ((pawn.needs?.fatigue ?? 0) >= CRITICAL_FATIGUE) {
        const gs = jobService.releaseJob(pawn.id, jobId, gameState);
        return transitionTo(pawn, PAWN_STATE.TIRED, gs);
    }

    if (
        activeJob.type !== 'craft' &&
        !(activeJob.targetX === 0 && activeJob.targetY === 0) && // abstract building
        pawn.position &&
        !isAdjacent(pawn.position.x, pawn.position.y, activeJob.targetX, activeJob.targetY)
    ) {
        return jobService.releaseJob(pawn.id, jobId, goIdle(pawn, gameState));
    }

    const afterAdvance = jobService.advanceJob(jobId, BASE_WORK_RATE, gameState);
    const jobStillExists = (afterAdvance.jobs ?? []).some((j) => j.id === jobId);

    if (!jobStillExists) {
        // Job complete. If pawn is now carrying items, enter HAULING state.
        const updatedPawn = afterAdvance.pawns.find((p) => p.id === pawn.id);
        const invItems = updatedPawn?.inventory?.items ?? {};
        const hasInventory = Object.values(invItems).some((v) => v > 0);
        console.log(`[WORKING-DONE] ${pawn.name} job finished — hasInventory=${hasInventory} inv=`, JSON.stringify(invItems));

        if (hasInventory) {
            // Transition to HAULING — handleHauling will run next turn and find a deposit point.
            // This ensures items are visible in the CARRYING section for at least one turn.
            console.log(`[WORKING-DONE] ${pawn.name} entering HAULING state with inv=`, JSON.stringify(invItems));
            return {
                ...afterAdvance,
                pawns: afterAdvance.pawns.map((p) =>
                    p.id === pawn.id
                        ? { ...p, currentState: PAWN_STATE.HAULING, activeJob: undefined }
                        : p
                )
            };
        }

        return {
            ...afterAdvance,
            pawns: afterAdvance.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
            )
        };
    }

    const updatedJob = (afterAdvance.jobs ?? []).find((j) => j.id === jobId);
    const progress = updatedJob
        ? Math.min(1, updatedJob.workDone / updatedJob.workRequired)
        : activeJob.progress;

    return {
        ...afterAdvance,
        pawns: afterAdvance.pawns.map((p) =>
            p.id === pawn.id
                ? { ...p, activeJob: { ...activeJob, progress } }
                : p
        )
    };
}

function handleHungry(pawn: Pawn, gameState: GameState): GameState {
    const meal = selectFoodForMeal(pawn, gameState);
    if (meal.length === 0) {
        return transitionTo(pawn, PAWN_STATE.IDLE, gameState);
    }

    // Phase 6: try to pathfind to the nearest campfire — eat there for better recovery speed
    const storageBuilding = findNearestStorageBuilding(pawn, gameState);
    if (
        storageBuilding &&
        pawn.position &&
        !isAdjacent(pawn.position.x, pawn.position.y, storageBuilding.x, storageBuilding.y)
    ) {
        const afterPath = tryAssignPath(pawn, storageBuilding.x, storageBuilding.y, gameState);
        if (afterPath) {
            // Food is NOT consumed yet — it will be taken on arrival at the campfire.
            return {
                ...afterPath,
                pawns: afterPath.pawns.map((p) =>
                    p.id === pawn.id
                        ? {
                            ...p,
                            currentState: PAWN_STATE.MOVING_TO_NEED,
                            activeJob: {
                                type: 'need' as const,
                                targetX: storageBuilding.x,
                                targetY: storageBuilding.y,
                                progress: 0,
                                timeRequired: EATING_TURNS,
                                turnsInState: 0,
                                targetState: PAWN_STATE.EATING
                            }
                        }
                        : p
                )
            };
        }
    }

    // Eat in place: consume all selected food now, then sit and eat for EATING_TURNS_GROUND turns.
    const { state: afterMeal, hungerRecovered } = consumeMeal(meal, gameState);
    return {
        ...afterMeal,
        pawns: afterMeal.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    currentState: PAWN_STATE.EATING,
                    activeJob: {
                        type: 'need' as const,
                        targetX: p.position?.x ?? 0,
                        targetY: p.position?.y ?? 0,
                        progress: 0,
                        timeRequired: EATING_TURNS_GROUND,
                        turnsInState: 0,
                        hungerToRecover: hungerRecovered
                    }
                }
                : p
        )
    };
}

function handleTired(pawn: Pawn, gameState: GameState): GameState {
    // Phase 6: try to pathfind to the nearest rest building to sleep there
    const restBuilding = findNearestRestBuilding(pawn, gameState);
    if (
        restBuilding &&
        pawn.position &&
        !isAdjacent(pawn.position.x, pawn.position.y, restBuilding.x, restBuilding.y)
    ) {
        const afterPath = tryAssignPath(pawn, restBuilding.x, restBuilding.y, gameState);
        if (afterPath) {
            return {
                ...afterPath,
                pawns: afterPath.pawns.map((p) =>
                    p.id === pawn.id
                        ? {
                            ...p,
                            currentState: PAWN_STATE.MOVING_TO_NEED,
                            activeJob: {
                                type: 'need' as const,
                                targetX: restBuilding.x,
                                targetY: restBuilding.y,
                                progress: 0,
                                timeRequired: SLEEPING_TURNS,
                                turnsInState: 0,
                                targetState: PAWN_STATE.SLEEPING
                            }
                        }
                        : p
                )
            };
        }
    }

    // Fallback: sleep in place
    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    currentState: PAWN_STATE.SLEEPING,
                    activeJob: {
                        type: 'need' as const,
                        targetX: p.position?.x ?? 0,
                        targetY: p.position?.y ?? 0,
                        progress: 0,
                        timeRequired: SLEEPING_TURNS,
                        turnsInState: 0
                    }
                }
                : p
        )
    };
}

function handleMovingToNeed(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob) return goIdle(pawn, gameState);
    if (pawn.hasReachedDestination && pawn.position) {
        const targetState = (activeJob.targetState ?? PAWN_STATE.EATING) as PawnStateName;
        if (targetState === PAWN_STATE.EATING) {
            // Arrived at campfire — now select and consume the full meal, then start eating.
            const meal = selectFoodForMeal(pawn, gameState);
            if (meal.length === 0) return goIdle(pawn, gameState);
            const { state: afterMeal, hungerRecovered } = consumeMeal(meal, gameState);
            return {
                ...afterMeal,
                pawns: afterMeal.pawns.map((p) =>
                    p.id === pawn.id
                        ? {
                            ...p,
                            currentState: PAWN_STATE.EATING,
                            hasReachedDestination: false,
                            activeJob: {
                                ...activeJob,
                                timeRequired: EATING_TURNS,
                                turnsInState: 0,
                                hungerToRecover: hungerRecovered
                            }
                        }
                        : p
                )
            };
        }
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: targetState, hasReachedDestination: false }
                    : p
            )
        };
    }
    return gameState;
}

function handleEating(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
    const eatDuration = activeJob?.timeRequired ?? EATING_TURNS_GROUND;
    // Distribute the pre-paid hunger recovery evenly over the eating duration.
    const totalHunger = activeJob?.hungerToRecover ?? 0;
    const hungerRecoveryThisTurn = totalHunger / eatDuration;
    const newHunger = Math.max(0, (pawn.needs?.hunger ?? 50) - hungerRecoveryThisTurn);

    const updatedNeeds = {
        ...(pawn.needs ?? { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }),
        hunger: newHunger,
        lastMeal: gameState.turn
    };
    const updatedState = {
        ...(pawn.state ?? { mood: 50, health: 100, isWorking: false, isSleeping: false, isEating: false }),
        isEating: turnsInState < eatDuration
    };

    if (turnsInState >= eatDuration) {
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, needs: updatedNeeds, state: updatedState, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
            )
        };
    }

    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    needs: updatedNeeds,
                    state: updatedState,
                    activeJob: activeJob
                        ? { ...activeJob, turnsInState, progress: turnsInState / eatDuration }
                        : undefined
                }
                : p
        )
    };
}

function handleSleeping(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
    const atShelter = isAtRestBuilding(pawn, gameState);
    const fatigueRecovery = atShelter ? FATIGUE_PER_SLEEPING_TURN : FATIGUE_PER_SLEEPING_GROUND;
    const sleepDuration = atShelter ? SLEEPING_TURNS : SLEEPING_TURNS_GROUND; // for progress bar only
    const newFatigue = Math.max(0, (pawn.needs?.fatigue ?? 50) - fatigueRecovery);
    const newSleep = Math.max(0, (pawn.needs?.sleep ?? 50) - fatigueRecovery);

    // Wake when fatigue drops to the threshold for current hunger level.
    // Fed pawns sleep to 0 (full rest). Hungry pawns wake at 30 so they can eat,
    // but won't immediately re-sleep since 30 < FATIGUE_THRESHOLD (80).
    const wakeThreshold = (pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD
        ? SLEEP_WAKE_THRESHOLD_HUNGRY
        : SLEEP_WAKE_THRESHOLD_FED;
    const shouldWake = newFatigue <= wakeThreshold;

    const updatedNeeds = {
        ...(pawn.needs ?? { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }),
        fatigue: newFatigue,
        sleep: newSleep,
        lastSleep: gameState.turn
    };
    const updatedState = {
        ...(pawn.state ?? { mood: 50, health: 100, isWorking: false, isSleeping: false, isEating: false }),
        isSleeping: !shouldWake
    };

    if (shouldWake) {
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, needs: updatedNeeds, state: updatedState, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
            )
        };
    }

    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    needs: updatedNeeds,
                    state: updatedState,
                    activeJob: activeJob
                        ? { ...activeJob, turnsInState, progress: turnsInState / sleepDuration }
                        : undefined
                }
                : p
        )
    };
}

// ===== STATE MACHINE SERVICE =====

class PawnStateMachineImpl {
    /**
     * Run one turn tick for every pawn.
     * Called from GameEngineImpl.processPawns() AFTER processMovement().
     */
    tick(gameState: GameState): GameState {
        let state = gameState;
        for (const pawn of state.pawns) {
            const current = state.pawns.find((p) => p.id === pawn.id);
            if (!current) continue;
            // Skip dead pawns entirely.
            if (current.isAlive === false) continue;

            // Tick conditions (malnutrition, blood loss, limb checks) — may kill pawn.
            state = tickConditions(current, state);
            // Re-fetch pawn in case tickConditions updated it.
            const afterConditions = state.pawns.find((p) => p.id === pawn.id);
            if (!afterConditions || afterConditions.isAlive === false) continue;

            // Exhaustion collapse: fatigue >= 100 → force sleeping on the ground.
            let forCollapse = afterConditions;
            if ((forCollapse.needs?.fatigue ?? 0) >= 100 && forCollapse.currentState !== PAWN_STATE.SLEEPING) {
                forCollapse = {
                    ...forCollapse,
                    currentState: PAWN_STATE.SLEEPING,
                    activeJob: undefined,
                    state: { ...forCollapse.state, isSleeping: true, isWorking: false, isEating: false }
                };
                state = { ...state, pawns: state.pawns.map((p) => p.id === pawn.id ? forCollapse : p) };
            }

            // Run state machine for this pawn.
            state = tickPawn(forCollapse, state);
            // Sync activeEffects from the new state so PawnService reads fresh values.
            const updated = state.pawns.find((p) => p.id === pawn.id);
            if (updated) {
                const synced = syncActiveEffects(updated);
                if (synced !== updated) {
                    state = { ...state, pawns: state.pawns.map((p) => p.id === pawn.id ? synced : p) };
                }
            }
        }
        return state;
    }
}

export const pawnStateMachineService = new PawnStateMachineImpl();
