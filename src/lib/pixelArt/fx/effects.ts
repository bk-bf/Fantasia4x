import { mix } from '../noise';
import type { Ramp } from '../palette';
import type { Bubble } from './bubble';
import { cross, star, zed, type Pair } from './glyphs';
import { breath, coin, ring } from './marks';
import type { FxPainter } from './painter';
import { P } from './spr';

export const frac = (v: number): number => v - Math.floor(v);

export function sleep(p: FxPainter, x: number, y: number, t: number): void {
  const z = zed();
  for (let i = 2; i >= 0; i--) {
    const f = frac(t / 2.1 - i / 3);
    p.put(
      z[f < 0.3 ? 0 : f < 0.58 ? 1 : f < 0.82 ? 2 : 3],
      x + 3 + f * 13 + Math.sin(f * 6.283) * 2,
      y - f * 30
    );
  }
}

export function rest(p: FxPainter, x: number, y: number, t: number): void {
  const c = cross();
  for (let i = 0; i < 3; i++) {
    const f = frac(t / 2.1 - i / 3);
    p.put(
      c[f < 0.2 ? 0 : f < 0.5 ? 1 : f < 0.8 ? 2 : 3],
      x + (i - 1) * 9 + Math.sin(f * 6.283 + i * 2) * 1.5,
      y - f * 28
    );
  }
}

export function reel(p: FxPainter, x: number, y: number, t: number): void {
  const s = star();
  const angles = [0, 1, 2]
    .map((i) => t * 3.6 + i * 2.094)
    .sort((a, b) => Math.sin(a) - Math.sin(b));
  for (const a of angles) {
    const z = Math.sin(a);
    p.put(s[z > 0.4 ? 2 : z < -0.4 ? 0 : 1], x + Math.cos(a) * 11, y + z * 4);
  }
}

const BREATH_AT = [0.16, 0.32, 0.48, 0.64, 0.78, 0.9, 1];
const BREATH_EVERY = 0.4;
const BREATH_LIFE = 0.7;

export function pant(p: FxPainter, x: number, y: number, t: number): void {
  const b = breath();
  for (let i = 0; i < 2; i++) {
    const n = Math.floor(t / BREATH_EVERY) - i;
    const u = (t - n * BREATH_EVERY) / BREATH_LIFE;
    if (u < 0 || u >= 1) continue;
    const f = b[BREATH_AT.findIndex((v) => u < v)];
    p.put(
      f,
      x + f.ax - (f.w >> 1) - u * 15,
      y + (f.h >> 1) + Math.sin(u * 2.4) * 1.5 - u * u * 3 + (n & 1)
    );
  }
}

export function trader(p: FxPainter, x: number, y: number, t: number): void {
  const f = frac(t / 2.6);
  p.put(
    coin()[f < 0.18 ? [1, 2, 3, 0][Math.floor(f / 0.045)] : 0],
    x,
    y + Math.round(Math.sin(t * 3.9) * 2)
  );
}

export function floatDy(u: number, ttl: number): number {
  const f = Math.min(1, u / ttl);
  return f < 0.7 ? mix(3, -26, f / 0.7) : mix(-26, -38, (f - 0.7) / 0.3);
}

export interface Anchor {
  x: number;
  y: number;
  ox: number;
  oy: number;
}

export function float(
  p: FxPainter,
  at: Anchor,
  pair: Pair,
  u: number,
  ttl: number,
  shake: boolean
): void {
  if (u > ttl) return;
  const f = u / ttl;
  const jolt = shake && u < 0.14 ? (Math.floor(u * 50) & 1 ? 1 : -1) : 0;
  p.label(pair[f < 0.07 || f > 0.84 ? 1 : 0], at.x, at.y, at.ox + jolt, at.oy + floatDy(u, ttl));
}

export const BADGE_TTL = 3;

export function badgeDy(u: number): number {
  const f = Math.min(1, u / BADGE_TTL);
  if (f < 0.12) return mix(8, -3, 1 - (1 - f / 0.12) ** 2);
  return f < 0.78 ? mix(-3, -9, (f - 0.12) / 0.66) : mix(-9, -15, (f - 0.78) / 0.22);
}

