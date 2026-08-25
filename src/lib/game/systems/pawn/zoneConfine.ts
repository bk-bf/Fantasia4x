import type { GameState } from '../../core/types';

let _zi: unknown = null;
let _dz: unknown = null;
let _zoneTiles = new Map<string, Set<string>>();
let _restrictZones: { id: string; pawns: Set<string> }[] = [];
let _byPawn = new Map<string, Set<string> | null>();

function rebuild(state: GameState): void {
  _zi = state.zoneInstances;
  _dz = state.designationZoneId;
  _zoneTiles = new Map();
  _restrictZones = [];
  _byPawn = new Map();
  const restrict = (state.zoneInstances ?? []).filter((z) => z.type === 'restrict');
  if (restrict.length === 0) return;
  for (const z of restrict) _zoneTiles.set(z.id, new Set());
  for (const [tile, layers] of Object.entries(state.designationZoneId ?? {})) {
    const zid = layers?.restrict;
    if (zid) _zoneTiles.get(zid)?.add(tile);
  }
  _restrictZones = restrict.map((z) => ({ id: z.id, pawns: new Set(z.assignedPawnIds ?? []) }));
}

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
    result = union.size > 0 ? union : null;
  }
  _byPawn.set(pawnId, result);
  return result;
}

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
