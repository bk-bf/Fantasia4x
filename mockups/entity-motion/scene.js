'use strict';
const SCENE = (() => {
  const SOFT = new Set(['dirt', 'mud', 'tilled', 'riverbank', 'clay', 'cave', 'rocky']);
  const cam = { x: 832, y: 540, k: 2 }, built = {};
  let host = null, world = null, cv = null, ctx = null, cur = null, drag = null, lastT = 0, snowSet = null;

  function build(season) {
    if (built[season]) return built[season];
    const w = buildScene(season), actors = new Set();
    for (const [k, s] of sprCache) if (k[0] === 'w' || k[0] === 'a') actors.add(s);
    const C = buildCast(w, season);
    w.objs = w.objs.filter(o => !actors.has(o.spr) && !C.clear.some(p => Math.hypot(o.x - p[0], o.y - p[1]) < 26));
    const r = renderWorld(w, { season, roofs: 'cut', cache: {} });
    const live = r.anim.map(o => ({ o, key: rnd(o.y) }));
    r.anim = [];
    return built[season] = { w, r, C, base: r.sway.slice(), live, season, lights: new Map(), plain: {} };
  }
  function mount(el, state, onCast) {
    host = el; world = el.querySelector('#world'); cv = el.querySelector('#map');
    const busy = el.querySelector('#busy');
    busy.hidden = false; cur = null;
    setTimeout(() => {
      const B = build(state.season);
      cv.width = B.r.W; cv.height = B.r.H; ctx = cv.getContext('2d');
      world.style.width = B.r.W + 'px'; world.style.height = B.r.H + 'px';
      SEASON = B.season;
      if (!B.r.work) present(B.r, ctx, 'day', 0, { calm: false, clip: { x0: 0, y0: 0, x1: 16, y1: 16 }, post() {} });
      snowSet = new Set(P.snow.map(pack));
      cur = B; busy.hidden = true; onCast(B.C.follows);
    }, 30);
    if (el._wired) return;
    el._wired = true;
    el.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, cx: cam.x, cy: cam.y }; el.classList.add('drag'); el.setPointerCapture(ev.pointerId); });
    el.addEventListener('pointermove', ev => { if (!drag) return; cam.x = drag.cx - (ev.clientX - drag.x) / cam.k; cam.y = drag.cy - (ev.clientY - drag.y) / cam.k; cam.free = true; });
    el.addEventListener('pointerup', () => { if (!drag) return; drag = null; el.classList.remove('drag'); if (cam.free) { MOTION.extra.follow = ''; document.getElementById('follow').value = ''; MOTION.write({ cx: rnd(cam.x), cy: rnd(cam.y), follow: null }); } });
  }

  function shadows(B, list, base, undo) {
    const { W, H, dep, own, sh } = B.r;
    for (const it of list) {
      const s = it.s.sh; if (!s) continue;
      const mx = it.x + s.dx, my = it.y + s.dy;
      for (let y = Math.max(0, Math.floor(my - s.ry)); y <= Math.min(H - 1, my + s.ry); y++) for (let x = Math.max(0, Math.floor(mx - s.rx)); x <= Math.min(W - 1, mx + s.rx); x++) {
        const nx = (x - mx) / s.rx, ny = (y - my) / s.ry, q = nx * nx + ny * ny, th = dith(x, y) * .7 + .15;
        if (q >= 1 || clamp((1 - q) * 3.2, 0, 1) <= th) continue;
        const p = y * W + x;
        if (dep[p] || own[p] || sh[p] > th) continue;
        const c = base[p];
        undo.push(p, c);
        base[p] = (0xff000000 | (((c >> 16 & 255) * .68) << 16) | (((c >> 8 & 255) * .56) << 8) | ((c & 255) * .56)) >>> 0;
      }
    }
  }
  function lamps(B, time, tick, want) {
    const r = B.r, mine = B.lights;
    if (time === 'day') { if (mine.size) { mine.clear(); r.ltime = null; } return; }
    if (r.ltime !== time) { lightPass(r, time, tick); r.lkey = time + tick; mine.clear(); }
    const tm = TIMES[time], old = [];
    let moved = false;
    for (const [id, m] of mine) if (!want.has(id)) { old.push(m.box); r.dyn.splice(r.dyn.indexOf(m.box), 1); mine.delete(id); moved = true; }
    for (const [id, l] of want) {
      const m0 = Math.ceil(l.rad * 1.1 / 4) * 4, bw = m0 * 2 + 1, bh = Math.ceil(m0 * .82) * 2 + 1, x = clamp(Math.round(l.x / 4) * 4, m0, r.W - m0 - 1), y = clamp(Math.round(l.y / 4) * 4, m0, r.H - m0 - 1), hy = (bh - 1) >> 1;
      let m = mine.get(id);
      if (!m) {
        const vars = [.92, 1, 1.08].map(k => { const rad = l.rad * k, f = new Float32Array(bw * bh * 3); for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) { const d = Math.hypot(i - m0, (j - hy) * 1.25) / rad; if (d >= 1) continue; const q = Math.floor((1 - d) * (1 - d) * 7 + dith(i - m0, j - hy)) / 7 * tm.lk, p = (j * bw + i) * 3; f[p] = l.col[0] * q; f[p + 1] = l.col[1] * q; f[p + 2] = l.col[2] * q; } return f; });
        m = { box: { x0: x - m0, y0: y - hy, x1: x + m0, y1: y + hy, bw, bh, vars }, x, y };
        mine.set(id, m); r.dyn.push(m.box); moved = true;
      } else if (m.x !== x || m.y !== y) {
        old.push({ x0: m.box.x0, y0: m.box.y0, x1: m.box.x1, y1: m.box.y1 });
        m.box.x0 = x - m0; m.box.y0 = y - hy; m.box.x1 = x + m0; m.box.y1 = y + hy; m.x = x; m.y = y; moved = true;
      }
    }
    if (!moved && r.lkey === time + tick) return;
    for (const b of old) for (let y = b.y0; y <= b.y1; y++) r.Ld.fill(0, (y * r.W + b.x0) * 3, (y * r.W + b.x1 + 1) * 3);
    lightPass(r, time, tick);
    for (const b of old) lightMul(r, time, b.x0, b.y0, b.x1, b.y1, 0);
    r.lkey = time + tick;
  }

  function frame(state, T, extra) {
    if (!cur || !ctx) return 0;
    const B = cur, r = B.r, C = B.C, lvl = +state.lvl, smooth = state.cad === 'smooth', time = state.time, W = host.clientWidth, H = host.clientHeight;
    SEASON = B.season;
    const items = castFrame(C.cast, T, lvl, smooth), list = [], entries = [];
    for (const it of items) if (it.fr) { list.push({ s: it.fr.s, x: it.x, y: it.y }); entries.push({ s: it.fr.s, x: it.x, y: it.y, key: it.key, amp: 0 }); }
    const ts = treeState(C.tree, C.plan, T, lvl, smooth);
    for (const p of ts.parts) { list.push(p); entries.push({ s: p.s, x: p.x, y: p.y, key: rnd(C.tree.y) + (p.top ? 1 : 0), amp: p.sway || 0 }); }
    for (const a of B.live) { const f = a.o.spr.frames[Math.floor(T * 6) % a.o.spr.frames.length]; entries.push({ s: f, x: a.o.x, y: a.o.y, key: a.key, amp: 0 }); }
    entries.sort((a, b) => a.key - b.key);
    const merged = [], st = B.base;
    let i = 0;
    for (const e of entries) {
      while (i < st.length && st[i].key <= e.key) merged.push(st[i++]);
      const s = e.s;
      merged.push({ pk: s.pk || packSpr(s), w: s.w, h: s.h, ay: s.ay, x0: e.x - s.ax, y0: e.y - s.ay, key: e.key, amp: e.amp, ph: e.x * .045 + e.y * .02, bx: e.x, by: e.y });
    }
    while (i < st.length) merged.push(st[i++]);
    r.sway = merged;

    const k = cam.k = +state.zoom, fol = extra.follow !== '' && items[+extra.follow];
    if (fol && !drag) { cam.x = fol.st.x; cam.y = fol.st.y - 12; cam.free = false; }
    else if (!cam.free && extra.cx) { cam.x = +extra.cx; cam.y = +extra.cy; }
    const vw = W / k, vh = H / k, left = r.W <= vw ? (r.W - vw) / 2 : clamp(cam.x - vw / 2, 0, r.W - vw), top = r.H <= vh ? (r.H - vh) / 2 : clamp(cam.y - vh / 2, 0, r.H - vh);
    world.style.transform = `translate(${-Math.round(left * k)}px,${-Math.round(top * k)}px) scale(${k})`;
    const clip = { x0: Math.floor(left) - 2, y0: Math.floor(top) - 2, x1: Math.ceil(left + vw) + 2, y1: Math.ceil(top + vh) + 2 };

    const want = new Map();
    if (lvl > 2 && time !== 'day') items.forEach((it, n) => {
      if (!it.fr) return;
      if (it.fr.s.pts.glow) { const g = ptOf(it, 'glow'); want.set('t' + n, { x: g[0], y: g[1] + 20, rad: 96, col: [1, .6, .24] }); }
      for (const e of it.st.events) if (e.kind === 'spark' && e.age < .1) want.set('s' + n, { x: e.x + (e.flip ? -19 : 19), y: e.y + 4, rad: 70, col: [1, .66, .3] });
    });
    if (r.work) lamps(B, time, Math.floor(T * 6), want);

    const base = r.gb[time] || (r.gb[time] = gradeArr(r.alb32, r.em, time)), undo = [];
    shadows(B, list, base, undo);
    const am = TIMES[time].amb, night = time !== 'day', cold = B.season === 'winter' || (time === 'night' && B.season === 'autumn');
    const post = (rr, a, e, tm, X0, X1, Y0, Y1, tint) => {
      const RW = r.W, w = B.w;
      const pen = {
        put(x, y, c, em, ground) { x = rnd(x); y = rnd(y); if (x < X0 || x >= X1 || y < Y0 || y >= Y1) return; const p = y * RW + x; if (ground && a[p] !== base[p]) return; a[p] = gradePx(pack(c), em || 0, am, night); if (em) e[p] = em; },
        ground(x, y) { x = clamp(rnd(x), 0, RW - 1); y = clamp(rnd(y), 0, r.H - 1); const p = y * RW + x; if (r.own[p]) return 'water'; if (snowSet.has(r.alb32[p])) return 'snow'; const ti = (y >> 5) * w.W + (x >> 5); if (w.floor[ti]) return 'floor'; return SOFT.has(GROUND[w.g[ti]].id) && !r.gm[p] ? 'soft' : 'grass'; },
        under(x, y) { const c = r.alb32[clamp(rnd(y), 0, r.H - 1) * RW + clamp(rnd(x), 0, RW - 1)]; return [c & 255, c >> 8 & 255, c >> 16 & 255]; },
      };
      castGround(pen, items, T, lvl);
      for (const b of ts.bursts) FX.burst(pen, ...b);
      if (lvl > 2) FX.smoke(pen, C.smoke[0], C.smoke[1], T);
      castFx(pen, items, T, lvl, { cold });
      const gust = (x, y) => { const pv = (r.gph[clamp(y, 0, r.H - 1) * RW + clamp(x, 0, RW - 1)] - tint) & 255; if (pv < WIND.from) return 0; const s = Math.sin((pv - WIND.from) / (255 - WIND.from) * Math.PI); return s * s; };
      particles(r, T, clamp(T - lastT, 0, .25), tm, X0, X1, Y0, Y1, a, e, gust);
    };
    present(r, ctx, time, T, { clip, post });
    for (let j = undo.length - 2; j >= 0; j -= 2) base[undo[j]] = undo[j + 1];
    lastT = T;
    return items.filter(it => it.fr).length;
  }
  return { mount, frame };
})();