export function badge(p: FxPainter, at: Anchor, pair: Pair, u: number): void {
  if (u > BADGE_TTL) return;
  const f = u / BADGE_TTL;
  p.label(pair[f < 0.04 || f > 0.8 ? 1 : 0], at.x, at.y, at.ox, at.oy + badgeDy(u));
}

export const SAY_TTL = 4.5;

export function say(p: FxPainter, x: number, y: number, b: Bubble, u: number, kt: number): void {
  const f = u / SAY_TTL;
  if (f > 1) return;
  const i = f < 0.04 || f > 0.9 ? 1 : 0;
  const dy = Math.round(f < 0.8 ? mix(2, -8, f / 0.8) : mix(-8, -12, (f - 0.8) / 0.2));
  p.label(b.plate[i], x, y, 0, dy, kt, b.alpha);
  p.label(b.frame[i], x, y, 0, dy, kt);
}

export type Pt = readonly [number, number];

export function route(stops: readonly Pt[], from: Pt): Pt[] {
  const pts: Pt[] = [from];
  for (const b of stops) {
    const a = pts[pts.length - 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d = Math.min(Math.abs(dx), Math.abs(dy));
    if (d > 0 && d < Math.max(Math.abs(dx), Math.abs(dy)))
      pts.push([a[0] + Math.sign(dx) * d, a[1] + Math.sign(dy) * d]);
    pts.push(b);
  }
  return pts;
}

export function path(p: FxPainter, pts: readonly Pt[], col: Ramp, t: number): void {
  const seg = pts
    .slice(1)
    .map((b, i) => ({ a: pts[i], b, len: Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]) }));
  if (seg.length === 0) return;
  const total = seg.reduce((n, s) => n + s.len, 0);
  const dots: [number, number][] = [];
  for (let d = ((t * 14) % 8) + 6; d < total - 5; d += 8) {
    let r = d;
    let s = seg[0];
    for (s of seg) {
      if (r <= s.len) break;
      r -= s.len;
    }
    dots.push([
      Math.round(mix(s.a[0], s.b[0], r / s.len)),
      Math.round(mix(s.a[1], s.b[1], r / s.len))
    ]);
  }
  p.fill(P.ink, 0);
  for (const [x, y] of dots) p.rect(x - 2, y - 2, 4, 4);
  p.fill(col[4], 190);
  for (const [x, y] of dots) p.rect(x - 1, y - 1, 2, 2);
  p.fill(col[5], 190);
  for (const [x, y] of dots) p.rect(x - 1, y - 1, 1, 1);
}

export function rings(p: FxPainter, stops: readonly Pt[], col: Ramp, attack: boolean): void {
  const last = stops.length - 1;
  stops.forEach((s, i) => {
    if (i < last) p.put(ring(5, 3, col), s[0], s[1]);
  });
  if (!attack && last >= 0) p.put(ring(9, 4, col), stops[last][0], stops[last][1]);
}

export type Box = readonly [number, number, number, number];

export function brackets(p: FxPainter, bx: Box, col: Ramp, t: number): void {
  const q = Math.floor(t * 2.5) & 1;
  const x0 = bx[0] + q;
  const y0 = bx[1] + q;
  const x1 = bx[2] - q;
  const y1 = bx[3] - q;
  const corners = [
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x0, y1, 1, -1],
    [x1, y1, -1, -1]
  ];
  for (const [ink, o] of [
    [true, 1],
    [false, 0]
  ] as const) {
    if (ink) p.fill(P.ink, 0);
    else p.fill(col[4], 190);
    for (const [x, y, sx, sy] of corners) {
      p.rect(Math.min(x, x + sx * 6) + o, Math.min(y, y + sy) + o, 7, 2);
      p.rect(Math.min(x, x + sx) + o, Math.min(y, y + sy * 6) + o, 2, 7);
    }
  }
}
