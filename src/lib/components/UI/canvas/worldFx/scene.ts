import type { Mob, Pawn, PawnOrder } from '$lib/game/core/types';
import type { WebGLRenderer } from '$lib/webgl/renderer.js';
import { conditionPriority } from '$lib/game/core/rules/body/conditions';
import { needsRecovery } from '$lib/game/systems/pawn/pawnHelpers';
import { bodyHealthShare } from '$lib/game/core/rules/body/bodyHealth';
import { PROGRESS_BAR_STATES } from '$lib/components/UI/canvas/selectionCard';
import { HONEY } from '$lib/pixelArt/fx/glyphs';
import { RAMP } from '$lib/pixelArt/fx/spr';
import type { Ramp } from '$lib/pixelArt/palette';
import { route, type Box, type Pt } from '$lib/pixelArt/fx/effects';
import { ART_TILE, figureAt, type Figure } from './figure';

export type MarkKind = 'sleep' | 'rest' | 'reel' | 'coin' | 'winded';

export interface Bar {
  x: number;
  y: number;
  v: number;
  ramp: Ramp;
  pegs: boolean;
}

export interface Mark {
  kind: MarkKind;
  x: number;
  y: number;
}

export interface Route {
  pts: Pt[];
  stops: Pt[];
  even?: boolean;
  col: Ramp;
  attack: boolean;
  boxes: Box[];
}

export interface Scene {
  bars: Bar[];
  marks: Mark[];
  routes: Route[];
}

export interface FxWorld {
  pawns: readonly Pawn[];
  mobs: readonly Mob[];
  pawnPos: ReadonlyMap<string, { x: number; y: number }>;
  mobPos: ReadonlyMap<string, { x: number; y: number }>;
  renderer: WebGLRenderer | null;
  hidden: (x: number, y: number) => boolean;
  mobsDrawn: boolean;
  aim: MoveAim | null;
  view: Box;
}

export interface MoveAim {
  from: Pt;
  to: Pt;
  slots: readonly { x: number; y: number }[];
}

const PRIO = () => ({
  collapse: conditionPriority('collapse'),
  sleeping: conditionPriority('sleeping'),
  winded: conditionPriority('winded')
});

function stateMark(
  collapsed: boolean,
  sleeping: boolean,
  resting: boolean,
  winded: boolean,
  p: ReturnType<typeof PRIO>
): MarkKind | null {
  let kind: MarkKind | null = null;
  let prio = -1;
  if (collapsed && p.collapse > prio) [kind, prio] = ['reel', p.collapse];
  if (sleeping && p.sleeping > prio) [kind, prio] = [resting ? 'rest' : 'sleep', p.sleeping];
  if (winded && p.winded > prio) kind = 'winded';
  return kind;
}

const HEAD_IN = 9;
const MOUTH_AT = 0.64;

function placeMark(kind: MarkKind, f: Figure): Mark {
  const head = f.box[2] - HEAD_IN;
  if (kind === 'sleep')
    return f.lying ? { kind, x: head, y: f.y - 26 } : { kind, x: f.x + 14, y: f.head - 2 };
  if (kind === 'rest') return { kind, x: f.x + 2, y: f.lying ? f.y - 40 : f.head - 8 };
  if (kind === 'reel')
    return f.lying ? { kind, x: head, y: f.y - 30 } : { kind, x: f.x, y: f.head - 6 };
  if (kind === 'coin') return { kind, x: f.x, y: f.head - 8 };
  const rise = f.y - f.head;
  return { kind, x: f.x - 1, y: f.y - Math.max(16, Math.min(25, Math.round(rise * MOUTH_AT))) };
}

