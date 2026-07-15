// Kingdom visiting parties (KINGDOMS-TRADE §3) — spawn/despawn of visitor and caravan parties.
// A party is a group of kingdom-flagged Mobs (trader/guards/visitors/pack beasts) that arrives at
// the map edge with a leash anchor just outside the colony, lingers a couple of days, then leaves.
// The party record itself (wares, lifecycle) lives on GameState.kingdomParties.

import type {
  CaravanGood,
  GameState,
  Kingdom,
  KingdomParty,
  Mob,
  WealthBand,
  WorldTile
} from '../../core/types';
import { getCreatureById } from '../../core/Creatures';
import { isSpawnableTile } from '../../core/Terrains';
import { rng } from '../../core/rng';
import { WEALTH_BANDS } from '../../core/Kingdom';
import { makeMob, equipFromLootPool } from './entitySpawning';
import { TICKS_PER_SECOND } from '../../core/time';
import { TURNS_PER_DAY } from '../EnvironmentService';
import events from '../../database/social/events.jsonc';

const TICKS_PER_DAY = TURNS_PER_DAY * TICKS_PER_SECOND;

/** Party tuning (stay length, size, camp distance) — data-driven, see database/social/events.jsonc. */
const EVENTS = events as {
  visitors: { partySize: [number, number]; stayDays: number; anchorRing: [number, number] };
  caravan: { stayDays: number; anchorRing: [number, number] };
};

/** Caravan guard gear rung per the sending kingdom's wealth (lootpool.jsonc guard_* pools). */
export const GUARD_POOL_BY_WEALTH: Record<WealthBand, string> = {
  destitute: 'guard_scraps',
  modest: 'guard_bronze',
  prosperous: 'guard_iron',
  wealthy: 'guard_steel',
  opulent: 'guard_royal'
};

function colonyCenter(state: GameState): { x: number; y: number } {
  const positioned = state.pawns.filter((p) => p.position);
  if (positioned.length === 0) {
    return {
      x: Math.floor((state.worldMap[0]?.length ?? 0) / 2),
      y: Math.floor(state.worldMap.length / 2)
    };
  }
  const sx = positioned.reduce((s, p) => s + p.position!.x, 0);
  const sy = positioned.reduce((s, p) => s + p.position!.y, 0);
  return { x: Math.round(sx / positioned.length), y: Math.round(sy / positioned.length) };
}

/** Ring-search for a walkable tile between minR and maxR tiles of (cx,cy). */
function findWalkableNear(
  map: WorldTile[][],
  cx: number,
  cy: number,
  minR: number,
  maxR: number
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 60; attempt++) {
    const angle = rng.random() * Math.PI * 2;
    const r = minR + rng.random() * (maxR - minR);
    const x = Math.round(cx + Math.cos(angle) * r);
    const y = Math.round(cy + Math.sin(angle) * r);
    if (isSpawnableTile(map[y]?.[x])) return { x, y };
  }
  return null;
}

/** A walkable tile within the outer BORDER band of the map — where a caravan enters from. Prefers
 *  the edge nearest the colony's side so the march isn't absurdly long, but any walkable edge works. */
function findMapEdgeTile(map: WorldTile[][]): { x: number; y: number } | null {
  const h = map.length;
  const w = map[0]?.length ?? 0;
  if (w === 0 || h === 0) return null;
  const BAND = 4; // how deep from the very edge is still "the edge"
  for (let attempt = 0; attempt < 300; attempt++) {
    let x: number;
    let y: number;
    switch (rng.int(0, 3)) {
      case 0: // top
        x = rng.int(0, w - 1);
        y = rng.int(0, BAND);
        break;
      case 1: // bottom
        x = rng.int(0, w - 1);
        y = rng.int(h - 1 - BAND, h - 1);
        break;
      case 2: // left
        x = rng.int(0, BAND);
        y = rng.int(0, h - 1);
        break;
      default: // right
        x = rng.int(w - 1 - BAND, w - 1);
        y = rng.int(0, h - 1);
        break;
    }
    if (isSpawnableTile(map[y]?.[x])) return { x, y };
  }
  return null;
}

