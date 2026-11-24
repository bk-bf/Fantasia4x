import { hash } from '../../pixelArt/noise.js';
import {
  LONG_STACK_SIZE,
  storageStage,
  type ItemStorage,
  type LongKind
} from '../../game/services/storageRules.js';

export const DROP_TILE = 32;
export const DROP_FOOT = { x: 16, y: 23 };

export type DropPose = 'pile' | 'lean' | 'lie' | 'ground';

export type DropRule =
  | 'pile'
  | 'joined'
  | 'against wall'
  | 'rests on its station'
  | 'rests on the log pile'
  | 'leans on a station'
  | 'leans on the wall'
  | 'laid at the field edge'
  | 'lies in the grass'
  | 'lies on the ground'
  | 'sits on the ground';

export interface DropStation {
  kind: string;
  x: number;
  y: number;
  low: boolean;
}

export interface DropSurroundings {
  wall(x: number, y: number): boolean;
  zone(x: number, y: number): boolean;
  field(x: number, y: number): boolean;
  grass(x: number, y: number): boolean;
  stations: readonly DropStation[];
}

export interface DropReach {
  leanHeight: number;
  lieWidth: number;
}

export interface PlannedDrop {
  id: string;
  item: string;
  x: number;
  y: number;
  quantity: number;
  storage: ItemStorage;
  reach?: DropReach;
}

export interface DropPlacement {
  id: string;
  x: number;
  y: number;
  pose: DropPose;
  stage: number;
  flip: boolean;
  dx: number;
  dy: number;
  copies: number;
  cover: boolean;
  rule: DropRule;
}

export const STATIONS_OF_TOOL: Readonly<Partial<Record<LongKind, readonly string[]>>> = {
  hammer: ['anvil', 'bloomery', 'stone_forge', 'casting_hearth', 'finery_forge'],
  tongs: ['bloomery', 'stone_forge', 'casting_hearth', 'finery_forge', 'anvil'],
  pick: ['masons_bench'],
  dagger: ['butcher_spot', 'dressing_stone', 'flensing_table'],
  saw: ['carpenter_bench', 'sawtable']
};

const RUN_LENGTH = 3;
const COPY_STEP = 5;
const STATION_HALF_WIDTH = 15;
const LOG_PILE_HALF_WIDTH = 17;
const PILE_FOOT = { open: 25, wallAbove: 11, wallBelow: 15 };
const WORN_FOOT = { wallAbove: 8, wallBelow: 14 };
const WALL_LEAN_FOOT = 7;
const SIDE_LEAN = { inset: 12, foot: 22 };
const LYING_FOOT = 22;
const FIELD_EDGE = { inset: 15, foot: 24 };
const DEFAULT_REACH: DropReach = { leanHeight: DROP_TILE, lieWidth: DROP_TILE };

const jitter = (d: PlannedDrop, seed: number, salt: number, span: number): number =>
  Math.round((hash(d.x * 7 + salt, d.y * 13, seed) - 0.5) * span);

const coin = (d: PlannedDrop, seed: number, salt: number): boolean =>
  hash(d.x * 5 + salt, d.y * 11, seed) > 0.5;

const within = (v: number, room: number): number => Math.max(-room, Math.min(room, v)) || 0;

const roomFor = (length: number): number => Math.max(0, Math.floor((DROP_TILE - length) / 2));

interface Rest {
  dx: number;
  dy: number;
  flip: boolean;
  rule: DropRule;
}

interface Pile {
  x: number;
  y: number;
  logs: boolean;
  dx: number;
  dy: number;
}

interface Support {
  tx: number;
  ty: number;
  dx: number;
  dy: number;
  half: number;
  rule: DropRule;
}

function support(
  env: DropSurroundings,
  d: PlannedDrop,
  piles: readonly Pile[]
): Support | undefined {
  const tool = d.storage.kind === 'long' && d.storage.tool ? d.storage.long : undefined;
  const near = env.stations.filter(
    (s) => Math.abs(s.x - d.x) <= 1 && Math.abs(s.y - d.y) <= 1 && s.y <= d.y
  );
  const at = (s: DropStation, rule: DropRule): Support => ({
    tx: s.x,
    ty: s.y,
    dx: 0,
    dy: 0,
    half: STATION_HALF_WIDTH,
    rule
  });
  const own = tool && near.find((s) => STATIONS_OF_TOOL[tool]?.includes(s.kind));
  if (own) return at(own, 'rests on its station');
  if (tool === 'axe') {
    const logs = piles.find((p) => p.logs && p.y === d.y && Math.abs(p.x - d.x) === 1);
    if (logs)
      return {
        tx: logs.x,
        ty: logs.y,
        dx: logs.dx,
        dy: logs.dy,
        half: LOG_PILE_HALF_WIDTH,
        rule: 'rests on the log pile'
      };
  }
  const beside = near.find((s) => !s.low && (s.y === d.y || s.x === d.x));
  return beside && at(beside, 'leans on a station');
}

function against(d: PlannedDrop, s: Support): Rest {
  const side = s.tx < d.x ? 1 : s.tx > d.x ? -1 : (d.x + d.y) % 2 ? 1 : -1;
  return {
    dx: (s.tx - d.x) * DROP_TILE + s.dx + side * (s.half + 1),
    dy: (s.ty - d.y) * DROP_TILE + s.dy + 2,
    flip: side < 0,
    rule: s.rule
  };
}

