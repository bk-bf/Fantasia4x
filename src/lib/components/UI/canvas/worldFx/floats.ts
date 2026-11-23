import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';
import { COLD, CRIT, DULL, GORE, HURT, tint, word, type Pair } from '$lib/pixelArt/fx/glyphs';
import { BADGE_TTL, badge, badgeDy, float, floatDy, type Anchor } from '$lib/pixelArt/fx/effects';
import { floater, strikeOf, type Trend } from '$lib/pixelArt/fx/icons';
import { P, hex } from '$lib/pixelArt/fx/spr';
import type { FxPainter } from '$lib/pixelArt/fx/painter';
import type { WebGLRenderer } from '$lib/webgl/renderer.js';
import { figureAt, type Figure } from './figure';
import { iconFor } from './conditionIcons';

export interface ConditionShow {
  icons: boolean;
  text: boolean;
}

export interface FloaterMode extends ConditionShow {
  words: boolean;
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
  at: Anchor;
  start: number;
  key: string;
  who: string | null;
  hit: Hit | null;
  lift: number;
  last: number;
}

export type Locate = (id: string) => { x: number; y: number } | undefined;

interface Waiting {
  e: CombatTextEvent;
  rank: number;
  at: number;
  hit: Hit | null;
}

export const FLOATERS_PER_TARGET = 3;
export const MERGE_HITS_MS = 400;
const WAIT_MS = 3500;
export const WORD_TTL = 1.4;
const TIERS = [0, 20, 38, 56];
const BADGE_STEP = 18;
const GAP = 2;
const SETTLE_PX_S = 24;
const STRIKE_IN_S = 0.25;
const STRIKE_LIGHT = hex('#f4ecd8');

const items: Item[] = [];
const waiting = new Map<string, Waiting[]>();
const seen = new Set<number>();
let modeKey = '';

const keyOf = (e: CombatTextEvent) => e.entityId ?? `${e.worldX},${e.worldY}`;
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
      return [word(e.text, HURT), 4, WORD_TTL, false];
    case 'crit':
      return [word(e.text, CRIT, { big: true }), 0, WORD_TTL, true];
    case 'miss':
      return [word(e.text, DULL), 0, WORD_TTL, false];
    case 'dodge':
      return [word(e.text, COLD), -6, WORD_TTL, false];
    case 'bleed':
      return [word(e.text, GORE, { icon: 'drop' }), 4, WORD_TTL, false];
    case 'fracture':
      return [word(e.text, tint('#ff9944')), 0, WORD_TTL, false];
    default:
      return [
        floater(null, e.text, e.color ?? '#dddddd', undefined, trend(e), !!e.lost),
        4,
        BADGE_TTL,
        false
      ];
  }
}

function place(e: CombatTextEvent, f: Figure, mode: FloaterMode): Placed | null {
  const tier = Math.min(TIERS.length - 1, Math.round((e.dy ?? 0) / 13));
  const id = iconFor(e);
  const switched = e.kind === 'condition' || id !== undefined;
  if (!switched && !mode.words) return null;
  if (id && mode.icons) {
    const col = e.color ?? (e.kind === 'fracture' ? '#ff9944' : '#dddddd');
    return anchor(f, {
      pair: floater(id.id, mode.text ? e.text : null, col, id.mark, trend(e), !!e.lost),
      x: 0,
      y: 0,
      ox: 0,
      oy: -tier * BADGE_STEP,
      ttl: BADGE_TTL,
      shake: false,
      badge: true,
      strike: !!e.lost
    });
  }
  if (switched && !mode.text) return null;
  const [pair, dx, ttl, shake] = textLook(e);
  return anchor(f, {
    pair,
    x: 0,
    y: 0,
    ox: dx,
    oy: TIERS[tier],
    ttl,
    shake,
    badge: false,
    strike: !!e.lost
  });
}

function anchor(f: Figure, q: Placed): Placed {
  q.x = f.x;
  q.y = q.badge ? (f.lying ? f.y - 20 : f.y - 34) : f.head - 8;
  return q;
}

