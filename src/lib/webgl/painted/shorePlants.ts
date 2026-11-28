import type { WorldTile } from '$lib/game/core/types.js';
import { chamferDistance } from '$lib/game/world/chamfer.js';
import {
  POND_AREA,
  beachStretch,
  isWet,
  shoreHash,
  shoreNoise,
  stillWaters
} from '$lib/game/world/shores.js';

const DRY = 0;
const STILL = 1;
const STREAM = 2;
const MAX_STALKS = 3;
const MAX_PADS = 8;
const MIN_PADS = 5;
const POND_REED_REACH = 1.6;
const POND_LILY_REACH = 5.5;
const POND_REED_FROM = 0.38;
const LAKE_REED_REACH = 2.2;
const LAKE_REED_FROM = 0.56;
const STREAM_REED_REACH = 1.2;
const STREAM_REED_FROM = 0.68;
const STREAM_CLEAR_OF_POND = 3;
const RAFT_FROM = 0.72;

interface ShorePlan {
  w: number;
  h: number;
  rows: WorldTile[][];
  water: Uint8Array;
  plants: Uint8Array;
}

const plans = new WeakMap<WorldTile[][], ShorePlan>();
let latest: ShorePlan | undefined;

const waterAt = (t: WorldTile): number => (!isWet(t) ? DRY : t.river ? STREAM : STILL);

function waterOf(world: WorldTile[][], w: number, h: number): Uint8Array {
  const water = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) water[y * w + x] = waterAt(world[y][x]);
  return water;
}

function reedsAt(x: number, y: number, core: number): number {
  if (core < 0.06 && shoreHash(x, y, 513) < 0.5) return 0;
  return 1 + (core > 0.1 ? 1 : 0) + (core > 0.2 ? 1 : 0);
}

function padsAt(x: number, y: number): number {
  const raft = shoreNoise(x / 3.5, y / 3.5, 515) - RAFT_FROM;
  return raft <= 0 ? 0 : Math.min(MAX_PADS, MIN_PADS + Math.floor(raft * 60));
}

function plan(world: WorldTile[][], w: number, h: number, water: Uint8Array): ShorePlan {
  const { id, sizes } = stillWaters(world);
  const size = (i: number) => (id[i] >= 0 ? sizes[id[i]] : 0);
  const pond = (i: number) => size(i) > 0 && size(i) < POND_AREA;
  const toLand = chamferDistance(w, h, (i) => water[i] === DRY);
  const toPond = chamferDistance(w, h, pond);
  const plants = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (water[i] === DRY) continue;
      const d = toLand[i];
      const bed = shoreNoise(x / 7, y / 7, 511);
      if (pond(i)) {
        if (d <= POND_REED_REACH && bed > POND_REED_FROM)
          plants[i] = reedsAt(x, y, bed - POND_REED_FROM);
        else if (d > POND_REED_REACH && d < POND_LILY_REACH) plants[i] = padsAt(x, y);
        continue;
      }
      if (beachStretch(x, y) > 0) continue;
      const lake = size(i) >= POND_AREA;
      if (!lake && !(water[i] === STREAM && toPond[i] > STREAM_CLEAR_OF_POND)) continue;
      const reach = lake ? LAKE_REED_REACH : STREAM_REED_REACH;
      const from = lake ? LAKE_REED_FROM : STREAM_REED_FROM;
      if (d <= reach && bed > from) plants[i] = reedsAt(x, y, bed - from);
    }
  return { w, h, rows: [...world], water, plants };
}

function sameWater(p: ShorePlan, world: WorldTile[][], w: number, h: number): boolean {
  if (p.w !== w || p.h !== h) return false;
  for (let y = 0; y < h; y++) {
    const row = world[y];
    if (row === p.rows[y]) continue;
    for (let x = 0; x < w; x++) if (waterAt(row[x]) !== p.water[y * w + x]) return false;
    p.rows[y] = row;
  }
  return true;
}

function planFor(world: WorldTile[][]): ShorePlan {
  const known = plans.get(world);
  if (known) return known;
  const h = world.length;
  const w = world[0]?.length ?? 0;
  const next =
    latest && sameWater(latest, world, w, h) ? latest : plan(world, w, h, waterOf(world, w, h));
  plans.set(world, next);
  latest = next;
  return next;
}

export function shorePlantAt(world: WorldTile[][], x: number, y: number): string | undefined {
  const p = planFor(world);
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return undefined;
  const code = p.plants[y * p.w + x];
  if (!code) return undefined;
  return code <= MAX_STALKS ? `reedbed/${code}` : `lilies/${code}`;
}
