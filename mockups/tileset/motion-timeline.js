'use strict';
function script(A, start, steps, opt) {
  opt = opt || {};
  const out = [];
  let pos = start.slice(), t = 0, flip = !!opt.flip;
  for (const st of steps) {
    const [type, a, b, c] = st;
    if (type === 'at') { pos = a.slice(); continue; }
    if (type === 'go') {
      const pts = [pos, ...a], segs = [];
      let total = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], len = Math.hypot(dx, dy);
        if (len < .01) continue;
        const sideways = Math.abs(dx) >= Math.abs(dy) * .7;
        if (Math.abs(dx) > Math.abs(dy) * .25) flip = dx < 0;
        segs.push({ x: pts[i][0], y: pts[i][1], dx: dx / len, dy: dy / len, len, at: total, face: sideways ? 's' : dy > 0 ? 'f' : 'b', flip });
        total += len;
      }
      out.push({ type, t0: t, dur: total / b, v: b, anim: c || 'walk', segs, total, tag: st[4] });
      t += total / b; pos = pts[pts.length - 1].slice();
    } else if (type === 'run') {
      const len = Math.hypot(a[0], a[1]), dx = a[0] / len, dy = a[1] / len, sideways = Math.abs(dx) >= Math.abs(dy) * .7;
      flip = sideways ? dx < 0 : flip;
      out.push({ type: 'go', t0: t, dur: Infinity, v: b, anim: c || 'walk', total: Infinity, segs: [{ x: pos[0], y: pos[1], dx, dy, len: Infinity, at: 0, face: sideways ? 's' : dy > 0 ? 'f' : 'b', flip }] });
      t = Infinity;
    } else if (type === 'act' || type === 'hide') {
      const o = c || {};
      if (o.flip !== undefined) flip = !!o.flip;
      if (o.to) flip = o.to[0] < pos[0];
      out.push({ type, t0: t, dur: type === 'hide' ? a : b, anim: type === 'hide' ? 'idle' : a, x: pos[0], y: pos[1], flip, face: o.face || 's', rate: o.rate || 1, to: o.to, tag: o.tag });
      t += type === 'hide' ? a : b;
    }
  }
  return { A, steps: out, period: opt.pad ? Math.max(opt.pad, t) : t, start, loop: opt.loop !== false && isFinite(t) };
}

function stepAt(S, tl) {
  const st = S.steps;
  let lo = 0, hi = st.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (st[m].t0 <= tl) lo = m; else hi = m - 1; }
  return lo;
}
function along(step, d) {
  const segs = step.segs;
  let i = 0;
  while (i + 1 < segs.length && segs[i + 1].at <= d) i++;
  const g = segs[i], k = Math.min(d - g.at, g.len);
  return { x: g.x + g.dx * k, y: g.y + g.dy * k, g };
}
function lastHit(S, step, upTo) {
  const def = animOf(S.A, step.anim);
  if (step.type !== 'act' || !def.hit) return null;
  const per = def.dur / step.rate, cyc = Math.min(upTo, step.t0 + step.dur) - step.t0, k = def.once ? 0 : Math.floor(cyc / per - def.hit[0]);
  if (cyc / per < def.hit[0] || k < 0) return null;
  return { kind: def.hit[1], at: step.t0 + (k + def.hit[0]) * per, n: k, x: step.x, y: step.y, flip: step.flip, to: step.to, anim: step.anim, tag: step.tag };
}
function evalAt(S, t) {
  const A = S.A, P = S.period, tl = S.loop ? ((t % P) + P) % P : Math.min(t, isFinite(P) ? P - .0001 : t), i = stepAt(S, tl), step = S.steps[i], since = tl - step.t0, def = animOf(A, step.anim);
  const st = { A, t, tl, since, i, anim: step.anim, hidden: step.type === 'hide', moving: false, events: [], tag: step.tag, to: step.to };
  if (step.type === 'go') {
    const d = Math.min(step.v * since, step.total), p = along(step, d), cd = cycleDist(A, def) || 14;
    st.x = p.x; st.y = p.y; st.face = p.g.face; st.flip = p.g.flip; st.moving = true; st.u = d / cd; st.vx = p.g.dx * step.v; st.vy = p.g.dy * step.v; st.dist = d; st.cd = cd;
  } else {
    st.x = step.x; st.y = step.y; st.flip = step.flip; st.face = step.face;
    const cd = cycleDist(A, def);
    if (cd) st.u = since * 30 / cd; else { const cyc = since * step.rate / def.dur; st.u = def.once ? Math.min(cyc, .9999) : cyc; }
  }
  for (const k of [i, i - 1]) {
    const sp = S.steps[(k + S.steps.length) % S.steps.length];
    if (k < 0 && !S.loop) break;
    const base = k < 0 ? -P : 0, h = lastHit(S, sp, k === i ? tl : Infinity);
    if (h && tl - (h.at + base) < 3) st.events.push({ ...h, age: tl - (h.at + base) });
  }
  return st;
}
function footfalls(S, t, win) {
  const out = [], P = S.period, tl = S.loop ? ((t % P) + P) % P : t;
  for (const step of S.steps) {
    if (step.type !== 'go') continue;
    const cd = cycleDist(S.A, animOf(S.A, step.anim)) || 14, half = cd / 2;
    for (const base of S.loop ? [0, -P] : [0]) {
      const t0 = step.t0 + base, d1 = Math.min(step.total, (tl - t0) * step.v), d0 = Math.max(0, (tl - win - t0) * step.v);
      if (d1 < 0 || !(d1 >= d0)) continue;
      for (let j = Math.ceil(d0 / half); j * half <= d1; j++) {
        const p = along(step, j * half), sd = j & 1 ? 1 : -1;
        out.push({ x: p.x - p.g.dy * 2.2 * sd, y: p.y + p.g.dx * 1.2 * sd, age: tl - (t0 + j * half / step.v), n: j, anim: step.anim, dx: p.g.dx, dy: p.g.dy });
      }
    }
  }
  return out;
}
