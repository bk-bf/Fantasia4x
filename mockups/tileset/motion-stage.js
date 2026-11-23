'use strict';
const EMOTE = { talk: 'talk', alert: 'alert', panic: 'alert', cry: 'tear', tired: 'z', flap: 'alert', bolt: 'alert' };

function castFrame(cast, T, lvl, smooth) {
  const items = [];
  for (const S of cast) {
    const st = evalAt(S, T);
    if (st.hidden) { items.push({ S, st, fr: null }); continue; }
    const fr = frameOf(S.A, st, lvl, smooth);
    items.push({ S, st, fr, x: fr ? rnd(st.x) + fr.dx : rnd(st.x), y: fr ? rnd(st.y) + fr.dy : rnd(st.y), key: rnd(st.y) });
  }
  return items;
}
const ptOf = (it, name) => { const s = it.fr.s, p = (s.pts && s.pts[name]) || [s.ax, s.ay - 30]; return [it.x - s.ax + p[0], it.y - s.ay + p[1]]; };

function castGround(pen, items, T, lvl) {
  if (lvl < 3) return;
  for (const it of items) if (it.S.A.rig !== 'plain') MOTION_FX.steps(pen, footfalls(it.S, T, 9), lvl, it.S.A.rig);
}
function castFx(pen, items, T, lvl, env) {
  items.forEach((it, idx) => {
    const { S, st, fr } = it, A = S.A;
    for (const e of st.events) {
      const dir = e.flip ? -1 : 1;
      if (e.kind === 'arrow') { MOTION_FX.arrow(pen, { ...e, stick: lvl > 2 && e.tag !== 'kill' }, dir); continue; }
      if (lvl > 2) MOTION_FX.burst(pen, e.kind, e.x, e.y, e.age, idx * 131 + e.n * 17, dir);
    }
    if (!fr) return;
    if (A.o && A.o.tool === 'torch' && lvl > 1 && fr.s.pts.glow) { const g = ptOf(it, 'glow'); MOTION_FX.flame(pen, g[0], g[1], T, A.seed); }
    if (lvl < 3) return;
    const head = ptOf(it, 'head'), lie = st.anim === 'sleep' || st.anim === 'down' || st.anim === 'rest';
    if (st.anim === 'sleep') MOTION_FX.zzz(pen, it.x + 6, it.y - 12, T + A.seed * 3);
    const em = st.tag && GLYPHS.has(st.tag) ? st.tag : EMOTE[st.anim];
    if (em && (em !== 'alert' || st.since < 1.6)) MOTION_FX.bubble(pen, head[0], head[1] - 2, em, T + A.seed);
    if (env && env.cold && !lie) { const m = ptOf(it, 'mouth'); MOTION_FX.breath(pen, m[0], m[1], st.face === 's' ? (st.flip ? -1 : 1) : 0, T, A.seed); }
  });
}
const GLYPHS = new Set(['talk', 'alert', 'z', 'tear', 'heart', 'food', 'note']);

function fellPlan(S) {
  const steps = S.steps.filter(s => s.tag === 'fell');
  if (!steps.length) return null;
  const def = animOf(S.A, 'chop'), hits = [];
  for (const s of steps) for (let k = 0; s.t0 + (k + def.hit[0]) * def.dur <= s.t0 + s.dur; k++) hits.push(s.t0 + (k + def.hit[0]) * def.dur);
  const take = S.steps.find(s => s.tag === 'take'), last = steps[steps.length - 1];
  return { hits, fallAt: hits[hits.length - 1], clearAt: take ? take.t0 + take.dur * .45 : Infinity, dir: last.flip ? -1 : 1, period: S.period };
}
function treeState(tree, plan, T, lvl, smooth) {
  const tl = ((T % plan.period) + plan.period) % plan.period, out = { parts: [], bursts: [] }, dir = plan.dir;
  if (tl < plan.fallAt) {
    let dx = 0;
    const h = plan.hits.filter(t => t <= tl).pop();
    if (h !== undefined && lvl > 0) { const age = tl - h; dx = age < .06 ? dir : age < .12 ? -dir : age < .18 && lvl > 2 ? dir : 0; if (lvl > 2 && age < 1.6) out.bursts.push(['leaves', tree.x, tree.y, age, rnd(h * 10), 1, { at: [0, -tree.spr.ay * .62] }]); }
    out.parts.push({ s: tree.spr, x: tree.x + dx, y: tree.y, sway: dx ? 0 : tree.spr.sway });
    return out;
  }
  const age = tl - plan.fallAt, D = .8;
  out.parts.push({ s: tree.stump, x: tree.x, y: tree.y });
  if (lvl > 1 && age < D + .5) {
    const k = Math.min(1, age / D), a0 = age < D ? 90 * k * k * k : age < D + .12 ? 86 : 90, step = smooth ? 3 : 9, ang = Math.min(90, Math.round(a0 / step) * step);
    const key = 'fell' + tree.spr.w + tree.spr.h + tree.spr.ay + ang + dir;
    out.parts.push({ s: cachedFrame(key, () => { const s = rotated(tree.cut, ang, dir); s.pts = {}; return s; }), x: tree.x, y: tree.y - 3, top: 1 });
    if (lvl > 2 && age >= D) { out.bursts.push(['dustfall', tree.x + dir * tree.spr.ay * .55, tree.y, age - D, 7, 1]); out.bursts.push(['leaves', tree.x + dir * tree.spr.ay * .7, tree.y, age - D, 9, 1, { at: [0, -8], vz: [10, 60], g: 120 }]); }
    return out;
  }
  if (tl < plan.clearAt) out.parts.push({ s: tree.logs, x: tree.x + dir * 22, y: tree.y + 3 });
  return out;
}
function mkTreeProp(kind, seed, season, x, y) {
  const spr = tree(kind, seed, season), cut = new Spr(spr.w, spr.h, spr.ax, spr.ay - 4);
  for (let yy = 0; yy < spr.h - 5; yy++) for (let xx = 0; xx < spr.w; xx++) { cut.c[yy * spr.w + xx] = spr.c[yy * spr.w + xx]; cut.e[yy * spr.w + xx] = spr.e[yy * spr.w + xx]; }
  cut.sh = spr.sh; cut.leaf = spr.leaf;
  return { spr, cut, stump: plant('stump', seed, season), logs: plant('logs', seed, season), x: rnd(x), y: rnd(y) };
}
