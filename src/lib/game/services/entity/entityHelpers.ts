// Shared entity helpers — queries, movement, and foraging lookups used by the spawning, AI, and
// lifecycle modules. Extracted from EntityService (P-4); converted from class methods to free
// functions (the class had no instance state but `idCounter`, so `this.` simply dropped away).
import type { GameState, Mob, Pawn } from '../../core/types';
import { getCreatureById, type CreatureDefinition } from '../../core/Creatures';
import { pawnById } from '../../core/pawnIndex';
import { SECONDS_PER_TICK } from '../../core/time';
import { stepBody, seedMidCrossClaims } from '../../systems/MovementSystem';
import { resourceObjectService } from '../ResourceObjectService';
import { wasmPathfinderService } from '../WasmPathfinderService';
import { buildPathfindingGridsSoftBlocked } from '../PathfinderService';
import { occupancyService } from '../OccupancyService';
import { rng } from '../../core/rng';
import {
  type TileFoodKind,
  WILD_FORAGE_RESOURCE_IDS,
  HUNT_RADIUS,
  WANDER_MOVES_PER_SECOND
} from './entityConstants';

export function entityName(mob: Mob): string {
  const def = getCreatureById(mob.creatureId);
  return def ? `${def.name} #${mob.debugId ?? mob.id.slice(-4)}` : mob.id.slice(-6);
}

