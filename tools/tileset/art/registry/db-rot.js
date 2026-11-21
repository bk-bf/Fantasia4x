'use strict';
(() => {
  const X = DBX, DIRS = ['s', 'e', 'n', 'w'], SEEN = { s: 's', n: 'n', e: 'w', w: 'e' };
  const AX = 70, AY = 150;
  class Model {
    constructor(W, D) { this.W = W; this.D = D; this.el = []; this.lights = []; }
    add(e) { this.el.push(e); return e; }
    box(x, y, z, w, d, h, mat, o) { return this.add(Object.assign({ k: 'box', x, y, z, w, d, h, mat, on: [] }, o)); }
    cyl(cx, cy, z, rx, ry, h, mat, o) { return this.add(Object.assign({ k: 'cyl', x: cx - rx, y: cy - ry, z, w: rx * 2, d: ry * 2, h, mat, on: [] }, o)); }
    stack(cx, cy, z, ry, h, wf, tex, o) { let m = 0; for (let j = 0; j < h; j++) m = Math.max(m, wf(j / Math.max(1, h - 1))); return this.add(Object.assign({ k: 'stack', x: cx - m / 2, y: cy - ry, z, w: m, d: ry * 2, h, wf, tex, on: [] }, o)); }
    panel(x0, y0, x1, y1, z, h, draw, o) { const ax = y0 === y1; return this.add(Object.assign({ k: 'panel', x: Math.min(x0, x1), y: Math.min(y0, y1), z, w: ax ? Math.abs(x1 - x0) : 1, d: ax ? 1 : Math.abs(y1 - y0), h, ax, draw, on: [] }, o)); }
    spr(x, y, z, draw, o) { o = o || {}; return this.add(Object.assign({ k: 'spr', x: x - (o.w || 2) / 2, y: y - (o.d || 2) / 2, z, w: o.w || 2, d: o.d || 2, h: o.h || 4, draw, on: [] }, o)); }
    top(e, draw) { e.on.push({ f: 'top', draw }); return e; }
    face(e, f, draw) { e.on.push({ f, draw }); return e; }
    light(x, y, z, rad, col) { this.lights.push({ x, y, z, rad, col }); }
  }
  const pt = (dir, W, D, x, y) => dir === 's' ? [x, y] : dir === 'n' ? [W - x, D - y] : dir === 'e' ? [y, W - x] : [D - y, x];
  const rect = (dir, W, D, e) => e.k === 'cyl' || e.k === 'stack' ? (c => [c[0] - e.w / 2, c[1] - e.d / 2, e.w, e.d])(pt(dir, W, D, e.x + e.w / 2, e.y + e.d / 2)) : dir === 's' ? [e.x, e.y, e.w, e.d] : dir === 'n' ? [W - e.x - e.w, D - e.y - e.d, e.w, e.d] : dir === 'e' ? [e.y, W - e.x - e.w, e.d, e.w] : [D - e.y - e.d, e.x, e.d, e.w];
  const unTop = (dir, w, d, i, j) => dir === 's' ? [i, j] : dir === 'n' ? [w - 1 - i, d - 1 - j] : dir === 'e' ? [w - 1 - j, i] : [j, d - 1 - i];
  const toTop = (dir, w, d, i, j) => dir === 's' ? [i, j] : dir === 'n' ? [w - 1 - i, d - 1 - j] : dir === 'e' ? [j, w - 1 - i] : [d - 1 - j, i];
  const order = list => {
    const out = [], rest = list.slice();
    const before = (a, b) => { if (a.X + a.Wd <= b.X || b.X + b.Wd <= a.X) return false; if (a.z + a.h <= b.z) return true; if (b.z + b.h <= a.z) return false; if (a.Y + a.Dp <= b.Y) return true; if (b.Y + b.Dp <= a.Y) return false; return a.Y + a.Dp < b.Y + b.Dp || (a.Y + a.Dp === b.Y + b.Dp && a.z < b.z); };
    while (rest.length) { let k = rest.findIndex(e => !rest.some(r => r !== e && before(r, e) && !before(e, r))); if (k < 0) k = 0; out.push(rest.splice(k, 1)[0]); }
    return out;
  };
  const render = (m, dir, st) => {
    st = st || {};
    let s = new Spr(140, 190, AX, AY); const sw = dir === 's' || dir === 'n' ? m.W : m.D, sd = dir === 's' || dir === 'n' ? m.D : m.W, ox = AX - Math.round(sw / 2), fy = AY + Math.round((sd - m.D) / 2), oy = fy - sd;
    const els = m.el.filter(e => !e.when || e.when(st, dir)).map(e => { const r = rect(dir, m.W, m.D, e); return Object.assign({}, e, { X: r[0], Y: r[1], Wd: r[2], Dp: r[3], src: e }); });
    const set = (x, y, c, em) => { if (c) s.set(Math.round(x), Math.round(y), c, em || 0); };
    for (const e of order(els)) {
      const sx = ox + e.X, syT = oy + e.Y - e.z - e.h, seen = SEEN[dir];
      if (e.k === 'box') {
        const mt = e.mat, side = (e.faces && e.faces[seen]) || mt.side, w = Math.round(e.Wd), d = Math.round(e.Dp), h = Math.round(e.h);
        if (!e.noTop) for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) { const [oi, oj] = unTop(dir, Math.round(e.w), Math.round(e.d), i, j); let c = mt.top(e.x + oi, e.y + oj, oi, oj); if (!c) continue; if (j === 0 || i === 0) c = lit(c, 1.16); else if (i === w - 1) c = dark(c, .82); set(sx + i, syT + j, c, e.e); }
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let c = side(e.x + i, e.z + j, i, j, w, h); if (!c) continue; c = dark(c, j === 0 ? .9 : .74); if (i === 0) c = lit(c, 1.14); else if (i === w - 1 || j === h - 1) c = dark(c, .74); set(sx + i, syT + d + j, c, e.e); }
      } else if (e.k === 'cyl') {
        const rx = e.Wd / 2, ry = e.Dp / 2, cx = sx + rx, cyT = syT + ry, mt = e.mat;
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const nx = (x + .5 - cx) / rx; if (Math.abs(nx) > 1) continue; const y0 = cyT + Math.sqrt(1 - nx * nx) * ry, u = (nx + 1) / 2; for (let j = 0; j < e.h; j++) { let c = mt.side(x, Math.round(y0) + j, x - Math.floor(cx - rx), j, e.Wd, e.h); if (!c) continue; c = u < .12 ? lit(c, 1.05) : u < .32 ? lit(c, 1.22) : u < .6 ? c : u < .82 ? dark(c, .78) : dark(c, .6); if (j === e.h - 1) c = dark(c, .8); set(x, Math.round(y0) + j, c, e.e); } }
        if (!e.noTop) for (let y = Math.floor(cyT - ry); y <= Math.ceil(cyT + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const nx = (x + .5 - cx) / rx, ny = (y + .5 - cyT) / ry, q = nx * nx + ny * ny; if (q > 1) continue; let c = mt.top(x, y, nx, ny, q); if (!c) continue; if (q > .72 && !e.flatTop) c = nx + ny < 0 ? lit(c, 1.18) : dark(c, .8); set(x, y, c, e.topE || e.e); }
      } else if (e.k === 'stack') {
        const cx = sx + e.Wd / 2, base = Math.round(oy + e.Y + e.Dp - e.z) - 1;
        for (let j = 0; j < e.h; j++) { const t = j / Math.max(1, e.h - 1), w = Math.max(1, Math.round(e.wf(t))), x0 = Math.round(cx - w / 2), y = base - e.h + 1 + j; for (let i = 0; i < w; i++) { const u = w > 1 ? i / (w - 1) : .5; let c = e.tex(x0 + i, y, i, j, t); if (!c) continue; c = u < .12 ? lit(c, 1.05) : u < .32 ? lit(c, 1.22) : u < .6 ? c : u < .82 ? dark(c, .78) : dark(c, .6); set(x0 + i, y, c, e.e); } }
      } else if (e.k === 'panel') {
        const facing = (e.ax && (dir === 's' || dir === 'n')) || (!e.ax && (dir === 'e' || dir === 'w')), len = Math.round(e.ax ? e.w : e.d), flip = (e.ax && dir === 'n') || (!e.ax && dir === 'w');
        if (facing) e.draw((i, k, c, em) => set(sx + (flip ? len - 1 - i : i), oy + e.Y - e.z - k, c, em), len, e.h, 1);
        else { const far = (e.ax && dir === 'e') || (!e.ax && dir === 'n'); for (let q = 0; q < len; q++) { const i = far ? len - 1 - q : q; e.draw((ii, k, c, em) => { if (ii === i) set(sx, oy + e.Y + q - e.z - k, q === len - 1 ? c : c && dark(c, .86), em); }, len, e.h, 0); } }
      } else if (e.k === 'spr') e.draw(s, Math.round(sx + e.Wd / 2), Math.round(oy + e.Y + e.Dp / 2 - e.z), dir, st);
      for (const a of e.on) {
        if (a.f === 'top') { const w = Math.round(e.w), d = Math.round(e.d); a.draw((i, j, c, em) => { const [ti, tj] = toTop(dir, w, d, Math.round(i), Math.round(j)); if (ti < -1 || tj < -1 || ti > e.Wd || tj > e.Dp) return; set(sx + ti, syT + tj, c, em); }, w, d, st, dir); }
        else if (a.f === seen || a.f === 'any') { const w = Math.round(e.Wd), h = Math.round(e.h), y0 = syT + Math.round(e.Dp) + h - 1; a.draw((i, k, c, em) => { if (i < 0 || i >= w) return; set(sx + i, y0 - k, c, em); }, w, h, st, dir); }
      }
    }
    s.outline();
    let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.c[y * s.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return s;
    const full = s, tw = x1 - x0 + 3, th = Math.max(y1, AY) - y0 + 3;
    s = new Spr(tw, th, AX - x0 + 1, AY - y0 + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * full.w + x, k = (y - y0 + 1) * tw + x - x0 + 1; s.c[k] = full.c[i]; s.e[k] = full.e[i]; }
    const L = m.lights.filter(l => !l.when || l.when(st))[0];
    if (L && !st.idle) { const p = pt(dir, m.W, m.D, L.x, L.y); s.emit = { dx: ox + p[0] - AX, dy: oy + p[1] - L.z - AY, rad: L.rad, col: L.col, flicker: 1 }; }
    return s;
  };
  const station = (id, build, o) => {
    o = o || {};
    X.drop('building', id);
    const states = [['', {}]];
    for (let f = 1; f < (o.frames || 1); f++) states.push(['-f' + f, { frame: f }]);
    if (o.idle) states.push(['-idle', { idle: 1 }]);
    if (o.empty) states.push(['-empty', { empty: 1 }]);
    for (const [suf, st] of states) X.reg('building', id, 's' + suf, () => { const q = Object.assign({ frame: 0 }, st); return render(build(q, 's'), 's', q); }, { at: [16, 23] });
  };
  X.rot = { Model, render, station };
})();
