'use strict';
const CRIT_BIG = new Set(['shade', 'ooze', 'spider', 'adder', 'stirge']);
const CRIT_AIR = new Set(['shade', 'stirge']);
const flat = c => () => c;
const fadeOut = (s, k, seed) => { if (k <= 0) return; for (let i = 0; i < s.c.length; i++) if (s.c[i] && hash(i % s.w >> 1, (i / s.w | 0) >> 1, seed) < k) s.c[i] = null; };

const CRIT = {
  rat(s, gy, p) {
    const f = P.furDark, o = { n: .3, ns: 1, d: .14 }, by = p.by || 0, st = p.stretch || 0, bx = p.bx || 0, hd = p.head || [0, 0], ft = p.feet || still4, dead = p.dead;
    const hipH = [20 + bx - st, gy - 2 + by], hipF = [29 + bx + st, gy - 2 + by], pts = s.pts = { feet: [] };
    const foot = (hip, q, w, far, fx0) => {
      const tx = dead ? hip[0] + 5 : hip[0] + q[0], ty = dead ? hip[1] + 1 : gy - q[1], c = far ? dark(f[2], .7) : f[2], pk = far ? dark(P.skinPale[2], .75) : P.skinPale[2];
      s.line(hip[0], hip[1], tx, ty - 1, c); s.line(hip[0] + 1, hip[1], tx + 1, ty - 1, c);
      s.rect(Math.floor(tx) - fx0, rnd(ty), w, 1, pk);
      if (!far) pts.feet.push([tx, ty, q[1] < .6]);
    };
    foot([hipH[0] + 2, hipH[1] - 1], ft[0], 3, true, 1); foot([hipF[0] + 2, hipF[1] - 1], ft[1], 3, true, 0);
    for (let k = 0; k < 15; k++) { const y = dead ? gy - 1 + (k > 9 ? 0 : 0) : gy - 2 + by * (1 - k / 15) - Math.sin(k * .4 + (p.tail || 0)) * 2.2 - (k > 10 ? (k - 10) * .5 : 0); s.set(17 + bx - st - k, y, P.skinPale[k < 11 ? 3 : 2]); if (k < 5) s.set(17 + bx - st - k, y + 1, P.skinPale[1]); }
    s.ball(20.5 + bx - st, gy - 5.5 + by + (dead ? 1.5 : 0), 5.4, dead ? 4.2 : 5, 0, f, o); s.ball(26 + bx, gy - 5 + by + (dead ? 1.5 : 0), 7.2 + st * .6, dead ? 3.8 : 4.4, 1, f, o);
    const hx = 33 + bx + st + hd[0], hy = gy - 5 + by + hd[1] + (dead ? 2 : 0);
    if (!dead) s.oval(hx - .5, hy - 4.5, 2, 2, () => f[2]);
    s.ball(hx, hy, 3.8, 3.3, 2, f, { d: .14, bias: .05 }); s.ball(hx + 3.6, hy + .8, 2.6, 1.9, 3, f, { d: .14, bias: .1 });
    s.oval(hx - 3 - (dead ? 1 : 0), hy - 4 + (dead ? 2 : 0), 2.2, dead ? 1.6 : 2.2, (x, y, nx, ny) => Math.hypot(nx, ny) < .5 ? P.skinPale[2] : f[4]);
    const X = rnd(hx), Y = rnd(hy);
    s.set(X + 6, Y + 1, P.skinPale[3]);
    if (p.jaw) { s.line(X + 2, Y + 3, X + 6, Y + 3, P.red[1]); s.set(X + 5, Y + 3, P.bone[5]); s.set(X + 3, Y + 3, P.bone[5]); s.rect(X + 2, Y + 4, 4, 1, f[2]); }
    if (p.blink || dead) s.rect(X, Y - 1, 2, 1, f[1]); else s.set(X + 1, Y - 1, P.red[4], 220);
    s.set(X + 1, Y - 2, f[1]);
    s.line(X + 4, Y + 2, X + 7, Y + 3, P.furGrey[4]); s.line(X + 4, Y, X + 7, Y - 1, P.furGrey[3]);
    foot(hipH, ft[2], 4, false, 1); foot(hipF, ft[3], 3, false, 0);
    if (!dead) { s.rect(rnd(hipH[0]), rnd(hipH[1]) + 1, 2, 1, f[2]); s.rect(rnd(hipF[0]), rnd(hipF[1]) + 1, 2, 1, f[2]); }
    pts.head = [X, Y - 10]; pts.mouth = [X + 6, Y + 2]; pts.body = [26 + bx, gy - 5];
    s.sh = { rx: 11 + st, ry: 2.6, dx: 2, dy: 0 };
  },
  croaker(s, gy, p) {
    const c = P.mossSwamp, by = p.by || 0, kick = p.kick || 0, reach = p.reach || 0, tilt = p.tilt || 0, dead = p.dead, sq = p.sq || 0;
    const hy = gy - 4 + by + tilt * .5 + (dead ? 3 : 0), thx = 13 - kick * 3, knee = [thx - 6 - kick * 3, Math.min(gy - 1, gy - 1 + by + kick) + (dead ? 1 : 0)], ft = [knee[0] - 1 - kick * 4, Math.min(gy, gy + by + kick * 3)];
    s.ball(thx, hy, 7, 5 - sq * .6, 0, c, { d: .14, bias: -.08 });
    rigLimb(s, [[thx - 1, gy + by * .5], knee, [ft[0] + 2, ft[1]]], 2, flat(c[2]));
    s.rect(rnd(ft[0]), rnd(ft[1]), 4, 1, c[3]);
    const cy = gy - 8 + by + (dead ? 3 : 0) + sq, bry = 8 - sq - (dead ? 2 : 0);
    s.ball(22, cy, 11 + sq * .5, bry, 1, c, { n: .4, ns: 1, d: .14 });
    const hx = 32 + (dead ? 1 : 0), hY = gy - 13 + by - tilt + (dead ? 6 : 0) + sq;
    s.ball(hx, hY, 6.4, 5.4, 2, c, { d: .14 });
    const th = 1 + (p.throat || 0) * .4;
    s.ball(hx + 2, hY + 5 - (th - 1) * 1.5, 4.4 * th, 4 * th, 3, P.cloth, { d: .14 });
    if (p.blink || dead) { s.oval(hx - 1, hY - 5, 2.8, 2.6, (x, y, nx, ny) => ny < 0 ? c[4] : c[3]); s.rect(rnd(hx) - 3, rnd(hY) - 5, 5, 1, c[1]); }
    else s.oval(hx - 1, hY - 5, 2.8, 2.6, (x, y, nx, ny) => Math.hypot(nx, ny) < .45 ? P.ink : P.gold[4]);
    const fx = 28 + reach, fy = gy - 4 + by * .5;
    const fyy = Math.min(gy, gy + by * (p.air || 0) + (p.air ? 2 : 0));
    rigLimb(s, [[29, cy + 3], [fx + 1, fyy - 1]], 3, flat(c[3]));
    s.rect(rnd(fx) - 1, rnd(fyy), 6, 1, c[4]);
    s.rect(rnd(hx) + 2, rnd(hY) + 2, 5, 1, c[0]);
    if (p.tongue) { const tx = hx + 6 + p.tongue, ty = hY + 3 + (p.tdy || 0); s.thick(hx + 5, hY + 3, tx, ty, 1, P.red, 2); s.ball(tx, ty, 1.6, 1.4, 4, P.red, { d: .1 }); s.rect(rnd(hx) + 3, rnd(hY) + 3, 4, 1, P.red[1]); }
    for (let i = 0; i < 8; i++) s.set(14 + hash(i, 1, 3) * 16, cy - 5 + hash(i, 2, 3) * 8, c[1]);
    s.pts = { head: [hx, hY - 12], mouth: [hx + 6, hY + 3], body: [22, cy], feet: [[ft[0] + 2, gy, by > -.5], [fx + 2, gy, by > -.5]] };
    s.sh = { rx: 15, ry: 4.4, dx: 2, dy: 0 };
  },
  spider(s, gy, p) {
    const c = P.chitin, by0 = gy - 9, by = by0 + (p.by || 0) + (p.dead ? 5 : 0), bx = 28 + (p.bx || 0), ft = p.feet || [], rear = p.rear || 0;
    const legs = [];
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
      const off = (i - 1.5) * 4.6, kx0 = 28 + off * 1.8 + sd * (9 + Math.abs(i - 1.5) * 2.4), ky0 = by0 - 11 + Math.abs(i - 1.5) * 2.4, fx0 = kx0 + sd * 7 + off * .8, q = ft[i * 2 + (sd > 0 ? 1 : 0)] || [0, 0], ox = p.bx || 0, dy = by - by0;
      const hip = [bx + off, by];
      let foot = [fx0 + ox + q[0], gy - q[1]];
      if (i === 3 && rear) foot = [mix(foot[0], bx + off + sd * 3 + 10, rear), mix(foot[1], by - 12, rear)];
      if (p.dead) foot = [bx + off + sd * 4, by + 3];
      const knee = [kx0 + ox + (foot[0] - fx0 - ox) * .5, ky0 + dy * .6 + (foot[1] - gy) * .5 - (p.dead ? 2 : 0)];
      s.thick(hip[0], hip[1], knee[0], knee[1], 2, c, sd < 0 ? 3 : 2); s.thick(knee[0], knee[1], foot[0], foot[1], 2, c, sd < 0 ? 4 : 2); s.set(knee[0], knee[1] - 1, c[4]);
      legs.push([sd, hip, foot]);
    }
    s.ball(22 + (p.bx || 0), by - 1 - rear * 2, 10, 8, 2, c, { n: .3, ns: 1, d: .14 }); s.ball(bx + 7, by + 1 - rear * 3, 5.6, 4.8, 3, c, { d: .14 });
    const ox = p.bx || 0, ry = -rear * 2;
    for (const [x, y] of [[19, by - 3], [22, by - 5], [24, by - 2], [21, by]]) { s.set(x + ox, y + ry, P.red[3]); s.set(x + 1 + ox, y + ry, P.red[2]); }
    const hy = -rear * 3;
    if (p.dead) for (const [x, y] of [[37, by - 1], [39, by]]) s.set(x + ox, y + hy, P.chitin[1]);
    else for (const [x, y] of [[37, by - 1], [39, by], [37, by + 1], [35, by - 2]]) s.set(x + ox, y + hy, P.red[4], 255);
    const fg = p.fang || 0;
    s.rect(39 + ox + fg, by + 3 + hy, 1, 3 + fg, P.bone[4]); s.rect(37 + ox, by + 4 + hy, 1, 3 + fg, P.bone[3]);
    s.pts = { head: [bx + 6, by - 14], mouth: [40 + ox, by + 5 + hy], body: [bx - 4, by], feet: legs.filter(l => l[0] > 0).map(l => [l[2][0], l[2][1], true]) };
    s.sh = { rx: 20, ry: 6, dx: 2, dy: 0 };
  },
  adder(s, gy, p) {
    const c = P.mossSwamp, ph = p.ph || 0, amp = p.amp === undefined ? 4 : p.amp, rise = p.rise === undefined ? 1 : p.rise, reach = p.reach || 0, back = p.back || 0;
    let lx = 0, ly = 0;
    for (let i = 0; i < 100; i++) {
      const t = i / 99, nk = t > .8 ? (t - .8) / .2 : 0, x = 6 + t * 38 + nk * nk * (reach - back), y = gy - 3 + Math.sin(t * 10 + ph) * amp - nk * 16 * rise + nk * nk * back * .3, tp = t < .15 ? (.15 - t) * 9 : 0;
      s.ball(x, y, 2.6 - tp, 2.4 - tp, i * .01, c, { d: .1, bias: Math.floor(i / 7) % 2 ? .12 : -.14 }); lx = x; ly = y;
    }
    s.ball(lx + 2, ly - 1, 4.2, 3, 3, c, { d: .1, bias: .1 });
    const X = rnd(lx), Y = rnd(ly);
    if (p.dead) s.rect(X + 2, Y - 2, 2, 1, c[1]); else { s.set(lx + 3, ly - 2, P.gold[4], 230); s.set(lx + 4, ly - 2, P.ink); }
    if (p.jaw) { s.rect(X + 3, Y + 1, 4, 2, P.red[1]); s.set(X + 5, Y + 1, P.bone[5]); s.set(X + 5, Y + 2, P.bone[5]); s.rect(X + 2, Y + 3, 4, 1, c[2]); }
    const tg = p.tongue === undefined ? 4 : p.tongue;
    if (tg && !p.jaw) { const L = rnd(tg); s.line(lx + 6, ly, lx + 5 + L, ly, P.red[4]); s.set(lx + 6 + L, ly - 1, P.red[4]); s.set(lx + 6 + L, ly + 1, P.red[4]); }
    s.pts = { head: [X + 2, Y - 10], mouth: [X + 7, Y], body: [26, gy - 3], feet: [[26, gy, true]] };
    s.sh = { rx: 20, ry: 3.4, dx: 2, dy: 0 };
  },
  ooze(s, gy, p) {
    const rx = p.rx || 18, ry = 13 * 18 / rx * (p.sy || 1), cx = 26 + (p.cx || 0), cy = gy + 4 - ry, k = p.glow === undefined ? 80 : p.glow;
    s.ball(cx, cy, rx, ry, 0, P.ooze, { n: .3, ns: .35, d: .16, bias: .04 });
    if (p.arm) { const [ax, ay, ar] = p.arm; s.ball(cx + ax, cy + ay, ar, ar * .85, 6, P.ooze, { n: .3, ns: .35, d: .16, bias: .08 }); }
    for (let x = 0; x < s.w; x++) for (let y = gy + 1; y < s.h; y++) s.set(x, y, null);
    for (let i = 0; i < s.e.length; i++) if (s.c[i]) s.e[i] = k;
    const qx = rx / 18, qy = ry / 13, Q = (dx, dy) => [cx + dx * qx, cy + dy * qy];
    let [x, y] = Q(-8, -6); s.oval(x, y, 4 * qx, Math.max(1, 2.4 * qy), () => P.ooze[5], 230);
    [x, y] = Q(-11, -2); s.oval(x, y, 1.4, 1.2, () => P.ooze[5], 230);
    const bub = p.bub || 0;
    [[4, 1], [-4, 4], [9, -4]].forEach(([dx, dy], i) => { const r = (bub + i / 3) % 1, [bx2, by2] = Q(dx, dy - (r - i / 3) * 5); if (r > .85 && p.bub !== undefined) return; s.oval(bx2, by2, 2.2, 2.2, (px, py, nx, ny) => Math.hypot(nx, ny) > .6 ? P.ooze[1] : P.ooze[3]); s.set(bx2 - 1, by2 - 1, P.ooze[5]); });
    const bs = p.slosh || 0, [bx0, by0] = Q(8 + bs, 3);
    s.rect(rnd(bx0), rnd(by0), 5, 1, P.bone[5]); s.set(rnd(bx0) - 1, rnd(by0) - 1, P.bone[4]); s.set(rnd(bx0) + 5, rnd(by0) + 1, P.bone[3]);
    const [kx, ky] = Q(1 + bs * .6, -5); s.oval(kx, ky, 2.4, 2.2, () => P.bone[5]); s.set(kx - 1, ky, P.ink); s.set(kx + 1, ky, P.ink);
    s.emit = { dx: 0, dy: -8, rad: 44 * k / 80, col: [.5, 1, .3] }; s.sh = { rx: rx + 1, ry: 5, dx: 2, dy: 0 };
    s.pts = { head: [cx, cy - ry - 4], mouth: [cx + rx, cy], body: [cx, cy], feet: [[cx, gy, true]] };
  },
  shade(s, gy, p) {
    const g = P.ghost, cx = 26 + (p.bx || 0), top = gy - 40 + (p.by || 0), trail = p.trail || 0, hem = p.hem || 0, rch = p.reach || 0, eye = p.eye || 0;
    for (let j = 0; j < 38; j++) {
      const w = j < 10 ? 5 + j * .5 : 9 + (j - 10) * .22, q = j > 12 ? (j - 12) / 26 : 0, sx = cx - trail * q * q * 10;
      for (let x = Math.ceil(sx - w); x <= sx + w; x++) {
        if (j > 30 && hash((x - rnd(sx - cx)) >> 1, j >> 1, 3 + Math.floor(hem * 4)) > .45 + (38 - j) * .04) continue;
        const u = (x - sx + w) / (2 * w);
        s.set(x, top + j, g[clamp(4 - Math.floor(u * 3.6) - (j > 26 ? 1 : 0) - (Math.sin(x * .9 + j * .2 + hem * TAU) > .7 ? 1 : 0), 0, 4)], 110);
      }
    }
    s.oval(cx, top + 9, 5, 4.4, () => P.ink);
    const ew = eye > .5 ? 3 : 2;
    s.rect(cx - 3, top + 8 - (ew - 2), 2, ew, P.mana[5], 255); s.rect(cx + 2, top + 8 - (ew - 2), 2, ew, P.mana[5], 255);
    const wv = p.wave || 0;
    for (let k = 0; k < 12; k++) {
      const yl = top + 18 + k * .6 + Math.sin(k + wv * TAU) * 1.2 - rch * k * .9, yr = top + 18 + k * .5 + Math.cos(k + wv * TAU) * 1.2 - rch * k * .7, xr = cx + 9 + k + rch * k * .6;
      s.set(cx - 9 - k + rch * k * 1.6, yl, g[3], 110); s.set(cx - 9 - k + rch * k * 1.6, top + 19 + k * .6 - rch * k * .9 + (Math.sin(k + wv * TAU) - Math.sin(k)) * 1.2, g[1], 110); s.set(xr, yr, g[2], 110);
    }
    fadeOut(s, p.fade || 0, 11);
    s.emit = { dx: 0, dy: -22, rad: 56 * (1 - (p.fade || 0)), col: [.5, .7, 1] };
    s.pts = { head: [cx, top - 4], mouth: [cx, top + 12], body: [cx, top + 20], feet: [] };
  },
  stirge(s, gy, p) {
    const by = gy - 22 + (p.by || 0), bx = p.bx || 0, w = p.wing === undefined ? 1 : p.wing, sweep = p.sweep || 0, dip = p.dip || 0, dead = p.dead;
    for (let k = 0; k < 12; k++) {
      const sp = .55 + .45 * Math.min(1, Math.abs(w)), lt = [8 - k * .2 + sweep * (10 + k * .4), by + (-14 + k * 2.2) * sp + (1 - w) * 10 + sweep * 4], rt = [40 + k * .3 - sweep * 8, by + (-15 + k * 2) * sp + (1 - w) * 10 + sweep * 3];
      s.thick(24 + bx, by, lt[0] + bx, lt[1], 1, P.red, 1 + (k % 3)); s.thick(26 + bx, by, rt[0] + bx, rt[1], 1, P.red, 1 + (k % 3));
    }
    s.ball(25 + bx, by + 1, 5.6, 4.4, 2, P.furRust, { d: .14, n: .3 }); s.ball(31 + bx, by + 2 + dip * .5, 3.2, 3, 3, P.furRust, { d: .14 });
    s.line(33 + bx, by + 3 + dip * .5, 41 + bx - dip * 1.5, by + 7 + dip * 2.5, P.ink);
    if (dead) s.set(32 + bx, by + 1, P.furRust[1]); else s.set(32 + bx, by + 1, P.red[4], 230);
    const lg = p.legs || 0;
    s.line(23 + bx, by + 5, 21 + bx - lg * 2, by + 10 - lg * 2, P.ink); s.line(26 + bx, by + 5, 26 + bx - lg * 3, by + 10 - lg * 3, P.ink);
    s.pts = { head: [27 + bx, by - 16], mouth: [41 + bx - dip * 1.5, by + 7 + dip * 2.5], body: [25 + bx, by], feet: [] };
    s.sh = { rx: 7, ry: 2.4, dx: 2, dy: 22 };
  },
};

function shiftSpr(s, dx) {
  if (!dx) return;
  const c = s.c.slice(), e = s.e.slice();
  s.c.fill(null); s.e.fill(0);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const X = x + dx; if (X >= 0 && X < s.w) { s.c[y * s.w + X] = c[y * s.w + x]; s.e[y * s.w + X] = e[y * s.w + x]; } }
  for (const [k, v] of Object.entries(s.pts)) s.pts[k] = k === 'feet' ? v.map(q => [q[0] + dx, q[1], q[2]]) : [v[0] + dx, v[1]];
  if (s.sh) s.sh = { ...s.sh, dx: s.sh.dx + dx };
}
function rigCritter(kind, p) {
  p = p || {};
  const big = CRIT_BIG.has(kind), s = kind === 'stirge' ? new Spr(64, 84, 26, 52) : big ? new Spr(64, 60, 26, 52) : new Spr(44, 44, 20, 39);
  CRIT[kind](s, big ? 52 : 39, p);
  shiftSpr(s, rnd(p.dx || 0));
  const pts = s.pts;
  s.outline();
  s.pts = pts;
  return s;
}
