// Entity AI / FSM brain — per-tick stepping for hostile mobs and neutral animals (wander, flee,
// hunt, forage, sleep) plus the feeding sub-steppers. Extracted from EntityService (P-4).
import type { GameState, Mob, MobState, Pawn } from '../../core/types';
import { getCreatureById, type CreatureDefinition } from '../../core/Creatures';
import { getAmbientLight, computeTileLightLevel, weatherSightMul } from '../EnvironmentService';
import { effectiveVisionRange } from '../../core/vision';
import { ticksFromSeconds, SECONDS_PER_TICK } from '../../core/time';
import { calcMaxStamina } from '../../entities/Pawns';
import { gameLogger } from '../../dev/gameLogger';
import { rng } from '../../core/rng';
import { markTileDirty } from '../../core/tileDeltas';
import { consumeTop } from '../../core/carcassCondition';
import { resourceObjectService } from '../ResourceObjectService';
import {
  nearestPawn,
  dist,
  adjacent,
  moveToward,
  fleeToSafety,
  wanderStep,
  nearestPredatorThreat,
  findNearestPrey,
  findNearestFoodTile,
  findReachableFoodTile,
  huntAttacker,
  approachForMelee,
  edibleResourceOnTile,
  mobInLiveRegion,
  isThinkTick
} from './entityHelpers';
import {
  type TileFoodKind,
  NIGHT_THRESHOLD,
  STARVATION_COLLAPSE_SEVERITY,
  FLEE_HEALTH_FRACTION,
  HUNGER_SATED_THRESHOLD,
  HUNGER_EAT_THRESHOLD,
  willFinishOffDowned,
  FORAGE_RADIUS,
  LIVE_RADIUS,
  THREAT_INTERRUPT_RANGE,
  SLEEP_FATIGUE_THRESHOLD,
  SLEEP_MAX_HUNGER,
  SAFE_RESET_TICKS,
  STARTLED_TICKS,
  FLEE_STAMINA_DRAIN_PER_SECOND,
  sleepWakeThreshold,
  EAT_GRASS_SECONDS,
  EAT_CORPSE_SECONDS,
  EAT_GRASS_HUNGER_RESTORE,
  EAT_CORPSE_HUNGER_RESTORE,
  EAT_FORAGE_HUNGER_RESTORE,
  CORPSE_PORTION,
  HUNT_COOLDOWN_SECONDS,
  FORAGE_COOLDOWN_SECONDS,
  HUNT_GIVE_UP_SECONDS,
  WILD_FORAGE_RESOURCE_IDS
} from './entityConstants';

// ENGINE-PERFORMANCE-II §S5: cap how many mobs may be in an ACTIVE live-prey hunt at once, so a
// synchronized hunger wave can't dump hundreds of simultaneous engagements onto one tick (the combat
// spike that collapsed TPS and starved the pause message). New OFFENSIVE hunts (a hungry mob choosing
// live prey) are gated by a per-tick slot budget = cap − (mobs already Hunting/Attacking); when it's
// exhausted, the would-be hunter stays put and retries next tick, so hunts smear across ticks instead
// of all firing at once. Corpse-scavenging (no combat) and resuming an EXISTING fight are never gated.
// Cap scales with population (with a floor) so the ecosystem still predates healthily — it bounds the
// worst case, not normal play.
let _huntSlots = 0;
function takeHuntSlot(): boolean {
  if (_huntSlots <= 0) return false;
  _huntSlots--;
  return true;
}
// When the hunt budget is full, a denied hunter backs off for a JITTERED interval before re-scanning
// for prey — so (a) it doesn't re-run the O(prey) `findNearestPrey` EVERY tick (that's the O(N²) we're
// avoiding), and (b) the denied hunters don't all retry on the SAME tick and re-form the wave. Random
// spread is the important bit; the floor just guarantees it's never per-tick. Tunable.
const HUNT_BUSY_BACKOFF_MIN_S = 4;
const HUNT_BUSY_BACKOFF_JITTER_S = 16;

// ── Stuck-mob diagnostics (debug-only, → .debug/ai.log) ─────────────────────────────────────────
// Targeted detector for the "frozen in place" pathology. Tracks each mob's position frame-to-frame;
// when one sits still while in a state that SHOULD be moving, it dumps exactly WHY in one line:
//   • next=(x,y)[..] — what occupies its next path cell: free / a live mob (kind#id+state) / corpse /
//     wall. A live packmate here = pack gridlock; 'free' but not moving = a stalled cost budget.
//   • blockedTicks / costLeft — is the deadlock breaker climbing, and is sub-tile cost progressing?
//   • adjCorpse / corpse5 — is an edible carcass adjacent/near that it's ignoring (the eat-state theory)?
// Worker-only Map, never snapshotted; the whole thing no-ops unless gameLogger.isEnabled.
// OFF by default: the per-stuck-mob cellDesc + nearbyCorpse scans are O(mobs) each, so a freeze with
// many stuck mobs turns this O(mobs²) and craters TPS (measured 60→1 during the #1816 freeze). Flip to
// true only to diagnose a fresh freeze, then flip back.
const STUCK_TRACE_ENABLED = false;
const _posTrack = new Map<string, { x: number; y: number; since: number; lastLog: number }>();
const STUCK_LOG_AFTER = 60; // ticks unmoved (~1 s) before a moving-state mob counts as stuck
const STUCK_LOG_EVERY = 180; // re-log a still-stuck mob at most this often (~3 s)
const STUCK_MOVING_STATES = new Set<MobState>([
  'Wander',
  'Hunting',
  'Fleeing',
  'Alerted',
  'Foraging',
  'Grazing',
  'Startled'
]);