function addBars(
  s: Scene,
  f: Figure,
  work: number | null,
  health: number | null,
  ramp: Ramp,
  mark: MarkKind | null
): void {
  if (f.lying) {
    const side = mark === 'reel' ? -14 : 0;
    if (health !== null)
      s.bars.push({ x: f.x + side, y: f.y - (side ? 30 : 32), v: health, ramp, pegs: false });
    if (work !== null)
      s.bars.push({ x: f.x + side, y: f.y - (side ? 36 : 38), v: work, ramp: HONEY, pegs: true });
    return;
  }
  let y = f.head - 4;
  if (work !== null) {
    s.bars.push({ x: f.x, y, v: work, ramp: HONEY, pegs: true });
    y -= 6;
  }
  if (health !== null) s.bars.push({ x: f.x, y, v: health, ramp, pegs: false });
}

const shares = new WeakMap<object, number>();

const hurt = (limbs: Pawn['limbs']): number | null => {
  if (!limbs) return null;
  let share = shares.get(limbs);
  if (share === undefined) {
    share = bodyHealthShare(limbs);
    shares.set(limbs, share);
  }
  return share < 1 ? share : null;
};

const SLIDE = 3;

const inView = (v: Box, x: number, y: number, pad = 0) =>
  x >= v[0] - 1 - pad && y >= v[1] - 1 - pad && x <= v[2] + 1 + pad && y <= v[3] + 2 + pad;

const ground = (x: number, y: number): Pt => [
  Math.round((x + 0.5) * ART_TILE),
  (y + 1) * ART_TILE - 4
];

function orderStop(w: FxWorld, o: PawnOrder, boxes: Box[]): Pt | null {
  if (o.type === 'attack' || o.type === 'rescue' || o.type === 'tend') {
    const id = o.type === 'attack' ? o.targetId : o.type === 'rescue' ? o.victimId : o.patientId;
    const mob = o.type === 'attack' && o.targetType === 'mob';
    const rp = mob ? w.mobPos.get(id) : w.pawnPos.get(id);
    if (!rp) return null;
    const f = figureAt(w.renderer, Math.round(rp.x), Math.round(rp.y), rp.x, rp.y);
    if (o.type !== 'attack') return [f.x, f.y - 4];
    boxes.push([f.box[0] - 3, f.box[1] - 3, f.box[2] + 3, f.box[3] + 3]);
    return [f.x + 6, f.y - 4];
  }
  return 'x' in o ? ground(o.x, o.y) : null;
}

const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];

function walked(p: Pawn, from: Pt): Pt[] {
  const path = p.path ?? [];
  const pts: Pt[] = [from];
  for (let i = p.pathIndex ?? 0; i < path.length; i++) pts.push(ground(path[i].x, path[i].y));
  return pts;
}

function addRoute(s: Scene, w: FxWorld, p: Pawn, f: Figure): void {
  const orders = [p.draftTarget!, ...(p.manualQueue ?? [])];
  const attack = orders[orders.length - 1].type === 'attack';
  const boxes: Box[] = [];
  const stops = orders.map((o) => orderStop(w, o, boxes)).filter((q): q is Pt => q !== null);
  if (stops.length === 0) return;
  const lead = orders[0].type === 'attack';
  const walk = walked(p, [f.x, f.y - (lead ? 4 : 2)]);
  const ahead = route(stops, walk[walk.length - 1]).slice(1);
  s.routes.push({
    pts: [...walk, ...ahead.filter((q, i) => i > 0 || !same(q, walk[walk.length - 1]))],
    stops,
    col: lead ? RAMP.vermilion : HONEY,
    attack,
    boxes
  });
}

export interface SceneOn {
  marks: boolean;
  work: boolean;
  health: boolean;
  draft: boolean;
}

function pawnWork(p: Pawn): number | null {
  if (
    p.currentState != null &&
    PROGRESS_BAR_STATES.has(p.currentState) &&
    p.activeJob &&
    (p.activeJob.progress ?? 0) >= 0
  )
    return Math.max(0, Math.min(1, p.activeJob.progress ?? 0));
  if (p.draftTarget?.type === 'tend' && (p.tendProgress ?? -1) >= 0)
    return Math.max(0, Math.min(1, p.tendProgress ?? 0));
  return null;
}

