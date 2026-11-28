import { clamp, mix } from '../noise';
import { dot } from './glyphs';
import { arc, glint, lick, tinted, type StatusKind } from './marks';
import type { FxPainter } from './painter';
import { hit, shot, type HitKind, type ShotKind } from './shots';
import { P, type Spr } from './spr';
import { frac, type Pt } from './effects';

export const STATUS_S = 1.6;
const HIT_S = 0.24;

export const flightS = (a: Pt, b: Pt): number =>
  clamp((Math.hypot(b[0] - a[0], b[1] - a[1]) / 32) * 0.13, 0.6, 2.3);

export const flightLife = (a: Pt, b: Pt, status: boolean): number =>
  flightS(a, b) + (status ? STATUS_S : HIT_S);

export interface Struck {
  x: number;
  top: number;
  ht: number;
  spr: Spr | null;
  at: Pt;
}

function burn(p: FxPainter, t: number, v: number, a: Struck): void {
  const k = v / STATUS_S;
  const fr = Math.floor(t * 10);
  if (a.spr && k < 0.75) p.put(tinted(a.spr, 'burn', fr & 1 ? 0.55 : 0.72), a.at[0], a.at[1]);
  const l = lick();
  [
    [-4, 0.45],
    [3, 0.2],
    [6, 0.7]
  ].forEach(([dx, dy], i) => p.put(l[k > 0.8 ? 3 : (fr + i) % 3], a.x + dx, a.top + dy * a.ht + 4));
  for (let i = 0; i < 3; i++) {
    const f = frac(t / 0.9 + i / 3);
    p.put(
      dot(P.fire[f < 0.4 ? 3 : 1], 255),
      a.x + (i - 1) * 4 + Math.sin(f * 7 + i) * 2,
      a.top - f * 14
    );
  }
}

function frost(p: FxPainter, t: number, v: number, a: Struck): void {
  const k = v / STATUS_S;
  if (a.spr)
    p.put(
      tinted(a.spr, 'frost', [0, 0.25, 0.5, 0.75][Math.min(3, Math.floor(k * 4))]),
      a.at[0],
      a.at[1]
    );
  const g = glint();
  [
    [-5, 0.3],
    [5, 0.55],
    [0, 0.85]
  ].forEach(([dx, dy], i) => {
    const f = frac(t / 0.8 + i * 0.37);
    if (f < 0.5 && k < 0.85) p.put(g[f < 0.25 ? 0 : 1], a.x + dx, a.top + dy * a.ht + 2);
  });
}

function shock(p: FxPainter, t: number, v: number, a: Struck): void {
  if (v > 1) return;
  const fr = Math.floor(t * 18);
  if (a.spr && fr & 1) p.put(tinted(a.spr, 'shock', v > 0.6 ? 0.5 : 0), a.at[0], a.at[1]);
  const s = arc();
  [
    [-7, 0.35],
    [7, 0.6]
  ].forEach(([dx, dy], i) => {
    if ((fr + i) % 3) p.put(s[(fr + i * 2) % 4], a.x + dx, a.top + dy * a.ht + 6);
  });
}

const STATUS: Record<StatusKind, typeof burn> = { burn, frost, shock };

export interface Flight {
  kind: ShotKind;
  hit: HitKind;
  a: Pt;
  b: Pt;
  status?: StatusKind;
}

export function flight(p: FxPainter, f: Flight, u: number, t: number, on: Struck | null): void {
  const dur = flightS(f.a, f.b);
  if (u < dur) {
    const ang = Math.atan2(f.b[1] - f.a[1], f.b[0] - f.a[0]);
    p.put(
      shot(f.kind, ang, Math.floor(t * 24) % 3),
      mix(f.a[0], f.b[0], u / dur),
      mix(f.a[1], f.b[1], u / dur)
    );
    return;
  }
  if (f.status && on && u < dur + STATUS_S) STATUS[f.status](p, t, u - dur, on);
  if (u < dur + HIT_S) p.put(hit(f.hit)[Math.min(2, Math.floor((u - dur) / 0.08))], f.b[0], f.b[1]);
}