/** Describe whatever occupies (x,y): wall / pawn / a live mob (kind#id + state) / corpse / free. */
function cellDesc(state: GameState, x: number, y: number, selfId: string): string {
  const tile = state.worldMap[y]?.[x];
  if (!tile || !tile.walkable) return 'wall';
  for (const p of state.pawns)
    if (p.isAlive !== false && p.position?.x === x && p.position?.y === y)
      return `pawn#${p.id.slice(-6)}`;
  for (const m of state.mobs ?? []) {
    if (m.id === selfId || m.x !== x || m.y !== y) continue;
    if (m.state === 'Corpse') return `corpse#${m.id.slice(-6)}`;
    return `${getCreatureById(m.creatureId)?.id ?? 'mob'}#${m.id.slice(-6)}(${m.state})`;
  }
  return 'free';
}

/** Nearest EDIBLE corpse within Chebyshev `r` of the mob (tests the "ignoring the carcass" theory). */
function nearbyCorpse(state: GameState, mob: Mob, r: number): string {
  for (const m of state.mobs ?? []) {
    if (m.state !== 'Corpse' || (m.intactness ?? 1) <= 0) continue;
    const d = Math.max(Math.abs(m.x - mob.x), Math.abs(m.y - mob.y));
    if (d <= r) return `(${m.x},${m.y})d=${d}i=${(m.intactness ?? 1).toFixed(2)}`;
  }
  return 'no';
}

function traceStuck(mob: Mob, def: CreatureDefinition, state: GameState, turn: number): void {
  if (!STUCK_TRACE_ENABLED || !gameLogger.isEnabled) return;
  if (_posTrack.size > 8000) _posTrack.clear(); // bound: forget dead/old mobs wholesale (debug tool)
  const rec = _posTrack.get(mob.id);
  if (!rec || rec.x !== mob.x || rec.y !== mob.y) {
    _posTrack.set(mob.id, { x: mob.x, y: mob.y, since: turn, lastLog: 0 });
    return; // moved (or first sight) — reset the stuck clock
  }
  const stuckFor = turn - rec.since;
  if (stuckFor < STUCK_LOG_AFTER || !STUCK_MOVING_STATES.has(mob.state)) return;
  if (rec.lastLog && turn - rec.lastLog < STUCK_LOG_EVERY) return;
  rec.lastLog = turn;
  const pathLen = mob.path?.length ?? 0;
  const nextCell = pathLen > 0 ? mob.path![mob.pathIndex ?? 0] : null;
  const nextDesc = nextCell
    ? `next=(${nextCell.x},${nextCell.y})[${cellDesc(state, nextCell.x, nextCell.y, mob.id)}]`
    : 'next=NONE';
  gameLogger.log(
    turn,
    'ENTITY-STUCK',
    `${def.id}#${mob.id.slice(-6)} STUCK ${stuckFor}t @(${mob.x},${mob.y}) state=${mob.state}` +
      ` hunger=${mob.needs.hunger.toFixed(1)}/${HUNGER_EAT_THRESHOLD} blockedTicks=${mob.blockedTicks ?? 0}` +
      ` costLeft=${(mob.nextCellCostLeft ?? 0).toFixed(1)} path=${pathLen > 0 ? `${mob.pathIndex ?? 0}/${pathLen}` : 'none'}` +
      ` ${nextDesc} adjCorpse=${nearbyCorpse(state, mob, 1)} corpse5=${nearbyCorpse(state, mob, 5)}` +
      (mob.huntTargetId ? ` prey=${mob.huntTargetId.slice(-6)}` : '')
  );
}

