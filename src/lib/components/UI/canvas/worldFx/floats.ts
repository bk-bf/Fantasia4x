import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';
import { COLD, CRIT, DULL, GORE, HURT, tint, word, type Pair } from '$lib/pixelArt/fx/glyphs';
import { BADGE_TTL, badge, badgeDy, float, floatDy } from '$lib/pixelArt/fx/effects';
import { floater, strikeOf, type Trend } from '$lib/pixelArt/fx/icons';
import { P, hex } from '$lib/pixelArt/fx/spr';
import type { FxPainter } from '$lib/pixelArt/fx/painter';
import type { WebGLRenderer } from '$lib/webgl/renderer.js';
import { figureAt, type Figure } from './figure';
import { iconFor } from './conditionIcons';

export interface FloaterMode {
  icons: boolean;
  text: boolean;
}

interface Placed {
  pair: Pair;
  x: number;
  y: number;
  ox: number;
  oy: number;
  ttl: number;
  shake: boolean;
  badge: boolean;
  strike: boolean;
}

interface Hit {
  total: number;
  crit: boolean;
  bang: boolean;
  last: number;
}

interface Item {
  e: CombatTextEvent;
  fig: Figure;
  q: Placed;
  start: number;
  key: string;
  hit: Hit | null;
  lift: number;
}

interface Waiting {
  e: CombatTextEvent;
  rank: number;
  at: number;
  hit: Hit | null;
}

export const FLOATERS_PER_TARGET = 3;
export const MERGE_HITS_MS = 400;
const WAIT_MS = 2500;
const TIERS = [0, 20, 38, 56];
const BADGE_STEP = 18;
const GAP = 1;
const SAMPLE_S = 0.1;
const TTL_BY_CONDITION: Record<string, number> = { knockdown: 1.3, staggered: 0.9 };
const STRIKE_GROW = 0.45;
const STRIKE_LIGHT = hex('#f4ecd8');

const items: Item[] = [];
const waiting = new Map<string, Waiting[]>();
const seen = new Set<number>();
let modeKey = '';

const keyOf = (e: CombatTextEvent) => `${e.worldX},${e.worldY}`;
const isHit = (e: CombatTextEvent) => e.kind === 'damage' || e.kind === 'crit';
const amount = (e: CombatTextEvent) => Number(/\d+/.exec(e.text)?.[0] ?? 0);

function rank(e: CombatTextEvent): number {
  if (e.kind === 'crit') return 7;
  if (e.kind === 'damage') return 6;
  if (e.lost) return 0;
  if (e.kind === 'condition' || e.kind === 'knockdown') {
    const t = trend(e);
    return t === 0 ? 3 : 1 + Math.max(0, t);
  }
  if (e.kind === 'fracture') return 3;
  return e.kind === 'bleed' ? 2 : 1;
}

function trend(e: CombatTextEvent): Trend {
  if (e.lost || !e.level || !e.levels) return 0;
  if (e.easing) return -1;
  const n = e.levels <= 3 ? e.level : Math.round((e.level * 3) / e.levels);
  return Math.min(3, Math.max(1, n)) as Trend;
}

function hitPair(h: Hit): Pair {
  const text = `-${h.total}${h.bang ? '!' : ''}`;
  return h.crit ? word(text, CRIT, { big: true }) : word(text, HURT);
}

function textLook(e: CombatTextEvent): [Pair, number, number, boolean] {
  switch (e.kind) {
    case 'damage':
      return [word(e.text, HURT), 4, 0.9, false];
    case 'crit':
      return [word(e.text, CRIT, { big: true }), 0, 0.9, true];
    case 'miss':
      return [word(e.text, DULL), 0, 0.9, false];
    case 'dodge':
      return [word(e.text, COLD), -6, 0.9, false];
    case 'bleed':
      return [word(e.text, GORE, { icon: 'drop' }), 4, 0.9, false];
    case 'fracture':
      return [word(e.text, tint('#ff9944')), 0, 0.9, false];
    case 'knockdown':
      return [
        word(e.text, tint(e.color ?? '#ff6a3a'), { small: true, icon: 'pip' }),
        6,
        1.3,
        false
      ];
    default:
      return [
        floater(null, e.text, e.color ?? '#dddddd', undefined, trend(e)),
        4,
        TTL_BY_CONDITION[e.conditionId ?? ''] ?? 1.4,
        false
      ];
  }
}

function place(e: CombatTextEvent, f: Figure, mode: FloaterMode): Placed | null {
  const tier = Math.min(TIERS.length - 1, Math.round((e.dy ?? 0) / 13));
  const id = iconFor(e);
  const switched = e.kind === 'condition' || id !== undefined;
  if (id && mode.icons) {
    const col = e.color ?? (e.kind === 'fracture' ? '#ff9944' : '#dddddd');
    return {
      pair: floater(id.id, mode.text ? e.text : null, col, id.mark, trend(e)),
      x: f.x,
      y: f.lying ? f.y - 20 : f.y - 34,
      ox: 0,
      oy: -tier * BADGE_STEP,
      ttl: BADGE_TTL,
      shake: false,
      badge: true,
      strike: !!e.lost
    };
  }
  if (switched && !mode.text) return null;
  const [pair, dx, ttl, shake] = textLook(e);
  return {
    pair,
    x: f.x,
    y: f.head - 8,
    ox: dx,
    oy: TIERS[tier],
    ttl,
    shake,
    badge: false,
    strike: !!e.lost
  };
}

function box(q: Placed, u: number, r: number): [number, number, number, number] {
  const s = q.pair[0];
  const dy = q.badge ? badgeDy(u) : floatDy(u, q.ttl);
  const left = q.x + (q.ox - s.ax) * r;
  const top = q.y + (q.oy + dy - s.ay) * r;
  return [left, top, left + s.w * r, top + s.h * r];
}