function pawnMark(p: Pawn, prio: ReturnType<typeof PRIO>): MarkKind | null {
  const sleeping = p.currentState === 'Sleeping';
  return stateMark(
    p.currentState === 'Collapsed',
    sleeping,
    sleeping && needsRecovery(p as never),
    (p.transientConditions ?? []).includes('winded'),
    prio
  );
}

function mobMark(m: Mob, prio: ReturnType<typeof PRIO>): MarkKind | null {
  if (m.partyRole === 'trader') return 'coin';
  return stateMark(
    m.state === 'Collapsed',
    m.state === 'Sleeping',
    false,
    (m.transientConditions ?? []).includes('winded'),
    prio
  );
}

const AREA_PAD = 10;
const AREA_HEAD = 26;

function aimRoute(a: MoveAim): Route {
  const stops = a.slots.map((t) => ground(t.x, t.y));
  const xs = stops.map((q) => q[0]);
  const ys = stops.map((q) => q[1]);
  const area: Box = [
    Math.min(...xs) - AREA_PAD,
    Math.min(...ys) - AREA_HEAD,
    Math.max(...xs) + AREA_PAD,
    Math.max(...ys) + AREA_PAD / 2
  ];
  return {
    pts: [ground(a.from[0], a.from[1]), ground(a.to[0], a.to[1])],
    stops,
    even: true,
    col: HONEY,
    attack: false,
    boxes: stops.length > 1 ? [area] : []
  };
}

export function collectScene(w: FxWorld, on: SceneOn): Scene {
  const s: Scene = { bars: [], marks: [], routes: [] };
  if (on.draft && w.aim && w.aim.slots.length > 0) s.routes.push(aimRoute(w.aim));
  if (!on.marks && !on.work && !on.health && !on.draft) return s;
  const prio = PRIO();
  for (const p of w.pawns) {
    if (!p.position || p.carriedBy) continue;
    const rp = w.pawnPos.get(p.id) ?? p.position;
    const cx = Math.round(rp.x);
    const cy = Math.round(rp.y);
    if (!inView(w.view, cx, cy)) continue;
    const drafted = on.draft && p.drafted && p.draftTarget;
    const mark = on.marks ? pawnMark(p, prio) : null;
    const working = on.work ? pawnWork(p) : null;
    const hp = on.health && p.isAlive !== false ? hurt(p.limbs) : null;
    if (!mark && working === null && hp === null && !drafted) continue;
    if (w.hidden(cx, cy)) continue;
    const f = figureAt(w.renderer, cx, cy, rp.x, rp.y);
    if (mark) s.marks.push(placeMark(mark, f));
    addBars(s, f, working, hp, RAMP.leaf, mark);
    if (drafted) addRoute(s, w, p, f);
  }
  if (!w.mobsDrawn || (!on.marks && !on.work && !on.health)) return s;
  for (const m of w.mobs) {
    if (m.state === 'Corpse' || !inView(w.view, m.x, m.y, SLIDE)) continue;
    const rp = w.mobPos.get(m.id) ?? m;
    const cx = Math.round(rp.x);
    const cy = Math.round(rp.y);
    if (!inView(w.view, cx, cy)) continue;
    const mark = on.marks ? mobMark(m, prio) : null;
    const eat = on.work && (m.eatProgress ?? 0) > 0 ? Math.min(1, m.eatProgress ?? 0) : null;
    const hp = on.health ? hurt(m.limbs) : null;
    if (!mark && eat === null && hp === null) continue;
    if (w.hidden(cx, cy)) continue;
    const f = figureAt(w.renderer, cx, cy, rp.x, rp.y);
    if (mark) s.marks.push(placeMark(mark, f));
    addBars(s, f, eat, hp, RAMP.blood, mark);
  }
  return s;
}