export function edibleResourceOnTile(
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
export function findNearestFoodTile(
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
      if (!edibleResourceOnTile(tile, kinds)) continue;
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
 * Nearest edible tile within `radius` that is ACTUALLY reachable by A*, plus the path to it.
 *
 * `findNearestFoodTile` only checks `tile.walkable`, but walkable ≠ reachable — a berry bush across
 * a river/cliff is walkable yet unpathable. A forager that locked onto such a tile re-pathed it
 * (and re-logged FORAGE-UNREACHABLE) every tick while a slightly-farther REACHABLE bush sat ignored.
 * This collects edible tiles nearest-first and probes them with `pathTo`, returning the first that
 * paths. Capped at `maxCandidates` A* probes so a boxed-in mob can't run unbounded pathfinding per
 * tick (the caller additionally backs off via forageCooldownUntil when this returns null).
 */
export function findReachableFoodTile(
  state: GameState,
  mob: Mob,
  radius: number,
  kinds: Set<TileFoodKind>,
  maxCandidates = 6
): { target: { x: number; y: number }; path: { x: number; y: number }[] } | null {
  if (kinds.size === 0) return null;
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = mob.x + dx;
      const ny = mob.y + dy;
      const tile = state.worldMap[ny]?.[nx];
      if (!tile?.walkable) continue;
      if (!edibleResourceOnTile(tile, kinds)) continue;
      candidates.push({ x: nx, y: ny, d: Math.abs(dx) + Math.abs(dy) });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.d - b.d);
  const probeCount = Math.min(candidates.length, maxCandidates);
  for (let i = 0; i < probeCount; i++) {
    const c = candidates[i];
    if (c.x === mob.x && c.y === mob.y) return { target: { x: c.x, y: c.y }, path: [] };
    const path = pathTo(state, mob.x, mob.y, c.x, c.y, mob.id);
    if (path.length) return { target: { x: c.x, y: c.y }, path };
  }
  return null;
}

/**
 * Nearest corpse (preferred) within HUNT_RADIUS, or — if `allowLivePrey` — the nearest
 * live huntable creature. `allowLivePrey` should be `predator || diet === 'carnivore'`:
 * scavenging a corpse doesn't require being a hunter, but stalking live prey does.
 */
// Per-tick memo of the two mob subsets the AI repeatedly scans — predators (to flee) and prey
// (corpses + live huntables, to hunt). Keyed on the allMobs array identity: immutable updates
// (ADR-002) recreate it whenever any mob changes, so the memo self-invalidates. This collapses the
// O(mobs²) re-scan + per-candidate getCreatureById that nearestPredatorThreat/findNearestPrey ran
// for EVERY mob EVERY tick into one O(mobs) pass per tick (ENGINE-PERFORMANCE; same lever as the
// pawn-side mobSubsets / soft-pathing).
let _mobThreatCache: { ref: Mob[] | undefined; predators: Mob[]; prey: Mob[] } | null = null;

function mobThreatSubsets(allMobs: Mob[]): { predators: Mob[]; prey: Mob[] } {
  if (_mobThreatCache && _mobThreatCache.ref === allMobs) return _mobThreatCache;
  const predators: Mob[] = [];
  const prey: Mob[] = [];
  for (const m of allMobs) {
    if (m.state === 'Corpse') {
      if ((m.intactness ?? 1.0) > 0) prey.push(m); // scavengeable corpse
      continue;
    }
    const def = getCreatureById(m.creatureId);
    if (def?.predator) predators.push(m);
    if (def?.huntable && m.state !== 'Tamed') prey.push(m); // live huntable
  }
  _mobThreatCache = { ref: allMobs, predators, prey };
  return _mobThreatCache;
}

export function findNearestPrey(mob: Mob, allMobs: Mob[], allowLivePrey: boolean): Mob | null {
  let best: Mob | null = null;
  let bestDist = Infinity;
  // Pre-filtered prey subset (corpses with intactness>0 + live non-tamed huntables), once per tick.
  for (const candidate of mobThreatSubsets(allMobs).prey) {
    if (candidate.id === mob.id) continue;
    const raw = Math.abs(candidate.x - mob.x) + Math.abs(candidate.y - mob.y);
    if (candidate.state === 'Corpse') {
      // Corpses weighted as 50% closer — free food with no danger.
      const d = raw * 0.5;
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    } else if (allowLivePrey && raw <= HUNT_RADIUS) {
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
export function huntAttacker(
  mob: Mob,
  state: GameState,
  allMobs: Mob[]
): { x: number; y: number } | null {
  if (!mob.huntTargetId) return null;
  const m = allMobs.find((a) => a.id === mob.huntTargetId);
  if (m) return m.state === 'Attacking' ? { x: m.x, y: m.y } : null;
  const p = pawnById(state.pawns, mob.huntTargetId);
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

export function nearestPredatorThreat(
  prey: Mob,
  def: CreatureDefinition,
  allMobs: Mob[],
  visionRange: number
): { pos: { x: number; y: number } } | null {
  if (!def.huntable) return null;
  let best: Mob | null = null;
  let bestDist = Infinity;
  // Pre-filtered predator subset (non-corpse, def.predator), computed once per tick.
  for (const m of mobThreatSubsets(allMobs).predators) {
    if (m.id === prey.id) continue;
    const d = dist(prey, { x: m.x, y: m.y });
    if (d <= visionRange && d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best ? { pos: { x: best.x, y: best.y } } : null;
}

export function wanderStep(mob: Mob, def: CreatureDefinition, state: GameState): Mob {
  // Still following a path — let it finish before picking the next step.
  if (mob.path && mob.path.length > 0 && (mob.pathIndex ?? 0) < mob.path.length) return mob;
  // Probabilistic idle: ~WANDER_MOVES_PER_SECOND steps/sec on average.
  if (rng.random() >= WANDER_MOVES_PER_SECOND * SECONDS_PER_TICK) return mob;
  const tile = findNearbyWalkable(state, mob.x, mob.y, mob.id);
  if (!tile) return mob;
  return { ...mob, path: [tile], pathIndex: 0, nextCellCostLeft: undefined };
}

export function moveToward(mob: Mob, target: { x: number; y: number }, state: GameState): Mob {
  return stepDirectional(mob, target, state, 1);
}

export function moveAway(mob: Mob, threat: { x: number; y: number }, state: GameState): Mob {
  return stepDirectional(mob, threat, state, -1);
}

/**
 * Flee from MULTIPLE threats at once. Picks the walkable, unoccupied neighbour that maximises the
 * MINIMUM (Chebyshev, matching `dist`) distance to every threat — so prey boxed between two threats
 * slips along the gap (perpendicular to the threat line) and commits to it, instead of greedily
 * backing away from whichever threat is nearest THIS tick (which ping-pongs between two tiles, the
 * cornered-flee bug). Never steps to a tile that brings the closest threat nearer than standing
 * still does; holds in place when truly cornered (no thrashing). Keeps the current flee heading on a
 * tie so the direction can't reverse each tick — and preserves the in-progress crossing (no yoyo).
 */
export function fleeFromThreats(
  mob: Mob,
  threats: { x: number; y: number }[],
  state: GameState
): Mob {
  if (threats.length === 0) return mob;
  const minThreatDist = (x: number, y: number) =>
    threats.reduce((m, t) => Math.min(m, Math.max(Math.abs(t.x - x), Math.abs(t.y - y))), Infinity);

  const stayScore = minThreatDist(mob.x, mob.y);
  const heading = mob.path?.[mob.pathIndex ?? 0];
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  let bestIsHeading = false;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = mob.x + dx;
      const ny = mob.y + dy;
      if (!isWalkable(state, nx, ny)) continue;
      // Diagonal wall-cut prevention (mirrors A*): a diagonal needs a shared orthogonal opening.
      if (
        dx !== 0 &&
        dy !== 0 &&
        !isWalkable(state, mob.x + dx, mob.y) &&
        !isWalkable(state, mob.x, mob.y + dy)
      )
        continue;
      if (occupancyService.isBlocked(state, nx, ny, mob.id)) continue;
      const score = minThreatDist(nx, ny);
      const isHeading = !!heading && heading.x === nx && heading.y === ny;
      // Strictly better wins; on a tie the current heading wins so we commit (don't reverse).
      if (score > bestScore || (score === bestScore && isHeading && !bestIsHeading)) {
        best = { x: nx, y: ny };
        bestScore = score;
        bestIsHeading = isHeading;
      }
    }
  }

  // Cornered — no open neighbour keeps the closest threat at least as far as holding still. Stand
  // fast instead of ping-ponging into a worse tile (give-up/timeout handles a persistent box-in).
  if (!best || bestScore < stayScore) return { ...mob, path: [] };
  // Already committed to this heading — keep going (don't reset the crossing → no render snap).
  if (heading && heading.x === best.x && heading.y === best.y) return mob;
  return { ...mob, path: [best], pathIndex: 0, nextCellCostLeft: undefined };
}

/** A flee destination is "reached" once the mob is this close to it (paths can't always land
 *  exactly on a far tile, and we re-evaluate near it anyway). */
const FLEE_REACHED_DIST = 3;

/**
 * Flee to a DISTANT safe destination and **commit to it**. The mob LOCKS a goal ~half the map away
 * (in the direction maximising the minimum distance to every threat), stores it on `mob.fleeDest`,
 * and runs there — re-routing around blocks toward the SAME point — until it arrives or the point
 * stops being safe (a threat got near it). Only THEN does it pick a new goal. This is the crux of
 * the fix: picking a fresh "safest direction" every time the path ended let two near-tied directions
 * (e.g. south vs NE) swap winners as the threat moved → a big-range yoyo. A locked, far destination
 * removes the per-recompute choice, and "far" means the prey usually breaks line-of-flee-range (and
 * exits Fleeing) long before it ever arrives. Falls back to the local maximin step only when nothing
 * distant is reachable (or the pathfinder isn't ready), so a truly walled-in animal still reacts.
 */
export function fleeToSafety(mob: Mob, threats: { x: number; y: number }[], state: GameState): Mob {
  if (threats.length === 0) return mob;

  // Following a live route → keep going (commit). Only re-decide when the path is used up or the
  // mover dropped it (blocked too long → empty path).
  const pathExhausted = !mob.path?.length || (mob.pathIndex ?? 0) >= mob.path.length;
  if (!pathExhausted && mob.fleeDest) return mob;

  const h = state.worldMap.length;
  const w = state.worldMap[0]?.length ?? 0;
  const fleeDistance = Math.max(8, Math.floor(Math.max(w, h) / 2));
  const minThreatDist = (x: number, y: number) =>
    threats.reduce((m, t) => Math.min(m, Math.max(Math.abs(t.x - x), Math.abs(t.y - y))), Infinity);

  // Keep heading to the LOCKED destination: re-route to it around whatever blocked us, as long as we
  // haven't reached it and it's still far from every threat. This is what stops the direction flip.
  const dest = mob.fleeDest;
  if (dest) {
    const reached =
      Math.max(Math.abs(dest.x - mob.x), Math.abs(dest.y - mob.y)) <= FLEE_REACHED_DIST;
    const stillSafe = minThreatDist(dest.x, dest.y) > fleeDistance / 2;
    if (!reached && stillSafe) {
      const path = pathTo(state, mob.x, mob.y, dest.x, dest.y, mob.id);
      // nextCellCostLeft preserved (MOVE-1): the new path's first step is a neighbour of this tile.
      if (path.length > 0) return { ...mob, path, pathIndex: 0 };
    }
  }

  // Pick a NEW destination: rank the 8 headings by how far their far-point sits from the threat set,
  // A* to the first reachable one (safest first; a corner escape falls through to a less-safe but
  // reachable heading — "move past the danger to get away").
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 1, dy: 1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -1 }
  ];
  const candidates = dirs
    .map(({ dx, dy }) => {
      const tx = Math.max(0, Math.min(w - 1, mob.x + dx * fleeDistance));
      const ty = Math.max(0, Math.min(h - 1, mob.y + dy * fleeDistance));
      return { tx, ty, score: minThreatDist(tx, ty) };
    })
    .sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    const goal = isWalkable(state, c.tx, c.ty)
      ? { x: c.tx, y: c.ty }
      : findNearbyWalkable(state, c.tx, c.ty, mob.id);
    if (!goal || (goal.x === mob.x && goal.y === mob.y)) continue;
    const path = pathTo(state, mob.x, mob.y, goal.x, goal.y, mob.id);
    if (path.length > 0) return { ...mob, fleeDest: goal, path, pathIndex: 0 };
  }

  // No reachable distant safe point — clear the (now unreachable) lock and take a local step.
  return { ...fleeFromThreats(mob, threats, state), fleeDest: undefined };
}

/**
 * Nearest walkable tile adjacent to `target` (excluding target itself), ranked
 * by Manhattan distance from `from`. Used so hunters path to a tile beside their
 * prey rather than onto the prey's occupied tile.
 */
export function bestApproachTile(
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
      if (!isWalkable(state, nx, ny)) continue;
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

/** Outcome of {@link approachForMelee}; the caller maps each case onto its own state fields. */
export type ApproachDecision =
  | { kind: 'hold' } // committed to a live route — keep following it, no change
  | { kind: 'repath'; path: { x: number; y: number }[] } // fresh A* route to a flank of the target
  | { kind: 'unreachable' }; // no walkable tile adjacent to the target — caller decides the fallback

/**
 * SHARED "close to melee range" approach for BOTH pursuit paths — mob-vs-pawn (the Alerted FSM
 * state) and mob-vs-prey (stepHunting). They were two hand-rolled copies of the same algorithm, and
 * the divergence is exactly what let a "surround" fix land on one and not the other (the 3rd-mob
 * stacks-behind bug). One source of truth now: path to a DISTINCT unoccupied neighbour of the target
 * (bestApproachTile, which excludes tiles held by mobs already engaged), so a pack fans out and
 * surrounds instead of all homing on the target's own tile from one heading. Re-path only when the
 * route is exhausted or the target drifted off the path's end tile, throttled to every 10 ticks
 * (the cadence guards against main-thread stalls when many pursuers chase at once).
 *
 * Returns a DECISION, not a mob, because the tails differ: the hunter gives up + cools down on an
 * unreachable target, while the Alerted mob presses greedily; both carry their own id/state fields.
 * On 'repath' the caller MUST spread the existing mob and set only `path`/`pathIndex` (NOT
 * `nextCellCostLeft`): the re-path fires mid-tile-crossing, and resetting the cost-left would snap
 * the renderer's sub-tile interpolation back to tile-centre (the "yoyo"). Carrying it over continues
 * the crossing toward the fresh route's first step (a neighbour of the same tile).
 */
export function approachForMelee(
  mob: Mob,
  targetPos: { x: number; y: number },
  state: GameState,
  turn: number
): ApproachDecision {
  const pathEnd = mob.path && mob.path.length > 0 ? mob.path[mob.path.length - 1] : null;
  const pathExhausted = !mob.path?.length || (mob.pathIndex ?? 0) >= mob.path.length;
  const targetMoved =
    !pathEnd ||
    Math.max(Math.abs(pathEnd.x - targetPos.x), Math.abs(pathEnd.y - targetPos.y)) > 1.5;
  const repathDue = pathExhausted || (targetMoved && (turn - mob.stateSince) % 10 === 0);
  if (!repathDue) return { kind: 'hold' };
  const approachTile = bestApproachTile(state, mob, targetPos, mob.id) ?? targetPos;
  const path = pathTo(state, mob.x, mob.y, approachTile.x, approachTile.y, mob.id);
  if (!path.length) return { kind: 'unreachable' };
  return { kind: 'repath', path };
}

export function stepDirectional(
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
    if (isWalkable(state, c.x, c.y) && !occupancyService.isBlocked(state, c.x, c.y, mob.id)) {
      const currentNext = mob.path?.[mob.pathIndex ?? 0];
      if (currentNext && currentNext.x === c.x && currentNext.y === c.y) return mob;
      return { ...mob, path: [c], pathIndex: 0, nextCellCostLeft: undefined };
    }
  }

  // All primary directions blocked (cornered against terrain) — try the full 8
  // neighbours sorted by how well they move away from / toward the reference point.
  const curDist = Math.abs(mob.x - ref.x) + Math.abs(mob.y - ref.y);
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
    // Anti-jitter (approach only): never fall back to a tile that doesn't get strictly CLOSER to the
    // target. When a mob is hemmed in by other bodies in a combat cluster (soft-body A* now packs
    // them in — ADR-021), the old code stepped to a sideways/equal fallback that alternated tick to
    // tick → the Alerted back-and-forth. Holding at the cluster edge until an opening appears reads
    // as "surrounding the target" instead of twitching. (Flee, sign −1, still uses every neighbour.)
    if (sign === 1) {
      const cDist = Math.abs(c.x - ref.x) + Math.abs(c.y - ref.y);
      if (cDist >= curDist) break; // sorted ascending: nothing further in the list is closer either
    }
    if (isWalkable(state, c.x, c.y) && !occupancyService.isBlocked(state, c.x, c.y, mob.id)) {
      const currentNext = mob.path?.[mob.pathIndex ?? 0];
      if (currentNext && currentNext.x === c.x && currentNext.y === c.y) return mob;
      return { ...mob, path: [c], pathIndex: 0, nextCellCostLeft: undefined };
    }
  }
  return mob; // truly boxed in (or, for approach, no strictly-closer opening) — hold position
}

/**
 * Advance all moving mobs along their paths using the shared MovementSystem.
 * Called once per tick in GameEngineImpl, after stepEntities().
 */
export function advanceMobMovement(state: GameState): GameState {
  const mobs = state.mobs;
  if (!mobs || mobs.length === 0) return state;

  // Hard tile occupancy: one entity body per tile, no phasing — shared with the pawn move pass
  // via MovementSystem.stepBody so mobs and pawns enforce identical rules (MOVE-1). `occupancy` =
  // every body's CURRENT tile; `claimed` = tiles a mover has committed to entering this tick.
  const occupancy = occupancyService.blockedTiles(state); // includes self; self-tile guarded in stepBody
  const claimed = new Set<string>();
  seedMidCrossClaims(mobs, claimed, (m) => m.state !== 'Corpse');

  let changed = false;
  const next: Mob[] = new Array(mobs.length);

  for (let i = 0; i < mobs.length; i++) {
    const mob = mobs[i];
    const def = getCreatureById(mob.creatureId);
    const speed = def ? Math.max(0.5, def.stats.speed) : 1;
    const res = stepBody(mob, occupancy, claimed, state.worldMap, speed);
    next[i] = res.body;
    if (res.body !== mob) changed = true;
  }

  return changed ? { ...state, mobs: next } : state;
}

export function findNearbyWalkable(
  state: GameState,
  x: number,
  y: number,
  selfId?: string
): { x: number; y: number } | null {
  // Enumerate all 8 neighbours in random order (Fisher-Yates) so every walkable
  // direction is considered exactly once — no wasted random retries that could
  // leave a boxed-in animal stuck even when an exit exists. Entities roam freely
  // (no home tether) — they go where the AI sends them and wander from wherever they are.
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
    if (!isWalkable(state, nx, ny)) continue;
    // Diagonal wall-cut prevention (mirrors WASM A*): a diagonal step is only
    // allowed if at least one shared orthogonal neighbour is walkable.
    if (dx !== 0 && dy !== 0 && !isWalkable(state, x + dx, y) && !isWalkable(state, x, y + dy)) {
      continue;
    }
    if (selfId && occupancyService.isBlocked(state, nx, ny, selfId)) continue;
    return { x: nx, y: ny };
  }
  return null;
}

