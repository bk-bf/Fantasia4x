// Entity AI / FSM brain — per-tick stepping for hostile mobs and neutral animals (wander, flee,
// hunt, forage, sleep) plus the feeding sub-steppers. Extracted from EntityService (P-4).
import type { GameState, Mob, MobState, Pawn } from '../../core/types';
import { getCreatureById, type CreatureDefinition } from '../../core/Creatures';
import { getAmbientLight, computeTileLightLevel } from '../EnvironmentService';
import { effectiveVisionRange } from '../../core/vision';
import { ticksFromSeconds, SECONDS_PER_TICK } from '../../core/time';
import { calcMaxStamina } from '../../entities/Pawns';
import { gameLogger } from '../../dev/gameLogger';
import { simLog } from '../../core/logSink';
import { rng } from '../../core/rng';
import { markTileDirty } from '../../core/tileDeltas';
import {
  entityName,
  nearestPawn,
  dist,
  adjacent,
  moveToward,
  fleeToSafety,
  wanderStep,
  nearestPredatorThreat,
  findNearestPrey,
  findNearestFoodTile,
  huntAttacker,
  bestApproachTile,
  pathTo,
  edibleResourceOnTile
} from './entityHelpers';
import {
  type TileFoodKind,
  NIGHT_THRESHOLD,
  STARVATION_COLLAPSE_SEVERITY,
  FLEE_HEALTH_FRACTION,
  HUNGER_SATED_THRESHOLD,
  HUNGER_EAT_THRESHOLD,
  FORAGE_RADIUS,
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
  HUNT_GIVE_UP_SECONDS,
  WILD_FORAGE_RESOURCE_IDS
} from './entityConstants';