function pileRest(env: DropSurroundings, d: PlannedDrop, seed: number, joined: boolean): Rest {
  const above = env.wall(d.x, d.y - 1);
  const foot = above
    ? PILE_FOOT.wallAbove
    : env.wall(d.x, d.y + 1)
      ? PILE_FOOT.wallBelow
      : PILE_FOOT.open;
  return {
    dx: jitter(d, seed, 1, 4) - (env.wall(d.x - 1, d.y) ? 3 : 0),
    dy: foot - DROP_FOOT.y + jitter(d, seed, 2, above ? 2 : 5),
    flip: false,
    rule: joined ? 'joined' : above ? 'against wall' : 'pile'
  };
}

function longRest(
  env: DropSurroundings,
  d: PlannedDrop,
  long: LongKind,
  seed: number,
  piles: readonly Pile[]
): Rest & { pose: DropPose } {
  const reach = d.reach ?? DEFAULT_REACH;
  const held = support(env, d, piles);
  if (held) return { ...against(d, held), pose: 'lean' };
  if (env.wall(d.x, d.y - 1))
    return {
      pose: 'lean',
      flip: coin(d, seed, 3),
      dx: jitter(d, seed, 4, 12),
      dy: Math.max(WALL_LEAN_FOOT, reach.leanHeight - DROP_TILE) - DROP_FOOT.y,
      rule: 'leans on the wall'
    };
  const west = env.wall(d.x - 1, d.y);
  if (west || env.wall(d.x + 1, d.y))
    return {
      pose: 'lean',
      flip: !west,
      dx: west ? -SIDE_LEAN.inset : SIDE_LEAN.inset,
      dy: SIDE_LEAN.foot - DROP_FOOT.y + jitter(d, seed, 5, 8),
      rule: 'leans on the wall'
    };
  const east = env.field(d.x + 1, d.y);
  if (long === 'hoe' && (east || env.field(d.x - 1, d.y))) {
    const inset = Math.max(0, FIELD_EDGE.inset - reach.lieWidth / 2);
    return {
      pose: 'lie',
      flip: !east,
      dx: Math.round(east ? inset : -inset),
      dy: FIELD_EDGE.foot - DROP_FOOT.y,
      rule: 'laid at the field edge'
    };
  }
  return {
    pose: 'lie',
    flip: coin(d, seed, 6),
    dx: within(jitter(d, seed, 7, 8), roomFor(reach.lieWidth)),
    dy: LYING_FOOT - DROP_FOOT.y + jitter(d, seed, 8, 8),
    rule: env.grass(d.x, d.y) ? 'lies in the grass' : 'lies on the ground'
  };
}

function looseRest(
  env: DropSurroundings,
  d: PlannedDrop,
  seed: number,
  piles: readonly Pile[]
): Rest & { pose: DropPose } {
  const above = env.wall(d.x, d.y - 1);
  const shield = d.storage.kind === 'loose' && d.storage.family === 'shield';
  const held = shield && !above ? support(env, d, piles) : undefined;
  if (held) return { ...against(d, held), flip: false, pose: 'lean' };
  const foot = above
    ? WORN_FOOT.wallAbove
    : env.wall(d.x, d.y + 1)
      ? WORN_FOOT.wallBelow
      : DROP_FOOT.y + jitter(d, seed, 11, 6);
  return {
    pose: shield && above ? 'lean' : 'ground',
    flip: false,
    dx: jitter(d, seed, 10, 10),
    dy: foot - DROP_FOOT.y,
    rule: shield && above ? 'leans on the wall' : above ? 'against wall' : 'sits on the ground'
  };
}

const rests = (pose: DropPose): boolean => pose !== 'lean';

const bare = (storage: ItemStorage): boolean => storage.kind === 'loose' && storage.tuck === 'none';

export function planDrops(
  env: DropSurroundings,
  drops: readonly PlannedDrop[],
  seed: number
): DropPlacement[] {
  const at = new Map(drops.map((d) => [`${d.x},${d.y}`, d]));
  const sorted = [...at.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  const done = new Set<PlannedDrop>();
  const piles: Pile[] = [];
  const out: DropPlacement[] = [];
  const place = (d: PlannedDrop, rest: Rest, pose: DropPose, copies = 1): void => {
    out.push({
      id: d.id,
      x: d.x,
      y: d.y,
      pose,
      stage: storageStage(d.storage, d.quantity),
      flip: rest.flip,
      dx: rest.dx,
      dy: rest.dy,
      copies,
      cover: rests(pose) && !bare(d.storage) && env.grass(d.x, d.y),
      rule: rest.rule
    });
  };
  for (const d of sorted) {
    if (done.has(d) || d.storage.kind !== 'pile') continue;
    const run = [d];
    while (run.length < RUN_LENGTH && env.zone(d.x, d.y)) {
      const next = at.get(`${d.x + run.length},${d.y}`);
      if (!next || next.item !== d.item || done.has(next)) break;
      run.push(next);
    }
    const rest = pileRest(env, d, seed, run.length > 1);
    for (const member of run) {
      done.add(member);
      piles.push({
        x: member.x,
        y: member.y,
        logs: d.storage.pile === 'logs',
        dx: rest.dx,
        dy: rest.dy
      });
      place(member, rest, 'pile');
    }
  }
  for (const d of sorted) {
    if (done.has(d)) continue;
    if (d.storage.kind === 'long') {
      const { pose, ...rest } = longRest(env, d, d.storage.long, seed, piles);
      place(d, rest, pose, Math.max(1, Math.min(LONG_STACK_SIZE, d.quantity)));
      continue;
    }
    const { pose, ...rest } = looseRest(env, d, seed, piles);
    const staged = d.storage.kind === 'loose' && d.storage.stages !== undefined;
    place(d, rest, pose === 'ground' && staged ? 'pile' : pose);
  }
  return out;
}

export const copyOffset = (copy: number): { dx: number; dy: number } => ({
  dx: copy * COPY_STEP,
  dy: copy & 1
});