export function stepEntities(state: GameState): GameState {
  const mobs = state.mobs;
  if (!mobs || mobs.length === 0) return state;
  const turn = state.turn;

  // §S5: refill the per-tick hunt budget. Count mobs ALREADY engaged so the cap is on the concurrent
  // total, not just new starts. O(mobs) once/tick — cheap.
  let activeHunts = 0;
  for (const m of mobs) if (m.state === 'Hunting' || m.state === 'Attacking') activeHunts++;
  const MAX_CONCURRENT_HUNTS = Math.max(40, Math.floor(mobs.length * 0.15));
  _huntSlots = Math.max(0, MAX_CONCURRENT_HUNTS - activeHunts);

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

  const lodActive = livePawns.length > 0; // no pawns (test / game-over) ⇒ no bubble ⇒ sim everything

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
    // §LOD temporal throttle: INSIDE the complexity bubble a mob thinks every tick (full accuracy).
    // OUTSIDE, it runs the full FSM only on its staggered think-tick (~once/AI_THROTTLE_TICKS) OR if a
    // predator is within THREAT_INTERRUPT_RANGE (the cheap per-tick interrupt, so fleeing isn't delayed).
    // Between thinks it holds state and just follows its path via advanceMobMovement — decisions slow,
    // motion + combat stay per-tick. THE scaling lever: stepOne (FSM + A*) runs for the handful near the
    // colony + ~mobs/N elsewhere, not all ~900. No live pawns (test / game-over) ⇒ no bubble ⇒ all sim.
    const inBubble = !lodActive || mobInLiveRegion(mob, livePawns, LIVE_RADIUS);
    if (
      !inBubble &&
      !isThinkTick(mob.id, turn) &&
      !nearestPredatorThreat(mob, def, mobs, THREAT_INTERRUPT_RANGE)
    ) {
      next[i] = mob; // throttled this tick — keep state; movement + combat run per-tick elsewhere
      continue;
    }
    const stepped = stepOne(
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
    const ticked = tickMobConditionTimers(stepped);
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
        const candidates = limbs.filter((l) => !l.isMissing && l.id !== 'head' && l.id !== 'torso');
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

  // A scavenger that ate a corpse also erodes the matching ON-GROUND carcass item's TOP unit (the
  // carcass drop id encodes the mob id). Consumption touches only the top unit — environmental rot
  // (stepItemDecay) is what erodes the whole stack. Once hauled into the colony the carcass is merged
  // and no longer id-matches, so this only bites the loose carcass a wild scavenger could reach.
  if (pendingMeatConsumption.size > 0 && finalState.droppedItems?.length) {
    let touched = false;
    const drops = finalState.droppedItems
      .map((d) => {
        if (!d.unitConditions?.length) return d;
        for (const [mobId, consumed] of pendingMeatConsumption) {
          if (d.id.startsWith(`carcass-${mobId}-`)) {
            const { conditions, removed } = consumeTop(d.unitConditions, consumed * 100);
            touched = true;
            return { ...d, quantity: Math.max(0, d.quantity - removed), unitConditions: conditions };
          }
        }
        return d;
      })
      .filter((d) => !(d.unitConditions && (d.quantity ?? 0) <= 0));
    if (touched) finalState = { ...finalState, droppedItems: drops };
  }

  // Apply foraging tile depletions IN PLACE + mark them dirty (§D — ADR-002 amendment, like §C
  // regrowth / harvest completion). The old code rebuilt the ENTIRE 38k-tile worldMap via `.map()`
  // *once per depletion inside this loop* — with 140 mobs foraging that flipped the worldMap ref
  // several times per tick, each one forcing a full worldMap re-clone across the worker boundary AND
  // a full terrain rebuild. Now each depleted tile mutates in place and ships as a `worldMapDelta`.
  for (const { x, y, id } of pendingTileDepletion) {
    const tile = finalState.worldMap[y]?.[x];
    if (!tile) continue;
    const current = tile.resources?.[id] ?? 0;
    if (current <= 0) continue;
    tile.resources = { ...tile.resources, [id]: Math.max(0, current - 1) };
    // §F: an animal grazing an unprotected CROP knocks it back to 1% — a death that (like frost/drought)
    // does NOT wear the soil (only reaped crops do). Wild grazeables (grass) are unaffected.
    if (tile.growth && id in tile.growth && resourceObjectService.getById(id)?.crop) {
      tile.growth[id] = 1;
    }
    markTileDirty(y, x, tile);
  }

  return finalState;
}

export function stepOne(
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

  // Per-tick stuck-mob detector — OFF by default (STUCK_TRACE_ENABLED); flip on to diagnose freezes.
  if (STUCK_TRACE_ENABLED) traceStuck(mob, def, state, turn);

  // Periodic entity-state snapshot — every 300 turns (~5 s at 60 tps).
  if (turn % 300 === 0) {
    const pathLen = mob.path?.length ?? 0;
    const pathIdx = mob.pathIndex ?? 0;
    gameLogger.log(
      turn,
      'ENTITY-STATE',
      `${def.id}#${mob.id.slice(-6)} state=${mob.state} pos=(${mob.x},${mob.y})` +
        ` hunger=${mob.needs.hunger.toFixed(1)} fatigue=${mob.needs.fatigue.toFixed(1)}` +
        ` blockedTicks=${mob.blockedTicks ?? 0} costLeft=${(mob.nextCellCostLeft ?? 0).toFixed(1)}` +
        ` path=${pathLen > 0 ? `${pathIdx}/${pathLen} end=(${mob.path![pathLen - 1].x},${mob.path![pathLen - 1].y})` : 'none'}` +
        (mob.huntTargetId ? ` prey=${mob.huntTargetId.slice(-6)}` : '')
    );
  }

  // Starvation collapse: gated on the data-driven `malnutrition` condition (driven from hunger in
  // entityLifecycle.stepHunger, the SAME model pawns use), NOT on raw hunger. Only once malnutrition
  // reaches its severe, life-threatening stage is the entity too weak to act — it stops
  // fleeing/hunting/wandering, lies in place (path cleared), and dies when malnutrition hits lethal
  // severity. Because malnutrition onsets at hunger 87 and accrues slowly, this takes in-game DAYS of
  // starving — it no longer drops a mob mid-hunt the instant hunger crosses 80.
  const malnutritionSeverity = mob.conditions?.find((c) => c.id === 'malnutrition')?.severity ?? 0;
  if (malnutritionSeverity >= STARVATION_COLLAPSE_SEVERITY) {
    if (mob.state === 'Collapsed') return mob;
    return {
      ...mob,
      state: 'Collapsed',
      stateSince: turn,
      path: [],
      huntTargetId: undefined,
      eatProgress: undefined
    };
  }
  // Recovered (e.g. fed enough to drop below the severe stage): resume normal behaviour.
  if (mob.state === 'Collapsed') {
    return { ...mob, state: 'Wander', stateSince: turn };
  }

  // A downed (Collapsed) pawn is a threat/target ONLY to a hungry finisher (a predator that eats it);
  // for everyone else it's invisible to threat detection, so they never alert on it (and so never
  // oscillate Wander↔Alerted beside the body) — they just keep wandering off. Finishers still see + engage.
  const finisher = willFinishOffDowned(mob.needs.hunger ?? 0, def);
  const nearest = nearestPawn(mob, pawns, !finisher);
  // §G shared vision: perception-based range scaled by this tile's light + the mob's night_vision,
  // computed ONCE here and threaded into the FSM (so darkness shortens detection without recomputing
  // the light per check). Daytime with nightVision 0 ≈ the old def.stats.visionRange.
  const tileLight = computeTileLightLevel(turn, state.buildings ?? [], mob.x, mob.y);
  // Weather shortens detection too (fog/storm/blizzard — SEASONS_WEATHER): folds into the shared
  // vision model so both this mob's sight and (via the same fn) pawn detection degrade in murk.
  const visionRange = effectiveVisionRange(mob, tileLight, weatherSightMul(state.weather?.type));
  const inVision = nearest && dist(mob, nearest.pos) <= visionRange ? nearest : null;
  const isNight = getAmbientLight(turn) < NIGHT_THRESHOLD;

  // Passive creatures (herbivores, timid omnivores) use the prey FSM.
  // Neutral/aggressive creatures with fight potential use the hostile FSM.
  if (def.behaviour === 'passive') {
    return stepAnimal(
      mob,
      def,
      inVision,
      nearest,
      visionRange,
      turn,
      state,
      allMobs,
      pendingDamage,
      pendingMeatConsumption,
      pendingTileDepletion,
      pendingMobState
    );
  }
  return stepHostile(
    mob,
    def,
    inVision,
    nearest,
    visionRange,
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

export function tickMobConditionTimers(mob: Mob): Mob {
  const durations = mob.conditionTimers;
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
  const transientConditions = (mob.transientConditions ?? []).filter((e) => next[e] !== undefined);
  return { ...mob, conditionTimers: next, transientConditions };
}

/** Chebyshev distance between two points (matches `dist`'s metric) — for lair-anchor checks. */
function chebDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Nearest pawn POSITION this mob may actually engage: skips downed (Collapsed) pawns UNLESS `finisher`
 *  (a hungry predator that finishes them off). Manhattan, mirroring nearestPawn. Null when nothing is
 *  engageable — the signal for an Alerted/Attacking mob to disengage and wander instead of freezing over
 *  an unconscious body. */
function nearestEngageablePos(
  mob: Mob,
  pawns: Pawn[],
  finisher: boolean
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (let i = 0; i < pawns.length; i++) {
    const p = pawns[i];
    if (p.isAlive === false || !p.position) continue;
    if (!finisher && p.currentState === 'Collapsed') continue;
    const d = Math.abs(p.position.x - mob.x) + Math.abs(p.position.y - mob.y);
    if (d < bd) {
      bd = d;
      best = p.position;
    }
  }
  return best;
}

export function stepHostile(
  mob: Mob,
  def: CreatureDefinition,
  inVision: { pos: { x: number; y: number } } | null,
  nearest: { pos: { x: number; y: number } } | null,
  visionRange: number,
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
    return {
      ...mob,
      state: 'Fleeing',
      stateSince: turn,
      eatProgress: undefined,
      huntTargetId: undefined,
      path: []
    };
  }

  // ── Territory leash (lair system) ───────────────────────────────────────
  // A laired mob that has strayed beyond its leash — drifted while wandering, or over-chased a target
  // — abandons whatever it's doing and heads home. Fleeing/Exhausted are exempt: survival overrides
  // territory. This (plus the Wander aggro gate below) keeps each pack penned to its lair, so the map
  // isn't a churning mass of 300 free-hunting hostiles.
  if (
    mob.lairId != null &&
    mob.state !== 'Fleeing' &&
    mob.state !== 'Exhausted' &&
    chebDist(mob.x, mob.y, mob.lairX ?? mob.x, mob.lairY ?? mob.y) > (mob.lairRange ?? Infinity)
  ) {
    // NB: do NOT clear `path` here. moveToward→stepDirectional preserves nextCellCostLeft only when the
    // re-issued step matches the current path's next cell (its anti-reset guard). Blanking the path
    // every tick defeats that guard, so the sub-tile cost budget is wiped each tick and a mob whose
    // per-tile cost exceeds one tick's movement budget (any normal/diagonal tile) can NEVER finish a
    // step — it freezes on the leash boundary (the #1816–1821 column freeze). Letting stepDirectional
    // own the path resets the cost ONCE (when abandoning a hunt path for home) then accumulates.
    return moveToward(
      {
        ...mob,
        state: 'Wander',
        stateSince: turn,
        huntTargetId: undefined,
        eatProgress: undefined
      },
      { x: mob.lairX!, y: mob.lairY! },
      state
    );
  }

  // Huntable neutral animals (boar, elk, etc.) also react to predators and pack deaths.
  // They flee from flagged predators just like passive animals do, and panic when
  // they see a corpse of the same species within vision range.
  if (def.huntable && mob.state !== 'Fleeing' && mob.state !== 'Attacking') {
    const predThreat = nearestPredatorThreat(mob, def, allMobs, visionRange);
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
        dist(mob, { x: m.x, y: m.y }) <= visionRange
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
      return stepForaging(mob, def, turn, state, pendingTileDepletion);
    }
    return stepHunting(
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
  const huntCooldownExpired = !mob.huntCooldownUntil || turn >= mob.huntCooldownUntil;
  const forageCooldownExpired = !mob.forageCooldownUntil || turn >= mob.forageCooldownUntil;
  // food_overflow: a laired predator hunts opportunistically BEFORE it's fully hungry — the buffer
  // lowers the eat threshold by that fraction, so prey (or a pawn) wandering into its turf is fair game.
  const eatThreshold = HUNGER_EAT_THRESHOLD * (1 - (def.foodOverflow ?? 0));
  if (
    !inVision &&
    mob.needs.hunger >= eatThreshold &&
    mob.state !== 'Fleeing' &&
    mob.state !== 'Sleeping' &&
    mob.state !== 'Attacking' &&
    mob.state !== 'Alerted'
    // (Hunting/Eating/Foraging already excluded by the early-return guard above.) Attacking/Alerted
    // are ACTIVE engagements — feeding must NOT preempt them. A hungry hunter fighting a prey MOB has
    // no pawn in vision (inVision is pawn-only), so without this guard it got ejected into Foraging/
    // Hunting every tick → the Wander↔Hunting oscillation reported mid-engagement. The sleep gate
    // below already excludes these two states for the same reason.
  ) {
    // Forage real food (and graze, for herbivores) first; fall back to hunting live
    // prey or scavenging a corpse only if nothing forageable is in range. A creature
    // can scavenge (`eats` includes meat/organic) without being a hunter — only
    // `predator`/`carnivore` mobs will go after LIVE prey.
    const tileKinds = new Set<TileFoodKind>();
    if (def.grazes) tileKinds.add('grass');
    if (def.eats.includes('food')) tileKinds.add('forage');
    const canForage = tileKinds.size > 0;
    const canScavengeOrHunt = canHunt || def.eats.includes('meat') || def.eats.includes('organic');
    const forageReachable = () =>
      canForage &&
      forageCooldownExpired &&
      findNearestFoodTile(state, mob.x, mob.y, FORAGE_RADIUS, tileKinds) !== null;
    const tryHunt = (): Mob | null => {
      // Honor the post-give-up cooldown, exactly as stepAnimal does — re-entering Hunting the tick
      // after bailing an unreachable hunt was the other half of the oscillation for hostile mobs.
      if (!canScavengeOrHunt || !huntCooldownExpired) return null;
      const prey = findNearestPrey(mob, allMobs, canHunt);
      if (!prey) return null;
      // §S5: a LIVE-prey hunt is combat — gate it on the concurrent-hunt budget so a hunger wave
      // doesn't engage hundreds at once. Corpse-scavenging (prey is a Corpse) is cheap, never gated.
      if (prey.state !== 'Corpse' && !takeHuntSlot()) {
        // Budget full → stamp a JITTERED backoff IN PLACE (ADR-002; it's a scalar cold field) so we
        // don't re-run the O(prey) findNearestPrey every tick and so denied hunters don't all retry on
        // one tick — then return null so the mob STILL WANDERS this tick (the cooldown carries through
        // the wander's `{...mob}` spread). Returning a non-Hunting mob here FROZE denied hunters.
        mob.huntCooldownUntil =
          turn + ticksFromSeconds(HUNT_BUSY_BACKOFF_MIN_S + rng.random() * HUNT_BUSY_BACKOFF_JITTER_S);
        return null;
      }
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
        !aggressive && inVision && dist(mob, inVision.pos) <= Math.ceil(visionRange * 0.5);
      // Territory: a laired mob only engages a pawn that's INSIDE its lair's range. Pawns passing
      // outside the territory are seen but ignored — so the player can travel safely between lairs and
      // only triggers a pack by entering its turf.
      const pawnInTerritory =
        !inVision ||
        mob.lairId == null ||
        chebDist(mob.lairX ?? mob.x, mob.lairY ?? mob.y, inVision.pos.x, inVision.pos.y) <=
          (mob.lairRange ?? Infinity);
      if (inVision && (aggressive || tooClose) && pawnInTerritory) {
        return moveToward({ ...mob, state: 'Alerted', stateSince: turn }, inVision.pos, state);
      }
      return wanderStep(mob, def, state);
    }
    case 'Alerted': {
      // Engage if ANY live, non-collapsed pawn is adjacent — not just the Manhattan-`nearest`.
      // nearestPawn ranks by Manhattan distance while adjacency is Chebyshev, so a DIAGONALLY-adjacent
      // target was passed over while the mob chased a non-adjacent "nearest", got body-blocked in the
      // scrum, and froze in Alerted right beside a pawn it never attacked (the #3065 freeze). Mirror the
      // combat tick's target filter (skip Collapsed — a downed pawn isn't finished off). The FSM only
      // holds state; combatService owns damage + the one-per-engagement Chronicle line.
      // A downed (Collapsed) pawn is engageable ONLY to a hungry finisher; everyone else ignores it and
      // disengages below — that's the fix for mobs freezing in Alerted right beside an unconscious body.
      const finisher = willFinishOffDowned(mob.needs.hunger ?? 0, def);
      const adjPawn = state.pawns.some(
        (p) =>
          p.isAlive !== false &&
          (finisher || p.currentState !== 'Collapsed') &&
          p.position &&
          adjacent(mob, p.position)
      );
      if (adjPawn) return { ...mob, state: 'Attacking', stateSince: turn };
      // Re-target the nearest ENGAGEABLE pawn (the global `nearest` may be a downed body we ignore). No
      // engageable target in range → wander off rather than hover over the collapsed pawn.
      const engage = nearestEngageablePos(mob, state.pawns, finisher);
      if (!engage || dist(mob, engage) > visionRange * 1.5) {
        return { ...mob, state: 'Wander', stateSince: turn };
      }
      // Surround, don't stack: route to a DISTINCT free tile adjacent to the pawn via the shared
      // approachForMelee (same algorithm stepHunting uses), NOT a greedy step onto the pawn's own
      // tile. moveToward homes every pursuer on the pawn's exact tile from one heading, and
      // stepDirectional's anti-jitter `break` forbids the lateral move to peel around — so the 3rd+
      // mob in a pack froze directly behind the leaders instead of flanking.
      const decision = approachForMelee(mob, engage, state, turn);
      if (decision.kind === 'hold') return mob; // following a committed approach route
      // Fully boxed in (no walkable flank) — fall back to the greedy step so the mob still presses.
      if (decision.kind === 'unreachable') return moveToward(mob, engage, state);
      return { ...mob, path: decision.path, pathIndex: 0 }; // nextCellCostLeft preserved (see helper)
    }
    case 'Attacking': {
      // COMBAT-SYSTEM owns damage resolution. combatService.tickCombat() (called from
      // GameEngineImpl after entityStep) resolves hits for all mobs in Attacking state; the FSM only
      // holds position. The engagement target is EITHER a hunted prey MOB (huntTargetId, set by
      // stepHunting on contact) OR the nearest pawn. Resolving it pawn-only (the old `nearest` check)
      // ejected a mob fighting ANOTHER mob out of combat every tick — no pawn nearby → Alerted →
      // Wander → re-Hunt → Attacking — the mid-engagement oscillation. Hold while the ACTUAL target
      // is adjacent. (The passive FSM already does this via huntAttacker.)
      const preyTarget = mob.huntTargetId ? allMobs.find((m) => m.id === mob.huntTargetId) : null;
      if (preyTarget && preyTarget.state !== 'Corpse') {
        if (adjacent(mob, { x: preyTarget.x, y: preyTarget.y })) return mob; // hold; combat resolves
        // Prey broke contact — resume the hunt against IT (not the nearest pawn).
        return { ...mob, state: 'Hunting', stateSince: turn };
      }
      // Pawn engagement (or the prey just died / vanished): fall back to pawn-based logic, skipping
      // downed pawns unless we're a hungry finisher. No engageable pawn (e.g. our target just collapsed
      // and we won't finish it) → leave the body and wander; out of reach → re-close via Alerted.
      const atkFinisher = willFinishOffDowned(mob.needs.hunger ?? 0, def);
      const engage = nearestEngageablePos(mob, state.pawns, atkFinisher);
      if (!engage) return { ...mob, state: 'Wander', stateSince: turn };
      if (!adjacent(mob, engage)) return { ...mob, state: 'Alerted', stateSince: turn };
      return mob;
    }
    case 'Fleeing': {
      // For huntable neutral animals, also flee from nearby predators.
      const predThreat = def.huntable
        ? nearestPredatorThreat(mob, def, allMobs, visionRange)
        : null;
      const pawnDist = nearest ? dist(mob, nearest.pos) : Infinity;
      const predDist = predThreat ? dist(mob, predThreat.pos) : Infinity;
      const closestDist = Math.min(pawnDist, predDist);
      // Stop fleeing if threat is gone, or if cornered past the safety timeout (no committed run).
      const cantEscape = !mob.fleeDest && turn - mob.stateSince > SAFE_RESET_TICKS;
      if (closestDist > def.stats.fleeRange || cantEscape) {
        return { ...mob, state: 'Wander', stateSince: turn, fleeDest: undefined };
      }
      // Drain stamina while fleeing; transition to Exhausted when empty.
      const curStamina = mob.stamina ?? mob.maxStamina ?? calcMaxStamina(mob.stats);
      const drainedStamina = curStamina - FLEE_STAMINA_DRAIN_PER_SECOND * SECONDS_PER_TICK;
      if (drainedStamina <= 0) {
        return { ...mob, state: 'Exhausted', stateSince: turn, stamina: 0, path: [] };
      }
      // Flee the gap between every in-range threat (not just the nearest — that ping-pongs when
      // boxed between two). Maximin over the threat set; commits to a heading instead of reversing.
      const fleeThreats: { x: number; y: number }[] = [];
      if (nearest && pawnDist <= def.stats.fleeRange) fleeThreats.push(nearest.pos);
      if (predThreat && predDist <= def.stats.fleeRange) fleeThreats.push(predThreat.pos);
      if (fleeThreats.length > 0)
        return { ...fleeToSafety(mob, fleeThreats, state), stamina: drainedStamina };
      return { ...wanderStep(mob, def, state), stamina: drainedStamina };
    }
    case 'Exhausted': {
      // N-3: exhaustion is the SHARED `winded` status (stamina-driven, latched by
      // Combat.tickStaminaAndWinded and cleared at full stamina) — not a bespoke threshold. Stand
      // still and recover until no longer winded, then resume. Combat owns the stamina regen, so we
      // never touch stamina here — that keeps the state and the stamina bar in lockstep (no "Exhausted
      // at max stamina" desync).
      if (!(mob.transientConditions ?? []).includes('winded')) {
        return { ...mob, state: 'Wander', stateSince: turn, path: [] };
      }
      return { ...mob, path: [] }; // stay still while winded
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

/**
 * Debug trace (→ .debug/entities.log): record WHAT tripped a mob into fleeing — threat kind,
 * position, distance, and the creature's vision/flee ranges. Makes a stuck/cornered flee (a mob
 * boxed between two threats so it can never get beyond `fleeRange`) diagnosable from the log.
 * Gated by gameLogger.enabled, so it costs nothing in normal play.
 */
function logFleeTrigger(
  mob: Mob,
  def: CreatureDefinition,
  threat: { pos: { x: number; y: number } },
  isPawn: boolean,
  turn: number,
  visionRange: number
): void {
  if (!gameLogger.isEnabled) return;
  const d = Math.max(Math.abs(threat.pos.x - mob.x), Math.abs(threat.pos.y - mob.y));
  gameLogger.log(
    turn,
    'ENTITY-FLEE',
    `${mob.id} @(${mob.x},${mob.y}) flee ${isPawn ? 'pawn' : 'predator'}@(${threat.pos.x},${threat.pos.y}) d=${d} vision=${visionRange} flee=${def.stats.fleeRange}`
  );
}

export function stepAnimal(
  mob: Mob,
  def: CreatureDefinition,
  inVision: { pos: { x: number; y: number } } | null,
  nearest: { pos: { x: number; y: number } } | null,
  visionRange: number,
  turn: number,
  state: GameState,
  allMobs: Mob[],
  pendingDamage: Map<string, number>,
  pendingMeatConsumption: Map<string, number>,
  pendingTileDepletion: Array<{ x: number; y: number; id: string }>,
  pendingMobState: Map<string, Partial<Mob>>
): Mob {
  // `visionRange` is the §G light-scaled, perception-based sight range (computed in stepOne) — the
  // SAME model mobs and pawns share. Detection uses it; flee DISTANCE still uses def.stats.fleeRange.

  // Combined threat: pawn in vision OR a predatory mob nearby.
  const predatorThreat = nearestPredatorThreat(mob, def, allMobs, visionRange);
  const threat = inVision ?? predatorThreat;

  // ── Hunger / fatigue FSM transitions (only when safe) ──────────────────────
  if (!threat) {
    const hungry = mob.needs.hunger >= HUNGER_EAT_THRESHOLD;
    const sated = mob.needs.hunger <= HUNGER_SATED_THRESHOLD;

    // Exit feeding states when sated.
    if (sated && (mob.state === 'Foraging' || mob.state === 'Hunting' || mob.state === 'Eating')) {
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
      // Check cooldowns before re-entering a feeding state — forage cooldown lets a boxed-in
      // omnivore fall through to hunting instead of flicking Grazing↔Foraging on unreachable food.
      const huntCooldownExpired = !mob.huntCooldownUntil || turn >= mob.huntCooldownUntil;
      const forageCooldownExpired = !mob.forageCooldownUntil || turn >= mob.forageCooldownUntil;
      if (canForage && forageCooldownExpired)
        return { ...mob, state: 'Foraging', stateSince: turn, path: [] };
      // §S5: gate a LIVE-prey hunter on the concurrent-hunt budget (combat); a pure scavenger
      // (corpse-only, no canHuntLive) is cheap and never gated.
      if (canScavengeOrHunt && huntCooldownExpired && (!canHuntLive || takeHuntSlot()))
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
    logFleeTrigger(mob, def, threat, inVision != null, turn, visionRange);
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
      if (threat) {
        logFleeTrigger(mob, def, threat, inVision != null, turn, visionRange);
        return { ...mob, state: 'Startled', stateSince: turn, path: [] };
      }
      return wanderStep(mob, def, state);
    }
    case 'Startled': {
      // Committed freeze: hold still for the full startle duration, then
      // ALWAYS bolt. Never returns to Grazing — that path would allow a
      // Grazing↔Startled flicker. Fleeing is the only exit.
      if (turn - mob.stateSince >= STARTLED_TICKS) {
        // Fresh flee episode → clear any stale committed destination.
        return { ...mob, state: 'Fleeing', stateSince: turn, path: [], fleeDest: undefined };
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
      // Flee the GAP between EVERY in-range threat (pawn + predator), not just the closest —
      // backing off only the nearest ping-pongs when the prey is boxed between two threats.
      const fleeThreats: { x: number; y: number }[] = [];
      if (nearest && dist(mob, nearest.pos) <= def.stats.fleeRange) fleeThreats.push(nearest.pos);
      if (predatorThreat && dist(mob, predatorThreat.pos) <= def.stats.fleeRange)
        fleeThreats.push(predatorThreat.pos);
      // Stop fleeing when no threat is left in range, OR when CORNERED past the safety timeout —
      // "cornered" = no committed run (fleeToSafety couldn't reach any distant point, so it cleared
      // fleeDest and is only holding). A mob mid-run (fleeDest set) is NOT timed out — it commits to
      // the escape so it doesn't flip direction (the yoyo).
      const cantEscape = !mob.fleeDest && turn - mob.stateSince > SAFE_RESET_TICKS;
      if (fleeThreats.length === 0 || cantEscape) {
        return {
          ...mob,
          state: 'Grazing',
          stateSince: turn,
          path: [],
          fleeDest: undefined,
          stamina: drainedStamina
        };
      }
      return { ...fleeToSafety(mob, fleeThreats, state), stamina: drainedStamina };
    }
    case 'Exhausted': {
      // N-3: exhaustion is the SHARED `winded` status (stamina-driven, latched + regenerated by
      // Combat.tickStaminaAndWinded, cleared at full stamina) — see the animal branch above. Stand
      // still until no longer winded, then resume; stamina is never touched here.
      if (!(mob.transientConditions ?? []).includes('winded')) {
        return { ...mob, state: 'Grazing', stateSince: turn, path: [] };
      }
      return { ...mob, path: [] }; // stay still while winded
    }
    case 'Sleeping': {
      // Woken by any threat — bolt immediately.
      if (threat) {
        logFleeTrigger(mob, def, threat, inVision != null, turn, visionRange);
        return { ...mob, state: 'Startled', stateSince: turn, path: [] };
      }
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
      const atk = huntAttacker(mob, state, allMobs);
      if (atk && adjacent(mob, atk)) {
        return mob; // hold position, combatService resolves damage
      }
      // Attacker gone or moved away — flee.
      return { ...mob, state: 'Fleeing', stateSince: turn, huntTargetId: undefined, path: [] };
    }
    case 'Foraging':
      return stepForaging(mob, def, turn, state, pendingTileDepletion);
    case 'Hunting':
      return stepHunting(
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
        return stepHunting(
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
      return stepForaging(mob, def, turn, state, pendingTileDepletion);
    default:
      return { ...mob, state: 'Grazing', stateSince: turn, path: [] };
  }
}

export function stepForaging(
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
      const edibleId = edibleResourceOnTile(tile, kinds);
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

  // Path done — decide next step. Search in priority order so herbivores head for grass before
  // wild forage, and omnivores head for real forage food (berries/mushrooms). findReachableFoodTile
  // returns the nearest tile that ACTUALLY paths (walkable ≠ reachable — a bush across a river is
  // walkable but unreachable), trying the next-nearest candidates when one can't be pathed. This is
  // why a marooned forager used to fixate on a single unreachable tile while a reachable bush sat
  // ignored.
  let found: { target: { x: number; y: number }; path: { x: number; y: number }[] } | null = null;
  for (const kind of tileKindOrder) {
    found = findReachableFoodTile(state, mob, FORAGE_RADIUS, new Set([kind]));
    if (found) break;
  }
  if (!found) {
    // No REACHABLE edible tile in range — back off (cooldown) so a boxed-in forager stops
    // re-scanning/re-pathing/re-logging it every tick, and wander to re-evaluate from elsewhere.
    if (turn % 300 === 0) {
      gameLogger.log(
        turn,
        'ENTITY-FEED',
        `FORAGE-NO-REACHABLE ${mob.id} @(${mob.x},${mob.y}) hunger=${mob.needs.hunger.toFixed(1)}`
      );
    }
    return {
      ...wanderStep(mob, def, state),
      state: idleState,
      stateSince: turn,
      forageCooldownUntil: turn + ticksFromSeconds(FORAGE_COOLDOWN_SECONDS)
    };
  }

  if (found.path.length === 0) {
    // Standing on the food tile already — start eating.
    return { ...mob, eatProgress: SECONDS_PER_TICK / EAT_GRASS_SECONDS, path: [] };
  }
  return { ...mob, path: found.path, pathIndex: 0, nextCellCostLeft: undefined };
}

/**
 * Advance a Hunting entity toward its locked target or find new prey.
 * Once a target is locked (huntTargetId set), the hunter pursues it exclusively
 * unless the target becomes invalid (gone, stripped) or a corpse appears (free food).
 * If pathfinding fails, the hunter enters Wander with a cooldown before re-hunting.
 */
export function stepHunting(
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
        prey = findNearestPrey(mob, allMobs, allowLivePrey);
      } else {
        prey = lockedTarget;
      }
    } else {
      // Locked target is gone — find new prey.
      prey = findNearestPrey(mob, allMobs, allowLivePrey);
    }
  } else {
    // No locked target — find nearest prey.
    prey = findNearestPrey(mob, allMobs, allowLivePrey);
  }

  if (!prey) {
    // No prey in range — exit Hunting state and wander.
    const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
    return {
      ...wanderStep(mob, def, state),
      huntTargetId: undefined,
      state: restState,
      stateSince: turn
    };
  }

  const preyPos = { x: prey.x, y: prey.y };

  if (adjacent(mob, preyPos)) {
    if (prey.state === 'Corpse') {
      // Only start eating if meat remains (guards against race with pendingMeatConsumption).
      if ((prey.intactness ?? 1.0) <= 0) {
        const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
        return {
          ...wanderStep(mob, def, state),
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
      ...wanderStep(mob, def, state),
      huntTargetId: undefined,
      huntCooldownUntil: turn + ticksFromSeconds(HUNT_COOLDOWN_SECONDS),
      state: restState,
      stateSince: turn
    };
  }

  // Pursue prey via the SHARED approachForMelee (same logic the Alerted FSM uses against pawns):
  // route to an unoccupied tile adjacent to the prey so the hunter arrives in attack range without
  // landing on the prey's own tile, re-pathing only when the route is exhausted / the prey drifts
  // off the path end, throttled to every 10 ticks. nextCellCostLeft is preserved on repath (see the
  // helper's note) — resetting it mid-crossing produces the hunt "yoyo".
  const decision = approachForMelee(mob, preyPos, state, turn);
  if (decision.kind === 'unreachable') {
    gameLogger.log(
      turn,
      'ENTITY-FEED',
      `HUNT-UNREACHABLE ${mob.id} @(${mob.x},${mob.y}) prey ${prey.id}@(${preyPos.x},${preyPos.y})`
    );
    // Set cooldown and transition to Wander.
    const cooldownUntil = turn + ticksFromSeconds(HUNT_COOLDOWN_SECONDS);
    const restState: MobState = def.behaviour === 'passive' ? 'Grazing' : 'Wander';
    return {
      ...wanderStep(mob, def, state),
      huntTargetId: undefined,
      huntCooldownUntil: cooldownUntil,
      state: restState,
      stateSince: turn
    };
  }
  if (decision.kind === 'repath') {
    return { ...mob, huntTargetId: prey.id, path: decision.path, pathIndex: 0 };
  }
  return { ...mob, huntTargetId: prey.id }; // 'hold' — keep following the committed route
}