export function stepEntities(state: GameState): GameState {
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
    const ticked = tickMobStatusEffectDurations(stepped);
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

  // Starvation collapse: gated on the data-driven `malnutrition` condition (driven from hunger in
  // entityLifecycle.stepHunger, the SAME model pawns use), NOT on raw hunger. Only once malnutrition
  // reaches its severe, life-threatening stage is the entity too weak to act — it stops
  // fleeing/hunting/wandering, lies in place (path cleared), and dies when malnutrition hits lethal
  // severity. Because malnutrition onsets at hunger 87 and accrues slowly, this takes in-game DAYS of
  // starving — it no longer drops a mob mid-hunt the instant hunger crosses 80.
  const malnutritionSeverity =
    mob.conditions?.find((c) => c.id === 'malnutrition')?.severity ?? 0;
  if (malnutritionSeverity >= STARVATION_COLLAPSE_SEVERITY) {
    if (mob.state === 'Collapsed') return mob;
    simLog.logEntityStateChange(
      mob.id,
      entityName(mob),
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
  // Recovered (e.g. fed enough to drop below the severe stage): resume normal behaviour.
  if (mob.state === 'Collapsed') {
    return { ...mob, state: 'Wander', stateSince: turn };
  }

  const nearest = nearestPawn(mob, pawns);
  // §G shared vision: perception-based range scaled by this tile's light + the mob's night_vision,
  // computed ONCE here and threaded into the FSM (so darkness shortens detection without recomputing
  // the light per check). Daytime with nightVision 0 ≈ the old def.stats.visionRange.
  const tileLight = computeTileLightLevel(turn, state.buildings ?? [], mob.x, mob.y);
  const visionRange = effectiveVisionRange(mob, tileLight);
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

export function tickMobStatusEffectDurations(mob: Mob): Mob {
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
    const threat =
      inVision ?? (def.huntable ? nearestPredatorThreat(mob, def, allMobs, visionRange) : null);
    const threatName = threat
      ? (state.pawns.find(
          (p) =>
            p.position && Math.abs(p.position.x - mob.x) <= 1 && Math.abs(p.position.y - mob.y) <= 1
        )?.name ?? 'predator')
      : undefined;
    simLog.logFlee(
      mob.id,
      entityName(mob),
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
    const canScavengeOrHunt = canHunt || def.eats.includes('meat') || def.eats.includes('organic');
    const forageReachable = () =>
      canForage && findNearestFoodTile(state, mob.x, mob.y, FORAGE_RADIUS, tileKinds) !== null;
    const tryHunt = (): Mob | null => {
      if (!canScavengeOrHunt) return null;
      const prey = findNearestPrey(mob, allMobs, canHunt);
      if (!prey) return null;
      const preyDef = getCreatureById(prey.creatureId);
      const preyName = preyDef
        ? `${preyDef.name} #${prey.debugId ?? prey.id.slice(-4)}`
        : prey.id.slice(-6);
      simLog.logHuntStart(mob.id, entityName(mob), prey.id, preyName, turn, mob.x, mob.y);
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
      if (inVision && (aggressive || tooClose)) {
        return moveToward({ ...mob, state: 'Alerted', stateSince: turn }, inVision.pos, state);
      }
      return wanderStep(mob, def, state);
    }
    case 'Alerted': {
      if (!nearest || dist(mob, nearest.pos) > visionRange * 1.5) {
        return { ...mob, state: 'Wander', stateSince: turn };
      }
      if (adjacent(mob, nearest.pos)) {
        // Engagement logging is owned by combatService (one Chronicle entry per
        // engagement, opened on the first resolved swing) — the FSM only holds state.
        return { ...mob, state: 'Attacking', stateSince: turn };
      }
      return moveToward(mob, nearest.pos, state);
    }
    case 'Attacking': {
      // COMBAT-SYSTEM owns damage resolution.
      // combatService.tickCombat() (called from GameEngineImpl after entityStep)
      // resolves hits for all mobs in Attacking state. The FSM only holds position.
      if (!nearest || !adjacent(mob, nearest.pos)) {
        return { ...mob, state: 'Alerted', stateSince: turn };
      }
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
      if (!(mob.activeEffects ?? []).includes('winded')) {
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
            Math.abs(p.position.x - mob.x) <= visionRange &&
            Math.abs(p.position.y - mob.y) <= visionRange
        )?.name ?? 'predator')
      : 'predator';
    simLog.logFlee(
      mob.id,
      entityName(mob),
      inVision ? 'threat' : undefined,
      threatName,
      turn,
      mob.x,
      mob.y
    );
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
      if (!(mob.activeEffects ?? []).includes('winded')) {
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

  // Path done — decide next step. Search in priority order so herbivores head for
  // grass before wild forage, and omnivores head for real forage food (berries/mushrooms).
  let target: { x: number; y: number } | null = null;
  for (const kind of tileKindOrder) {
    target = findNearestFoodTile(state, mob.x, mob.y, FORAGE_RADIUS, new Set([kind]));
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
    return { ...wanderStep(mob, def, state), state: idleState, stateSince: turn };
  }

  if (target.x === mob.x && target.y === mob.y) {
    return { ...mob, eatProgress: SECONDS_PER_TICK / EAT_GRASS_SECONDS, path: [] };
  }

  // Route to the food tile via A*. If unreachable, bail to wandering so the
  // animal keeps moving (and re-evaluates) instead of starving frozen in place.
  const newPath = pathTo(state, mob.x, mob.y, target.x, target.y, mob.id);
  if (!newPath.length) {
    gameLogger.log(
      turn,
      'ENTITY-FEED',
      `FORAGE-UNREACHABLE ${mob.id} @(${mob.x},${mob.y}) food@(${target.x},${target.y})`
    );
    return { ...wanderStep(mob, def, state), state: idleState, stateSince: turn };
  }
  return { ...mob, path: newPath, pathIndex: 0, nextCellCostLeft: undefined };
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
    const approachTile = bestApproachTile(state, mob, preyPos, mob.id) ?? preyPos;
    const newPath = pathTo(state, mob.x, mob.y, approachTile.x, approachTile.y, mob.id);
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
        ...wanderStep(mob, def, state),
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
      pathIndex: 0
      // nextCellCostLeft is deliberately NOT reset. The hunt re-paths every 10 ticks while the
      // prey flees, but a tile crossing takes ~20 ticks — so a reset lands mid-crossing and snaps
      // the renderer's sub-tile interp (simTarget reads nextCellCostLeft) back to tile-centre 6×/s,
      // producing the hunt "yoyo". Carrying it over continues the crossing toward the fresh path's
      // first step (a neighbour of the same tile), exactly like pawn assignPath / flee stepDirectional.
    };
  }
  return { ...mob, huntTargetId: prey.id };
}
