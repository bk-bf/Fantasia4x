// Shared entity helpers — queries, movement, and foraging lookups used by the spawning, AI, and
// lifecycle modules. Extracted from EntityService (P-4); converted from class methods to free
// functions (the class had no instance state but `idCounter`, so `this.` simply dropped away).
import type { GameState, Mob, Pawn, WorldTile } from '../../core/types';
import { getCreatureById, type CreatureDefinition } from '../../core/Creatures';
import { pawnById } from '../../core/pawnIndex';
import { manhattan, chebyshev } from '../../core/distance';
import { SECONDS_PER_TICK } from '../../core/time';
import { stepBody, seedMidCrossClaims } from '../../systems/MovementSystem';
import { resourceObjectService } from '../ResourceObjectService';
import { wasmPathfinderService } from '../WasmPathfinderService';
import { buildSharedSoftBlockedGrid } from '../PathfinderService';
import { occupancyService } from '../OccupancyService';
import { hasLineOfSight } from '../../systems/rangedCombat';
import { reachable } from './connectivity';
import { simLog } from '../../core/logSink';
import { rng } from '../../core/rng';
import {
  type TileFoodKind,
  WILD_FORAGE_RESOURCE_IDS,
  HUNT_RADIUS,
  WANDER_MOVES_PER_SECOND,
  AI_THROTTLE_TICKS
} from './entityConstants';

export function entityName(mob: Mob): string {
  const def = getCreatureById(mob.creatureId);
  return def ? `${def.name} #${mob.debugId ?? mob.id.slice(-4)}` : mob.id.slice(-6);
}

