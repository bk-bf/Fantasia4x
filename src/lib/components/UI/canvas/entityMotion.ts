import { idHash, type PaintedSprite } from '$lib/webgl/painted/manifest.js';
import { paintedEntity } from '$lib/webgl/painted/tileset.js';
import { BASE_TILE_PX, type TileData } from '$lib/webgl/tile-types.js';

export type Body = 'pawn' | 'beast' | 'hopper';
export type Gait = 'walk' | 'trot' | 'fast' | 'haul';
export type Rest = 'stand' | 'sleep' | 'down';

export type Look = Required<Pick<TileData, 'flip' | 'lean' | 'squash' | 'pitch'>>;

export interface Pose {
  dx: number;
  dy: number;
  look: Look;
}

export interface CreatureLook {
  id: string;
  gait?: string;
}

export interface HitEvent {
  id: number;
  kind: string;
  entityId?: string;
  spawnTime: number;
}

interface Track extends Look {
  dx: number;
  dy: number;
  size: number;
  x: number;
  y: number;
  anchorX: number;
  dist: number;
  stillMs: number;
  hitAt: number;
  phase: number;
  frame: number;
}

interface Cycle {
  ms: number;
  n: number;
}

export const ART_PER_TILE = 32;
const TAU = Math.PI * 2;
const FACE_TURN = 0.2;
const LUNGE_FACE = 0.5;
const JUMP = 2;
const STILL_EPS = 0.002;
export const STOP_HOLD_MS = 250;
export const HIT_MS = 420;
const HIT_FRAMES = 8;
const HOP_HEIGHT = 6;
const FACING_SHIFT = 1;
const HIT_KINDS: ReadonlySet<string> = new Set(['damage', 'crit']);

const RUN_PITCH = 1.4;
const RABBIT_HEIGHT = 26 / ART_PER_TILE;

const STRIDE: Record<Body, Record<Gait, number>> = {
  pawn: { walk: 19, trot: 19, fast: 34, haul: 12.5 },
  beast: { walk: 14.5, trot: 26.4, fast: 63, haul: 14.5 },
  hopper: { walk: 22, trot: 22, fast: 34, haul: 22 }
};
const STRIDE_HEIGHT: Record<Body, number> = { pawn: 1, beast: 1, hopper: RABBIT_HEIGHT };
const STEP_FRAMES: Record<Body, Record<Gait, number>> = {
  pawn: { walk: 8, trot: 8, fast: 8, haul: 8 },
  beast: { walk: 8, trot: 8, fast: 8, haul: 8 },
  hopper: { walk: 8, trot: 8, fast: 6, haul: 8 }
};
const BOB: Record<Gait, number> = { walk: 1, trot: 1.6, fast: 2.4, haul: 1 };
const LEAN: Record<Gait, number> = { walk: 1, trot: 1, fast: 2, haul: 1 };
const HAULING: ReadonlySet<string> = new Set(['Hauling', 'MovingToDeposit']);
const BREATH: Record<Body, Cycle> = {
  pawn: { ms: 2800, n: 4 },
  beast: { ms: 3000, n: 4 },
  hopper: { ms: 2400, n: 6 }
};
const SLEEP_BREATH: Cycle = { ms: 3400, n: 4 };

const frac = (v: number) => v - Math.floor(v);

function phaseOf(id: string): number {
  let h = idHash(id);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}
const stepped = (u: number, n: number) => (Math.floor(frac(u) * n) + 0.5) / n;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function pawnGait(state: string | undefined): Gait {
  if (state === 'Fleeing' || state === 'Panicking') return 'fast';
  return state && HAULING.has(state) ? 'haul' : 'walk';
}

export function pawnRest(state: string | undefined): Rest {
  return state === 'Sleeping' ? 'sleep' : state === 'Collapsed' ? 'down' : 'stand';
}

export function mobGait(state: string): Gait {
  if (state === 'Fleeing') return 'fast';
  return state === 'Attacking' || state === 'Hunting' || state === 'Alerted' ? 'trot' : 'walk';
}

export function mobRest(state: string): Rest {
  return state === 'Sleeping' ? 'sleep' : state === 'Collapsed' ? 'down' : 'stand';
}

export function mobBody(gait: string | undefined): Body {
  return gait === 'hop' ? 'hopper' : 'beast';
}

export function strideSize(body: Body, height: number | undefined): number {
  return height ? height / STRIDE_HEIGHT[body] : 0;
}

function creatureHeight(def: CreatureLook, entityId: string): number | undefined {
  return (paintedEntity('creature', def.id, entityId) as { painted?: PaintedSprite }).painted?.h;
}

export class EntityMotion {
  private tracks = new Map<string, Track>();
  private frame = 0;
  private live = 0;
  private dtMs = 0;
  private realMs = 0;
  private animMs = 0;
  private lastHit = -1;

  get size(): number {
    return this.tracks.size;
  }

  begin(realMs: number, animMs: number): void {
    this.dtMs = this.frame === 0 ? 0 : Math.max(0, realMs - this.realMs);
    this.realMs = realMs;
    this.animMs = animMs;
    this.frame++;
    this.live = 0;
  }

