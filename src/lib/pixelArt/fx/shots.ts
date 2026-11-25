import { dith, hash, mix } from '../noise';
import type { Rgb } from '../palette';
import { keep } from './glyphs';
import { P, STAR, Spr } from './spr';

export type ShotKind = 'arrow' | 'bolt' | 'spear' | 'stone' | 'fireball' | 'frostbolt' | 'spark';
export type HitKind = 'thud' | 'dust' | 'burst' | 'shatter' | 'flash';

function paint(kind: ShotKind, a: number, v: number): Spr {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const s = new Spr(56, 56, 28, 28);
  const at = (i: number, j: number, col: Rgb, e?: number) =>
    s.set(28 + c * i - sn * j, 28 + sn * i + c * j, col, e);
  const rod = (i0: number, i1: number, col: Rgb, e?: number) => {
    for (let i = i0; i <= i1; i++) at(i, 0, col, e);
  };
  const streak = (i0: number, n: number, col: Rgb, e: number) => {
    for (let k = 0; k < n; k++) at(i0 - k * 2 - (k > 2 ? k - 2 : 0), 0, col, e);
  };
  if (kind === 'arrow') {
    rod(-8, 4, P.wood[5]);
    rod(5, 7, P.iron[6]);
    at(5, 1, P.iron[4]);
    at(5, -1, P.iron[4]);
    for (const i of [-8, -7, -6]) {
      at(i, 1, P.cloth[5]);
      at(i, -1, P.red[3]);
    }
    s.outline();
    streak(-12, 4, P.cloth[4], 60);
  } else if (kind === 'bolt') {
    rod(-4, 2, P.wood[3]);
    for (let i = -4; i <= 2; i++) at(i, 1, P.wood[1]);
    rod(3, 5, P.iron[6]);
    at(3, -1, P.iron[4]);
    at(3, 2, P.iron[3]);
    at(-4, -1, P.leather[5]);
    at(-4, 2, P.leather[4]);
    s.outline();
    streak(-8, 4, P.iron[5], 60);
  } else if (kind === 'spear') {
    rod(-14, 8, P.wood[5]);
    for (let i = -14; i <= 8; i++) at(i, 1, P.wood[2]);
    at(8, 0, P.leather[4]);
    at(8, 1, P.leather[3]);
    for (let i = 9; i <= 14; i++) {
      at(i, 0, P.iron[6]);
      at(i, 1, P.iron[4]);
      if (i > 9 && i < 13) {
        at(i, -1, P.iron[5]);
        at(i, 2, P.iron[3]);
      }
    }
    s.outline();
    streak(-18, 3, P.cloth[4], 60);
  } else if (kind === 'stone') {
    s.ball(28.5, 28.5, 3, 3, 0, P.rock, { d: 0.3, bias: 0.1 });
    s.outline();
    at(-6, 1, P.rockWarm[4], 40);
    at(-9, -1, P.rockWarm[3], 40);
  } else if (kind === 'fireball') {
    for (let i = -3; i >= -14; i--) {
      const w = i > -7 ? 2 : i > -11 ? 1 : 0;
      for (let j = -w; j <= w; j++)
        if (i > -6 || (i + j) & 1) at(i, j, P.fire[i > -6 ? 3 : i > -10 ? 2 : 1], 255);
    }
    s.ball(28.5, 28.5, 3.6, 3.6, 1, P.fire, { bias: 0.36, d: 0.3, e: 255 });
    s.outline(P.ember[1]);
    at(-17, 2, P.fire[2], 255);
    at(-15, -3, P.fire[1], 255);
    at(-20, -1, P.fire[1], 255);
  } else if (kind === 'frostbolt') {
    for (let i = -5; i <= 6; i++) {
      at(i, 0, P.mana[i > 2 ? 5 : 4], 235);
      if (i > -3 && i < 5) {
        at(i, -1, P.mana[5], 235);
        at(i, 1, P.mana[2], 235);
      }
    }
    s.outline(P.frost[0]);
    at(-8, 1, P.mana[4], 235);
    at(-11, -1, P.mana[3], 235);
    at(-14, 0, P.mana[3], 235);
    at(-17, 1, P.mana[2], 235);
  } else {
    let px = -9;
    let pj = 0;
    for (let k = 1; k <= 4; k++) {
      const nx = -9 + k * 4.2;
      const nj = k === 4 ? 0 : (hash(k, v, 71) > 0.5 ? 1 : -1) * (1.5 + hash(k, v, 72) * 1.5);
      for (let q = 0; q <= 5; q++)
        at(mix(px, nx, q / 5), mix(pj, nj, q / 5), STAR[q & 1 ? 5 : 4], 255);
      px = nx;
      pj = nj;
    }
    at(8, 0, STAR[5], 255);
    at(9, 0, STAR[5], 255);
    s.outline(P.gold[0]);
  }
  return s;
}

export function shot(kind: ShotKind, ang: number, v: number): Spr {
  const step = Math.round((ang * 16) / Math.PI);
  return keep(`s${kind}${step}${kind === 'spark' ? v : ''}`, () =>
    paint(kind, (step * Math.PI) / 16, v)
  );
}

function impact(kind: HitKind, f: number): Spr {
  const s = new Spr(30, 30, 15, 15);
  const ray = (n: number, r0: number, r1: number, col: Rgb, e: number, off = 0) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + off;
      for (let r = r0; r <= r1; r++) s.set(15 + Math.cos(a) * r, 15 + Math.sin(a) * r, col, e);
    }
  };
  if (kind === 'thud') {
    if (f === 0) {
      ray(4, 0, 3, P.cloth[5], 220);
      s.outline();
    } else ray(6, f * 3, f * 3 + 1, f === 1 ? P.bone[5] : P.bone[3], 120, 0.4);
  } else if (kind === 'dust') {
    s.ball(15.5, 15.5, 2.4 + f * 2, 1.8 + f * 1.4, 0, P.rockWarm, {
      n: 0.6,
      ns: 0.7,
      d: 0.5,
      bias: 0.16
    });
    if (f === 2)
      for (let i = 0; i < s.c.length; i++) if (dith(i % 30, (i / 30) | 0) < 0.5) s.c[i] = null;
  } else if (kind === 'burst') {
    if (f === 0) {
      s.ball(15.5, 15.5, 4, 4, 0, P.fire, { bias: 0.4, d: 0.3, e: 255 });
      s.outline(P.ember[1]);
    } else {
      ray(12, f * 3 + 1, f * 3 + 2, P.fire[f === 1 ? 3 : 2], 255, 0.2);
      ray(6, f * 2, f * 2 + 1, P.fire[f === 1 ? 4 : 1], 255);
      if (f === 1) s.outline(P.ember[1]);
    }
  } else if (kind === 'shatter') {
    if (f === 0) {
      ray(6, 0, 3, P.mana[5], 235);
      s.outline(P.frost[0]);
    } else {
      ray(6, f * 3, f * 3 + 2, P.mana[f === 1 ? 4 : 3], 235);
      ray(6, f * 2, f * 2 + 1, P.mana[2], 235, 0.52);
    }
  } else if (f === 0) {
    ray(4, 0, 4, STAR[5], 255, 0.78);
    ray(4, 0, 2, STAR[4], 255);
    s.outline(P.gold[0]);
  } else ray(8, f * 4, f * 4 + 2, STAR[f === 1 ? 4 : 3], 255, 0.2);
  return s;
}

export const hit = (kind: HitKind): Spr[] =>
  keep(`h${kind}`, () => [0, 1, 2].map((f) => impact(kind, f)));