export function edibleResourceOnTile(
  tile: { resources?: Record<string, number> } | undefined,
  kinds: Set<TileFoodKind>
): string | null {
  const res = tile?.resources;
  if (!res) return null;
  const wantGrass = kinds.has('grass');
  const wantForage = kinds.has('forage');
  // `for…in` (no Object.entries array alloc) — this runs per tile of the food scan (×thousands), so the
  // per-call allocation was real GC churn at scale (ENGINE-PERFORMANCE — harpy-chase trace, ~10%).
  for (const k in res) {
    if ((res[k] ?? 0) <= 0) continue;
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
  // Ring-scan nearest-first and return the FIRST hit. For grass (on ~every walkable tile) that's d≤1 —
  // not the full (2·radius+1)² block (radius 120 ⇒ 58k tiles). Only sparse forage forces it outward.
  for (let d = 0; d <= radius; d++) {
    for (let dx = -d; dx <= d; dx++) {
      const ay = d - Math.abs(dx);
      const dys = ay === 0 ? [0] : [ay, -ay]; // the two tiles of this Manhattan ring at column dx
      for (const dy of dys) {
        const tile = state.worldMap[y + dy]?.[x + dx];
        if (tile?.walkable && edibleResourceOnTile(tile, kinds)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
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
  maxCandidates = 12
): { target: { x: number; y: number }; path: { x: number; y: number }[] } | null {
  if (kinds.size === 0) return null;
  // Ring-scan nearest-first, collecting only the NEAREST `maxCandidates` edible tiles (already distance-
  // ordered, so no sort) and stopping there — then A*-probe them for reachability. For grass this stops
  // at d≤1; the old code scanned all (2·radius+1)² tiles (radius 120 ⇒ 58k) before sorting, which was
  // ~20% of the worker in a graze-heavy scene. Same tiles get probed (the nearest reachable ones).
  const candidates: { x: number; y: number }[] = [];
  collect: for (let d = 0; d <= radius; d++) {
    for (let dx = -d; dx <= d; dx++) {
      const ay = d - Math.abs(dx);
      const dys = ay === 0 ? [0] : [ay, -ay];
      for (const dy of dys) {
        const nx = mob.x + dx;
        const ny = mob.y + dy;
        const tile = state.worldMap[ny]?.[nx];
        // Only collect food in the mob's OWN walkable component — a bush across a river/wall is walkable
        // but unpathable, and probing it with A* was the wasted-sweep cost. reachable() is O(1).
        if (
          tile?.walkable &&
          reachable(mob.x, mob.y, nx, ny) &&
          edibleResourceOnTile(tile, kinds)
        ) {
          candidates.push({ x: nx, y: ny });
          if (candidates.length >= maxCandidates) break collect;
        }
      }
    }
  }
  for (const c of candidates) {
    if (c.x === mob.x && c.y === mob.y) return { target: c, path: [] };
    const path = pathTo(state, mob.x, mob.y, c.x, c.y, mob.id, "forage");
    if (path.length) return { target: c, path };
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

// ENGINE-PERFORMANCE-II §S1 (ADR-008): the prey→nearest-predator map, computed ONCE per tick with the
// WASM spatial-core uniform-grid batch query instead of the old O(prey × predators) double loop (the
// `nearestPredatorThreat` + `dist` hot pair in the trace). Keyed on the allMobs ref (self-invalidates
// on any mob change, like mobThreatSubsets). The batch radius bounds the search; each prey then applies
// its own light-scaled vision. Falls back to the JS scan until the WASM is initialised in the worker.
const THREAT_QUERY_RANGE = 40; // ≥ any effective vision range (base ≤ ~25 + night/light boost)
let _predNearestCache: { ref: Mob[] | undefined; map: Map<string, Mob | null> } | null = null;

function nearestPredatorMap(allMobs: Mob[]): Map<string, Mob | null> {
  if (_predNearestCache && _predNearestCache.ref === allMobs) return _predNearestCache.map;
  const { predators, prey } = mobThreatSubsets(allMobs);
  const map = new Map<string, Mob | null>();
  if (predators.length > 0 && prey.length > 0) {
    const pts = new Float32Array(predators.length * 2);
    for (let i = 0; i < predators.length; i++) {
      pts[2 * i] = predators[i].x;
      pts[2 * i + 1] = predators[i].y;
    }
    const qrs = new Float32Array(prey.length * 2);
    for (let i = 0; i < prey.length; i++) {
      qrs[2 * i] = prey[i].x;
      qrs[2 * i + 1] = prey[i].y;
    }
    const res = wasmPathfinderService.nearestEach(pts, qrs, THREAT_QUERY_RANGE);
    if (res) {
      for (let i = 0; i < prey.length; i++) {
        const idx = res[i];
        map.set(prey[i].id, idx >= 0 ? predators[idx] : null);
      }
    } else {
      // WASM not ready yet → identical-behaviour JS fallback (the old per-prey scan).
      for (const p of prey) {
        let best: Mob | null = null;
        let bd = THREAT_QUERY_RANGE;
        for (const m of predators) {
          if (m.id === p.id) continue;
          const d = dist(p, { x: m.x, y: m.y });
          if (d < bd) {
            bd = d;
            best = m;
          }
        }
        map.set(p.id, best);
      }
    }
  }
  _predNearestCache = { ref: allMobs, map };
  return map;
}

export function findNearestPrey(
  mob: Mob,
  allMobs: Mob[],
  allowLivePrey: boolean,
  worldMap: WorldTile[][]
): Mob | null {
  let best: Mob | null = null;
  let bestDist = Infinity;
  // Only commit to a target the hunter can actually SEE — a prey/corpse behind a wall is unreachable, and
  // pathing to it makes A* sweep the whole connected region (the 78%-fail perf cliff). Reuses the same
  // `blocksSight` Bresenham LOS as pawn aggro, and is the LAST check (only ray-cast a candidate that would
  // become the nearest), so it's a handful of rays per hunting mob, not one per prey.
  // Targetable = REACHABLE (same walkable component — O(1), so checked first to short-circuit) AND in
  // line of sight (the gameplay gate: a hunter pursues only what it can actually see).
  const canTarget = (c: Mob) =>
    reachable(mob.x, mob.y, c.x, c.y) && hasLineOfSight(worldMap, mob.x, mob.y, c.x, c.y);
  // Pre-filtered prey subset (corpses with intactness>0 + live non-tamed huntables), once per tick.
  for (const candidate of mobThreatSubsets(allMobs).prey) {
    if (candidate.id === mob.id) continue;
    // Never hunt a LIVE conspecific — a predator doesn't stalk its own kind (the harpies/wolves-
    // fight-each-other bug: same-species mobs locked into mutual Attacking). Same creatureId = ally;
    // cross-species predation is still allowed, and scavenging ANY corpse (incl. same species) stays.
    if (candidate.state !== 'Corpse' && candidate.creatureId === mob.creatureId) continue;
    const raw = manhattan(candidate.x, candidate.y, mob.x, mob.y);
    if (candidate.state === 'Corpse') {
      // Corpses weighted as 50% closer — free food with no danger.
      const d = raw * 0.5;
      if (d < bestDist && canTarget(candidate)) {
        bestDist = d;
        best = candidate;
      }
    } else if (allowLivePrey && raw <= HUNT_RADIUS) {
      if (raw < bestDist && canTarget(candidate)) {
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
  // §S1: O(1) lookup into the per-tick WASM batch result (nearest predator within THREAT_QUERY_RANGE);
  // apply this prey's own light-scaled vision to the cached nearest.
  const best = nearestPredatorMap(allMobs).get(prey.id);
  if (!best) return null;
  const d = dist(prey, { x: best.x, y: best.y });
  return d <= visionRange ? { pos: { x: best.x, y: best.y } } : null;
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
    threats.reduce((m, t) => Math.min(m, chebyshev(t.x, t.y, x, y)), Infinity);

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
/** Length of one flight burst (tiles). Prey bolts ~this far in the safest committed direction, then
 *  re-evaluates (Alert / re-flee if a threat is still close) — like a real animal's short escape sprint,
 *  not a run to the far side of the map. Critically also a PERF bound: the old `max(w,h)/2` destination
 *  (250 tiles on a 500² map) made flee A* sweep the whole connected region on the common unreachable
 *  case (78% of mob path fails); a short burst keeps the path short AND reachable. Stamina still gates
 *  how long the running actually lasts. */
const FLEE_BURST_TILES = 22;
/** A* node-expansion cap for MOB paths (passed to the WASM pathfinder). Mob targets are short-range, so
 *  a reachable path finishes far under this; an unreachable goal bails here (<1ms) instead of sweeping
 *  the whole open region. Pawns omit it (full default budget for cross-map paths). */
const MOB_PATH_MAX_ITER = 8000;

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
  // A SHORT escape burst (capped at half-map for tiny maps), not a run to the map's far edge.
  const fleeDistance = Math.min(FLEE_BURST_TILES, Math.max(8, Math.floor(Math.max(w, h) / 2)));
  const minThreatDist = (x: number, y: number) =>
    threats.reduce((m, t) => Math.min(m, chebyshev(t.x, t.y, x, y)), Infinity);

  // Keep heading to the LOCKED destination: re-route to it around whatever blocked us, as long as we
  // haven't reached it and it's still far from every threat. This is what stops the direction flip.
  const dest = mob.fleeDest;
  if (dest) {
    const reached = chebyshev(dest.x, dest.y, mob.x, mob.y) <= FLEE_REACHED_DIST;
    const stillSafe = minThreatDist(dest.x, dest.y) > fleeDistance / 2;
    if (!reached && stillSafe) {
      const path = pathTo(state, mob.x, mob.y, dest.x, dest.y, mob.id, "flee");
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
    // Skip a heading whose safe point isn't in the mob's component (unpathable) before spending an A*.
    if (
      !goal ||
      (goal.x === mob.x && goal.y === mob.y) ||
      !reachable(mob.x, mob.y, goal.x, goal.y)
    )
      continue;
    const path = pathTo(state, mob.x, mob.y, goal.x, goal.y, mob.id, "flee2");
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
      const d = manhattan(nx, ny, from.x, from.y);
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
  const targetMoved = !pathEnd || chebyshev(pathEnd.x, pathEnd.y, targetPos.x, targetPos.y) > 1.5;
  const repathDue = pathExhausted || (targetMoved && (turn - mob.stateSince) % 10 === 0);
  if (!repathDue) return { kind: 'hold' };
  const approachTile = bestApproachTile(state, mob, targetPos, mob.id) ?? targetPos;
  const path = pathTo(state, mob.x, mob.y, approachTile.x, approachTile.y, mob.id, "approach");
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
  const curDist = manhattan(mob.x, mob.y, ref.x, ref.y);
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
    const dA = manhattan(a.x, a.y, ref.x, ref.y);
    const dB = manhattan(b.x, b.y, ref.x, ref.y);
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
      const cDist = manhattan(c.x, c.y, ref.x, ref.y);
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
  // Each moving body's intended next tile (mobs + pawns) — lets stepBody break head-on swaps at once.
  const targetByTile = occupancyService.movingTargets(state);
  const claimed = new Set<string>();
  seedMidCrossClaims(mobs, claimed, (m) => m.state !== 'Corpse');

  let changed = false;
  const next: Mob[] = new Array(mobs.length);

  for (let i = 0; i < mobs.length; i++) {
    const mob = mobs[i];
    const def = getCreatureById(mob.creatureId);
    const speed = def ? Math.max(0.5, def.stats.speed) : 1;
    const res = stepBody(mob, occupancy, claimed, state.worldMap, speed, targetByTile);
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

/**
 * §LOD vision bubble: is the mob within `radius` (Chebyshev) of ANY live pawn? Drives the per-tick sim
 * gate — a mob outside the bubble FREEZES (no FSM / A* / hunger / combat), getting only cheap periodic
 * background drift. O(pawns) per mob; pawns are few, so the whole gate is ~O(mobs × pawns) — negligible
 * next to the per-mob A* it elides. This is the architecture's primary scaling lever at full-map sizes.
 */
export function mobInLiveRegion(
  mob: { x: number; y: number },
  pawns: Pawn[],
  radius: number
): boolean {
  for (let i = 0; i < pawns.length; i++) {
    const pos = pawns[i].position;
    if (pos && Math.abs(pos.x - mob.x) <= radius && Math.abs(pos.y - mob.y) <= radius) return true;
  }
  return false;
}

/**
 * §LOD temporal throttle: is THIS tick the mob's staggered "think" tick? A stable hash of the id spreads
 * each mob to a fixed slot in the AI_THROTTLE_TICKS window, so only ~mobs/N run their full FSM + hunger
 * on any given tick (the rest hold state + keep moving). Shared by the FSM (stepEntities) and hunger
 * (stepHunger) so a mob thinks and hungers on the SAME tick (consistent cadence). Cheap (O(id length)).
 */
export function isThinkTick(id: string, turn: number): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return turn % AI_THROTTLE_TICKS === (h >>> 0) % AI_THROTTLE_TICKS;
}

export function nearestPawn(
  mob: Mob,
  pawns: Pawn[],
  skipDowned = false
): { pawn: Pawn; pos: { x: number; y: number } } | null {
  // Hot path: called once per mob per tick (O(mobs × pawns) aggregate) — the #1 dip-correlated
  // spatial cost (ENGINE-PERFORMANCE §C). Indexed loop (no `for…of` iterator allocation — the
  // self-hosted `next` churn) + build the result object ONCE at the end (not per improvement).
  // `skipDowned`: ignore Collapsed pawns so a mob that won't finish them off doesn't even SEE them as a
  // threat — it keeps wandering instead of ping-ponging Wander↔Alerted over an unconscious body.
  let best: Pawn | null = null;
  let bestDist = Infinity;
  const mx = mob.x;
  const my = mob.y;
  for (let i = 0; i < pawns.length; i++) {
    if (skipDowned && pawns[i].currentState === 'Collapsed') continue;
    const pos = pawns[i].position!;
    const d = manhattan(pos.x, pos.y, mx, my);
    if (d < bestDist) {
      bestDist = d;
      best = pawns[i];
    }
  }
  return best ? { pawn: best, pos: best.position! } : null;
}

/** Chebyshev distance between a mob and a point (object-shaped convenience over `chebyshev`). */
export function dist(mob: Mob, pos: { x: number; y: number }): number {
  return chebyshev(mob.x, mob.y, pos.x, pos.y);
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
  selfId?: string,
  label = '?'
): { x: number; y: number }[] {
  if (!wasmPathfinderService.isReady()) return [];
  // Entities are SOFT obstacles: each body adds a routing-cost penalty so paths prefer to route AROUND
  // others, but never become impassable (the movement engine enforces no-stacking by holding at an
  // occupied tile). PERF: use the per-tick SHARED occupancy + grid (built once, reused by every mob
  // pathing this tick) instead of rebuilding the full-map cost array per request — that per-request
  // O(map) clone was 35% of the worker in a busy combat tick. `selfId` is intentionally not excluded:
  // the penalty only matters as routing cost, and a penalty on the mover's own start tile is moot (A*
  // start g=0). This drops the start/goal exemption too (see buildSharedSoftBlockedGrid).
  void selfId;
  const blocked = occupancyService.blockedTilesShared(state);
  const { walkable, costs, width, height } = buildSharedSoftBlockedGrid(state.worldMap, blocked);
  const _t0 = performance.now();
  // Mob paths are always SHORT-range (flee burst / hunt within radius / forage radius), so cap A* node
  // expansions tightly: a reachable short path finishes well under this, but an UNREACHABLE goal bails
  // here instead of sweeping the whole 130k-tile open region (the fleeing-prey perf cliff). Pawns keep
  // the full default budget (they path cross-map). The LOS-gate + short flee cut the fails; this bounds
  // any residual to <1ms regardless of map size.
  const res = wasmPathfinderService.findPath(
    walkable,
    costs,
    width,
    height,
    sx,
    sy,
    ex,
    ey,
    MOB_PATH_MAX_ITER
  );
  // Neutral A* diagnostics (read+reset by GameEngineImpl's phase log): a FAIL is an empty result —
  // an unreachable goal that made A* exhaust the whole connected region (the expensive case). Lets us
  // tell "too many cheap paths" (high calls) from "few ruinous searches" (high fails / ms-per-call).
  _pathMs += performance.now() - _t0;
  _pathCalls++;
  const lab = (_pathByLabel[label] ??= { calls: 0, fails: 0 });
  lab.calls++;
  if (res.length === 0) {
    _pathFails++;
    lab.fails++;
    // Sample a few concrete failures per window (label + from→to + manhattan dist) so we can SEE which
    // mobs are pathing where to nothing. Throttled to keep the log readable.
    if (_failSamples < 8) {
      _failSamples++;
      simLog.logEvent({
        category: 'ai',
        severity: 'info',
        turn: state.turn,
        message: `PATHFAIL ${label} ${selfId ?? '?'} (${sx},${sy})->(${ex},${ey}) d=${Math.abs(ex - sx) + Math.abs(ey - sy)}`
      });
    }
  } else _pathLen += res.length;
  return res;
}

const _pathByLabel: Record<string, { calls: number; fails: number }> = {};
let _failSamples = 0;
let _pathCalls = 0;
let _pathFails = 0;
let _pathMs = 0;
let _pathLen = 0;
/** Read + reset the per-window mob A* counters (calls / unreachable-fails / total ms / total tiles),
 *  plus a per-call-site `calls/fails` breakdown so the dominant failing BEHAVIOUR is named. */
export function readMobPathStats(): {
  calls: number;
  fails: number;
  ms: number;
  len: number;
  byLabel: string;
} {
  const byLabel = Object.entries(_pathByLabel)
    .sort((a, b) => b[1].fails - a[1].fails)
    .map(([k, v]) => `${k}=${v.fails}/${v.calls}`)
    .join(' ');
  const s = { calls: _pathCalls, fails: _pathFails, ms: _pathMs, len: _pathLen, byLabel };
  _pathCalls = _pathFails = _pathMs = _pathLen = 0;
  _failSamples = 0;
  for (const k in _pathByLabel) delete _pathByLabel[k];
  return s;
}

export function adjacent(mob: Mob, pos: { x: number; y: number }): boolean {
  return Math.abs(pos.x - mob.x) <= 1 && Math.abs(pos.y - mob.y) <= 1;
}