function lift(q: Placed, o: Item, ou: number, r: number): number {
  let need = 0;
  const span = Math.min(q.ttl, o.q.ttl - ou);
  for (let t = 0; t <= span; t += SAMPLE_S) {
    const a = box(q, t, r);
    const b = box(o.q, ou + t, r);
    if (a[3] + GAP * r <= b[1] || b[3] + GAP * r <= a[1]) continue;
    need = Math.max(need, a[3] - b[1] + GAP * r);
  }
  return need;
}

function seat(q: Placed, now: number, r: number): void {
  const a = box(q, 0, r);
  const near = items.filter((o) => {
    const b = box(o.q, 0, r);
    return a[2] > b[0] && b[2] > a[0];
  });
  for (let pass = 0; pass <= near.length; pass++) {
    let moved = false;
    for (const o of near) {
      const need = lift(q, o, (now - o.start) / 1000, r);
      if (need <= 0) continue;
      q.oy -= need / r;
      moved = true;
    }
    if (!moved) return;
  }
}

const newHit = (e: CombatTextEvent): Hit => ({
  total: amount(e),
  crit: e.kind === 'crit',
  bang: e.text.endsWith('!'),
  last: e.spawnTime
});

function add(h: Hit, e: CombatTextEvent): void {
  h.total += amount(e);
  h.crit ||= e.kind === 'crit';
  h.bang ||= e.text.endsWith('!');
  h.last = e.spawnTime;
}

function merge(e: CombatTextEvent): boolean {
  const key = keyOf(e);
  const near = (h: Hit) => e.spawnTime - h.last < MERGE_HITS_MS;
  const queued = waiting.get(key)?.find((w) => w.hit && near(w.hit));
  if (queued?.hit) {
    add(queued.hit, e);
    return true;
  }
  const into = items.find((i) => i.hit && i.key === key && near(i.hit));
  if (!into?.hit) return false;
  add(into.hit, e);
  into.q.pair = hitPair(into.hit);
  into.q.shake = into.hit.crit;
  if (into.hit.crit) into.q.ox = 0;
  return true;
}

function release(r: WebGLRenderer | null, ratio: number, now: number, mode: FloaterMode): void {
  const live = new Map<string, number>();
  for (const i of items) live.set(i.key, (live.get(i.key) ?? 0) + 1);
  for (const [key, list] of waiting) {
    const fresh = list
      .filter((w) => now - w.at < WAIT_MS)
      .sort((a, b) => b.rank - a.rank || a.at - b.at);
    let n = live.get(key) ?? 0;
    while (n < FLOATERS_PER_TARGET && fresh.length) {
      const w = fresh.shift()!;
      const e = w.e;
      const fig = figureAt(r, e.worldX, e.worldY, e.worldX, e.worldY);
      const q = place(e, fig, mode);
      if (!q) continue;
      if (w.hit) {
        q.pair = hitPair(w.hit);
        q.shake = w.hit.crit;
        if (w.hit.crit) q.ox = 0;
      }
      const base = q.oy;
      seat(q, now, ratio);
      items.push({ e, fig, q, start: now, key, hit: w.hit, lift: q.oy - base });
      n++;
    }
    if (fresh.length) waiting.set(key, fresh);
    else waiting.delete(key);
  }
}

function remode(mode: FloaterMode): void {
  const key = `${mode.icons}|${mode.text}`;
  if (key === modeKey) return;
  modeKey = key;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.hit) continue;
    const q = place(it.e, it.fig, mode);
    if (q) it.q = { ...q, oy: q.oy + it.lift };
    else items.splice(i, 1);
  }
}

export function drawFloats(
  p: FxPainter,
  r: WebGLRenderer | null,
  list: readonly CombatTextEvent[],
  now: number,
  mode: FloaterMode
): void {
  remode(mode);
  const ids = new Set<number>();
  for (const e of list) {
    if (e.kind === 'social') continue;
    ids.add(e.id);
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (isHit(e) && merge(e)) continue;
    const key = keyOf(e);
    const w = waiting.get(key) ?? [];
    w.push({ e, rank: rank(e), at: now, hit: isHit(e) ? newHit(e) : null });
    waiting.set(key, w);
  }
  for (const id of seen) if (!ids.has(id)) seen.delete(id);
  for (let i = items.length - 1; i >= 0; i--)
    if ((now - items[i].start) / 1000 > items[i].q.ttl) items.splice(i, 1);
  release(r, p.textRatio, now, mode);
  for (const it of items) {
    const u = (now - it.start) / 1000;
    if (it.q.badge) badge(p, it.q, it.q.pair, u);
    else float(p, it.q, it.q.pair, u, it.q.ttl, it.q.shake);
    if (it.q.strike) strike(p, it.q, u);
  }
}

function strike(p: FxPainter, q: Placed, u: number): void {
  if (u > q.ttl) return;
  const s = q.pair[0];
  const line = strikeOf(s);
  const w = Math.round(line.w * Math.min(1, u / (q.ttl * STRIKE_GROW)));
  if (w <= 0) return;
  const dy = q.badge ? badgeDy(u) : floatDy(u, q.ttl);
  const x = Math.round(q.ox) - s.ax + line.x;
  const y = Math.round(q.oy + dy) - s.ay + line.y;
  p.fill(P.ink, 255);
  p.band(q.x, q.y, x - 1, y, w + 2, 2);
  p.fill(STRIKE_LIGHT, 255);
  p.band(q.x, q.y, x, y, w, 1);
}

export const floatersLive = (): boolean => items.length > 0 || waiting.size > 0;
