// zoneConfine — restriction-zone confinement lookup. A pawn assigned to one or more `restrict`
// ZoneInstances may only move within the UNION of those zones' painted tiles (RimWorld-style allowed
// area); a pawn in no restrict zone roams the whole map. Shared by the pawn pathing helpers (to mask the
// A* grid) and the work handler (to gate which jobs a confined pawn may claim).
import type { GameState } from '../../core/types';

// Memo keyed on the (zoneInstances, designationZoneId) refs — both immutable within a sim tick, so the
// per-zone tile sets and per-pawn unions are computed at most once per tick and reused across every pawn
// path/job check. A ref change (zone painted, pawn assigned) rebuilds.
let _zi: unknown = null;
let _dz: unknown = null;
let _zoneTiles = new Map<string, Set<string>>(); // restrict zone id → its "x,y" tiles
let _restrictZones: { id: string; pawns: Set<string> }[] = [];
let _byPawn = new Map<string, Set<string> | null>(); // pawnId → allowed union (null = unrestricted)

function rebuild(state: GameState): void {
  _zi = state.zoneInstances;
  _dz = state.designationZoneId;
  _zoneTiles = new Map();
  _restrictZones = [];
  _byPawn = new Map();
  const restrict = (state.zoneInstances ?? []).filter((z) => z.type === 'restrict');
  if (restrict.length === 0) return;
  for (const z of restrict) _zoneTiles.set(z.id, new Set());
  for (const [tile, zid] of Object.entries(state.designationZoneId ?? {})) {
    _zoneTiles.get(zid)?.add(tile);
  }
  _restrictZones = restrict.map((z) => ({ id: z.id, pawns: new Set(z.assignedPawnIds ?? []) }));
}

/**
 * The set of "x,y" tiles a pawn is confined to, or `null` if it is unrestricted (assigned to no restrict
 * zone — the common case — OR assigned only to zones that have no painted tiles, which can't confine
 * anyone, so we treat it as unrestricted rather than freezing the pawn on an empty allowed area).
 */
export function allowedTilesForPawn(state: GameState, pawnId: string): Set<string> | null {
  if (_zi !== state.zoneInstances || _dz !== state.designationZoneId) rebuild(state);
  if (_restrictZones.length === 0) return null;
  const cached = _byPawn.get(pawnId);
  if (cached !== undefined) return cached;

  const myZones = _restrictZones.filter((z) => z.pawns.has(pawnId));
  let result: Set<string> | null = null;
  if (myZones.length > 0) {
    const union = new Set<string>();
    for (const z of myZones) for (const t of _zoneTiles.get(z.id) ?? []) union.add(t);
    result = union.size > 0 ? union : null; // empty union (unpainted zones) ⇒ no confinement
  }
  _byPawn.set(pawnId, result);
  return result;
}

/** Nearest "x,y" tile in `allowed` to (x,y), by squared distance — the tile a pawn standing OUTSIDE its
 *  restriction zone walks back to (so drawing a zone away from a pawn marches it in, rather than freezing
 *  it). Returns null only for an empty set. O(|allowed|), but called only for the rare out-of-zone pawn. */
export function nearestAllowedTile(
  allowed: Set<string>,
  x: number,
  y: number
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const key of allowed) {
    const c = key.indexOf(',');
    const tx = +key.slice(0, c);
    const ty = +key.slice(c + 1);
    const d = (tx - x) * (tx - x) + (ty - y) * (ty - y);
    if (d < bestD) {
      bestD = d;
      best = { x: tx, y: ty };
    }
  }
  return best;
}
