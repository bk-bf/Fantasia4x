import type { CombatTextEvent } from '$lib/stores/fx/combatFeedback';
import { bubble, bubbleHeight, bubbleWidth, type BubbleSkin } from '$lib/pixelArt/fx/bubble';
import { say } from '$lib/pixelArt/fx/effects';
import type { FxPainter } from '$lib/pixelArt/fx/painter';
import type { WebGLRenderer } from '$lib/webgl/renderer.js';
import { figureAt, type Figure } from './figure';

const TAIL = 12;
const NEAR_X = 160;
const NEAR_Y = 64;
const RETAIL_S = 1;
const GAP = 2;

interface Seat {
  id: number;
  fig: Figure;
  tail: number;
  t: number;
  x: number;
  y: number;
  w: number;
  h: number;
  at: number;
}

const seats = new Map<number, Seat>();

const span = (s: Seat): [number, number] =>
  s.tail < 0 ? [s.x - s.w + s.t, s.x + s.t] : [s.x - s.t, s.x + s.w - s.t];

function side(s: Seat, tail: number): void {
  s.tail = tail;
  s.x = s.fig.x + (tail < 0 ? -2 : 2);
}

function seat(e: CombatTextEvent, r: WebGLRenderer | null, now: number, ratio: number): Seat {
  const fig = figureAt(r, e.worldX, e.worldY, e.worldX, e.worldY);
  const s: Seat = {
    id: e.id,
    fig,
    tail: TAIL,
    t: TAIL * ratio,
    x: 0,
    y: fig.head - 5,
    w: bubbleWidth(e.text) * ratio,
    h: bubbleHeight(e.text) * ratio,
    at: now
  };
  let partner: Seat | null = null;
  for (const o of seats.values())
    if (
      Math.abs(o.fig.x - fig.x) < NEAR_X &&
      Math.abs(o.fig.y - fig.y) < NEAR_Y &&
      o.fig.x !== fig.x
    )
      if (!partner || Math.abs(o.fig.x - fig.x) < Math.abs(partner.fig.x - fig.x)) partner = o;
  side(s, partner && partner.fig.x > fig.x ? -TAIL : TAIL);
  if (partner && now - partner.at < RETAIL_S * 1000)
    side(partner, partner.fig.x > fig.x ? TAIL : -TAIL);
  for (let pass = 0; pass < seats.size; pass++) {
    let moved = false;
    const [a0, a1] = span(s);
    for (const o of seats.values()) {
      const [b0, b1] = span(o);
      if (a1 <= b0 || b1 <= a0) continue;
      if (s.y <= o.y - o.h || o.y <= s.y - s.h) continue;
      s.y = o.y - o.h - GAP * ratio;
      moved = true;
    }
    if (!moved) break;
  }
  return s;
}

export function drawSpeech(
  p: FxPainter,
  r: WebGLRenderer | null,
  list: readonly CombatTextEvent[],
  now: number,
  skin: BubbleSkin,
  kt: number
): void {
  const ratio = kt / p.k;
  const seen = new Set<number>();
  for (const e of list) {
    if (e.kind !== 'social') continue;
    seen.add(e.id);
    if (!seats.has(e.id)) seats.set(e.id, seat(e, r, now, ratio));
  }
  for (const id of seats.keys()) if (!seen.has(id)) seats.delete(id);
  for (const e of list) {
    const s = e.kind === 'social' ? seats.get(e.id) : undefined;
    if (s)
      say(
        p,
        s.x,
        s.y,
        bubble(e.text, skin, s.tail < 0 ? -TAIL : TAIL),
        (now - e.spawnTime) / 1000,
        kt
      );
  }
}