function box(q: Placed, u: number, r: number, lift: number): Box {
  const s = q.pair[0];
  const dy = q.badge ? badgeDy(u) : floatDy(u, q.ttl);
  const left = q.x + (q.ox - s.ax) * r;
  const top = q.y + (q.oy + lift + dy - s.ay) * r;
  return [left, top, left + s.w * r, top + s.h * r];
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

function release(r: WebGLRenderer | null, now: number, mode: FloaterMode): void {
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
      items.push({
        e,
        fig,
        q,
        at: { x: 0, y: 0, ox: 0, oy: 0 },
        start: now,
        key,
        who: e.entityId ?? null,
        hit: w.hit,
        lift: 0,
        last: now
      });
      n++;
    }
    if (fresh.length) waiting.set(key, fresh);
    else waiting.delete(key);
  }
}

function remode(mode: FloaterMode): void {
  const key = `${mode.icons}|${mode.text}|${mode.words}`;
  if (key === modeKey) return;
  modeKey = key;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.hit) continue;
    const q = place(it.e, it.fig, mode);
    if (q) it.q = q;
    else items.splice(i, 1);
  }
}

export function drawFloats(
  p: FxPainter,
  r: WebGLRenderer | null,
  list: readonly CombatTextEvent[],
  now: number,
  mode: FloaterMode,
  blocked: readonly Box[] = [],
  locate?: Locate
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
  release(r, now, mode);
  if (locate) follow(r, locate);
  settle(now, p.textRatio, blocked);
  for (const it of items) {
    const u = (now - it.start) / 1000;
    const at = it.at;
    at.x = it.q.x;
    at.y = it.q.y;
    at.ox = it.q.ox;
    at.oy = it.q.oy + it.lift;
    if (it.q.badge) badge(p, at, it.q.pair, u);
    else float(p, at, it.q.pair, u, it.q.ttl, it.q.shake);
    if (it.q.strike) strike(p, it.q, at, u);
  }
}

function follow(r: WebGLRenderer | null, locate: Locate): void {
  for (const it of items) {
    const rp = it.who ? locate(it.who) : undefined;
    if (!rp) continue;
    it.fig = figureAt(r, Math.round(rp.x), Math.round(rp.y), rp.x, rp.y);
    anchor(it.fig, it.q);
  }
}

function strike(p: FxPainter, q: Placed, at: Anchor, u: number): void {
  if (u > q.ttl) return;
  const s = q.pair[0];
  const line = strikeOf(s);
  const w = Math.round(line.w * Math.min(1, u / STRIKE_IN_S));
  if (w <= 0) return;
  const dy = q.badge ? badgeDy(u) : floatDy(u, q.ttl);
  const x = Math.round(at.ox) - s.ax + line.x;
  const y = Math.round(at.oy + dy) - s.ay + line.y;
  p.fill(P.ink, 255);
  p.band(at.x, at.y, x - 1, y, w + 2, 2);
  p.fill(STRIKE_LIGHT, 255);
  p.band(at.x, at.y, x, y, w, 1);
}

export type Box = [number, number, number, number];

function settle(now: number, r: number, blocked: readonly Box[]): void {
  const done: Box[] = [...blocked];
  const g = GAP * r;
  for (const it of items) {
    const u = (now - it.start) / 1000;
    let lift = Math.min(0, it.lift + (SETTLE_PX_S * (now - it.last)) / 1000);
    let b = box(it.q, u, r, lift);
    const near = done.filter((o) => b[0] < o[2] && o[0] < b[2]);
    for (let pass = 0; pass <= near.length; pass++) {
      let need = 0;
      for (const o of near)
        if (b[1] < o[3] + g && o[1] < b[3] + g) need = Math.max(need, b[3] - o[1] + g);
      if (need <= 0) break;
      lift -= need / r;
      b = box(it.q, u, r, lift);
    }
    it.lift = lift;
    it.last = now;
    done.push(b);
  }
}

export const floatersLive = (): boolean => items.length > 0 || waiting.size > 0;

export function hideFloats(): void {
  items.length = 0;
  waiting.clear();
}