/** Free tiles around a start point for placing the party members as a cluster. */
function clusterTiles(
  map: WorldTile[][],
  start: { x: number; y: number },
  count: number
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  for (let r = 0; r <= 6 && out.length < count; r++) {
    for (let dy = -r; dy <= r && out.length < count; dy++) {
      for (let dx = -r; dx <= r && out.length < count; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = start.x + dx;
        const y = start.y + dy;
        const key = `${x},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (isSpawnableTile(map[y]?.[x])) out.push({ x, y });
      }
    }
  }
  return out;
}

interface MemberSpec {
  creatureId: string;
  role: NonNullable<Mob['partyRole']>;
  lootPool?: string;
}

function partyRoster(kingdom: Kingdom, kind: KingdomParty['kind']): MemberSpec[] {
  const wealthIdx = WEALTH_BANDS.indexOf(kingdom.lore.wealthBand);
  if (kind === 'visitor') {
    const n = rng.int(EVENTS.visitors.partySize[0], EVENTS.visitors.partySize[1]);
    return Array.from({ length: n }, () => ({
      creatureId: 'kingdom_visitor',
      role: 'visitor' as const
    }));
  }
  const guardPool = GUARD_POOL_BY_WEALTH[kingdom.lore.wealthBand];
  const guards = rng.int(2, 3 + Math.ceil(wealthIdx / 2));
  const packBeasts = rng.int(1, 2 + Math.floor(wealthIdx / 2));
  return [
    { creatureId: 'kingdom_trader', role: 'trader' as const },
    ...Array.from({ length: guards }, () => ({
      creatureId: 'kingdom_guard',
      role: 'guard' as const,
      lootPool: guardPool
    })),
    ...Array.from({ length: packBeasts }, () => ({
      creatureId: 'kingdom_pack_beast',
      role: 'pack' as const
    }))
  ];
}

/**
 * Spawn a visiting party from `kingdom`. Members enter at the MAP EDGE and are given a goal-directed
 * march ('Traveling' state, `travelGoal` = an anchor near the colony), so they walk straight in and
 * then settle (Wander) to mill and trade until departure. No leash.
 */
export function spawnKingdomParty(
  state: GameState,
  kingdom: Kingdom,
  kind: KingdomParty['kind'],
  stock: CaravanGood[],
  gold: number
): { state: GameState; party: KingdomParty } | null {
  const map = state.worldMap;
  const center = colonyCenter(state);
  // Anchor: where the party settles to mill and trade — a ring from the colony so it camps at a
  // respectful distance instead of sitting on top of the colonists (spec §3).
  const ring = kind === 'caravan' ? EVENTS.caravan.anchorRing : EVENTS.visitors.anchorRing;
  const anchor = findWalkableNear(map, center.x, center.y, ring[0], ring[1]);
  if (!anchor) return null;
  // Entry: a walkable tile at the MAP EDGE, so the party visibly marches the map to reach the colony.
  // Fall back to a far-from-colony ring, then the anchor, if the edge is all water/mountain.
  const entry =
    findMapEdgeTile(map) ??
    findWalkableNear(map, center.x, center.y, 40, 90) ??
    anchor;

  const roster = partyRoster(kingdom, kind);
  const tiles = clusterTiles(map, entry, roster.length);
  if (tiles.length === 0) return null;

  const turn = state.turn;
  const partyId = `party-${kingdom.id}-${turn}`;
  const members: Mob[] = [];
  for (let i = 0; i < roster.length; i++) {
    const spec = roster[i];
    const def = getCreatureById(spec.creatureId);
    if (!def) continue;
    const tile = tiles[Math.min(i, tiles.length - 1)];
    const mob = makeMob(def, tile.x, tile.y, turn);
    mob.kingdomId = kingdom.id;
    mob.partyId = partyId;
    mob.partyRole = spec.role;
    // The human members (traders, guards, visitors) are working adults, not the 1-12 creature-flavour
    // age makeMob rolls — a 6-year-old caravan guard was possible. Pack beasts stay on the animal roll.
    if (spec.role !== 'pack') mob.age = rng.int(18, 60);
    // Goal-directed march (no leash): head straight for the anchor near the colony, then settle
    // (Wander) on arrival — the 'Traveling' FSM state.
    mob.state = 'Traveling';
    mob.travelGoalX = anchor.x;
    mob.travelGoalY = anchor.y;
    // Guards draw the wealth-appropriate rung, overriding the def's default pool.
    if (spec.lootPool) mob.equipment = equipFromLootPool(spec.lootPool) ?? mob.equipment;
    members.push(mob);
  }
  if (members.length === 0) return null;

  const stayDays = kind === 'caravan' ? EVENTS.caravan.stayDays : EVENTS.visitors.stayDays;
  const party: KingdomParty = {
    id: partyId,
    kingdomId: kingdom.id,
    kind,
    mobIds: members.map((m) => m.id),
    traderMobId: members.find((m) => m.partyRole === 'trader')?.id,
    arrivedTurn: turn,
    departTurn: turn + Math.round(stayDays * TICKS_PER_DAY),
    stock,
    gold
  };

  return {
    state: {
      ...state,
      mobs: [...(state.mobs ?? []), ...members],
      kingdomParties: [...(state.kingdomParties ?? []), party]
    },
    party
  };
}

/** Remove a party from the map — live members leave (despawn); corpses stay where they fell. */
export function despawnKingdomParty(state: GameState, partyId: string): GameState {
  const party = state.kingdomParties?.find((p) => p.id === partyId);
  if (!party) return state;
  const memberIds = new Set(party.mobIds);
  return {
    ...state,
    mobs: (state.mobs ?? []).filter((m) => !memberIds.has(m.id) || m.isAlive === false),
    kingdomParties: (state.kingdomParties ?? []).filter((p) => p.id !== partyId)
  };
}