export function isWalkable(state: GameState, x: number, y: number): boolean {
  const tile = state.worldMap[y]?.[x];
  return !!tile && tile.walkable;
}

export function nearestPawn(
  mob: Mob,
  pawns: Pawn[]
): { pawn: Pawn; pos: { x: number; y: number } } | null {
  // Hot path: called once per mob per tick (O(mobs × pawns) aggregate) — the #1 dip-correlated
  // spatial cost (ENGINE-PERFORMANCE §C). Indexed loop (no `for…of` iterator allocation — the
  // self-hosted `next` churn) + build the result object ONCE at the end (not per improvement).
  let best: Pawn | null = null;
  let bestDist = Infinity;
  const mx = mob.x;
  const my = mob.y;
  for (let i = 0; i < pawns.length; i++) {
    const pos = pawns[i].position!;
    const d = Math.abs(pos.x - mx) + Math.abs(pos.y - my);
    if (d < bestDist) {
      bestDist = d;
      best = pawns[i];
    }
  }
  return best ? { pawn: best, pos: best.position! } : null;
}

export function dist(mob: Mob, pos: { x: number; y: number }): number {
  return Math.max(Math.abs(pos.x - mob.x), Math.abs(pos.y - mob.y));
}

/**
 * WASM A* path from (sx,sy) to (ex,ey). Returns the route EXCLUDING the start
 * tile, or [] if WASM is not ready or the target is unreachable. The terrain layer
 * is memoized per-worldMap reference; the entity-aware grid clones only the walkable
 * mask (occupancyService is the single source of "what's blocked"), so a path that
 * routes around bodies costs one mask clone, not a full grid rebuild.
 */
export function pathTo(
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
  const { walkable, costs, width, height } = buildPathfindingGridsSoftBlocked(
    state.worldMap,
    blocked,
    sx,
    sy,
    ex,
    ey
  );
  return wasmPathfinderService.findPath(walkable, costs, width, height, sx, sy, ex, ey);
}

export function adjacent(mob: Mob, pos: { x: number; y: number }): boolean {
  return Math.abs(pos.x - mob.x) <= 1 && Math.abs(pos.y - mob.y) <= 1;
}