  noteHits(events: readonly HitEvent[]): void {
    let last = this.lastHit;
    for (const e of events) {
      if (e.id <= this.lastHit || !e.entityId || !HIT_KINDS.has(e.kind)) continue;
      const t = this.tracks.get(e.entityId);
      if (t) t.hitAt = Math.max(t.hitAt, e.spawnTime);
      if (e.id > last) last = e.id;
    }
    this.lastHit = last;
  }

  pose(
    id: string,
    x: number,
    y: number,
    body: Body,
    gait: Gait,
    rest: Rest,
    lungeX: number,
    scale = 1,
    size = 0
  ): Pose {
    let t = this.tracks.get(id);
    if (!t) {
      t = {
        flip: false,
        dx: 0,
        dy: 0,
        lean: 0,
        squash: 0,
        pitch: 0,
        size,
        x,
        y,
        anchorX: x,
        dist: 0,
        stillMs: STOP_HOLD_MS,
        hitAt: -Infinity,
        phase: phaseOf(id),
        frame: 0
      };
      this.tracks.set(id, t);
    }
    if (t.frame !== this.frame) this.live++;
    t.frame = this.frame;
    t.size = size;
    let step = Math.hypot(x - t.x, y - t.y);
    if (step > JUMP) {
      t.anchorX = x;
      step = 0;
    }
    t.x = x;
    t.y = y;
    t.dist += step * ART_PER_TILE;
    t.stillMs = step > STILL_EPS ? 0 : t.stillMs + this.dtMs;
    face(t, x, lungeX);
    const lying = body === 'pawn' && rest !== 'stand';
    t.dx = 0;
    t.dy = 0;
    t.lean = 0;
    t.squash = 0;
    t.pitch = 0;
    const hitU = (this.animMs - t.hitAt) / HIT_MS;
    if (!lying && hitU >= 0 && hitU < 1) shake(t, stepped(hitU, HIT_FRAMES));
    else if (rest === 'stand' && t.stillMs < STOP_HOLD_MS) walk(t, body, gait, scale);
    else if (rest !== 'down')
      breathe(t, rest === 'sleep' ? SLEEP_BREATH : BREATH[body], this.realMs);
    const k = (BASE_TILE_PX / ART_PER_TILE) * scale;
    const facing = !lying && t.flip;
    out.dx = ((facing ? FACING_SHIFT - t.dx : t.dx) || 0) * k;
    out.dy = t.dy * k;
    look.flip = facing;
    look.lean = lying ? 0 : t.lean;
    look.squash = t.squash;
    look.pitch = lying ? 0 : t.pitch;
    return out;
  }

  mob(
    id: string,
    x: number,
    y: number,
    state: string,
    def: CreatureLook,
    lungeX: number,
    scale = 1
  ): Pose {
    const body = mobBody(def.gait);
    const size = this.tracks.get(id)?.size || strideSize(body, creatureHeight(def, id));
    return this.pose(id, x, y, body, mobGait(state), mobRest(state), lungeX, scale, size);
  }

  pawn(id: string, x: number, y: number, state: string | undefined, lungeX: number): Pose {
    return this.pose(id, x, y, 'pawn', pawnGait(state), pawnRest(state), lungeX);
  }

  end(): void {
    if (this.live === this.tracks.size) return;
    for (const [id, t] of this.tracks) if (t.frame !== this.frame) this.tracks.delete(id);
  }
}

const look: Look = { flip: false, lean: 0, squash: 0, pitch: 0 };
const out: Pose = { dx: 0, dy: 0, look };

function face(t: Track, x: number, lungeX: number): void {
  if (Math.abs(lungeX) > LUNGE_FACE) {
    t.flip = lungeX < 0;
    t.anchorX = x;
  } else if (t.flip ? x > t.anchorX + FACE_TURN : x < t.anchorX - FACE_TURN) {
    t.flip = !t.flip;
    t.anchorX = x;
  } else if (t.flip ? x < t.anchorX : x > t.anchorX) t.anchorX = x;
}

function shake(t: Track, u: number): void {
  t.dx = Math.round((Math.floor(u * HIT_FRAMES) & 1 ? 2 : -2) * (1 - u));
  t.squash = u < 0.5 ? 1 : 0;
}

function walk(t: Track, body: Body, gait: Gait, scale: number): void {
  const stride = STRIDE[body][gait] * (t.size || 1) * scale;
  const u = stepped(t.dist / stride, STEP_FRAMES[body][gait]);
  if (body === 'hopper') {
    const k = Math.sin(clamp01((u - 0.15) / 0.7) * Math.PI);
    t.dy = -Math.round(k * HOP_HEIGHT);
    t.squash = k > 0.2 ? -1 : u > 0.85 ? 1 : 0;
    return;
  }
  t.dy = -Math.round(Math.abs(Math.sin(u * TAU)) * BOB[gait]);
  if (body === 'pawn') t.lean = LEAN[gait];
  else if (gait === 'fast') t.pitch = Math.round(Math.sin(u * TAU) * RUN_PITCH);
}

function breathe(t: Track, c: Cycle, realMs: number): void {
  const u = stepped(realMs / c.ms + t.phase, c.n);
  t.squash = u > 0.35 && u < 0.8 ? -1 : 0;
}
