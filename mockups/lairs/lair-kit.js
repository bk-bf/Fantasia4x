'use strict';
const LAIR = (() => {
  const at = (x, y) => [rnd(x * 32 + 16), rnd(y * 32 + 23)];
  const SCALED = ['L', 'Hb', 'leg', 'head', 'up', 'snout', 'snoutH', 'hump'];
  const young = (kind, f, over) => { const o = { ...BEASTS[kind].o }; for (const k of SCALED) if (o[k] !== undefined) o[k] *= f; return { ...o, extra: null, ...over }; };
  BEASTS.wolfpup = { name: 'Wolf Pup', o: young('wolf', .6, { head: 4.4, snout: 2.6, snoutH: 2.2, leg: 4.4, legw: 3, Hb: 4, up: 1.4, shag: .4 }) };
  BEASTS.bearcub = { name: 'Bear Cub', o: young('bear', .5, { head: 5.2, snout: 2.6, snoutH: 2.4, leg: 3.4, legw: 4, hump: .6, Hb: 5.6 }) };

  const QUAD = {
    sleep: { label: 'Sleeping', dur: 3.6, n: 4, pose(u, c) { const p = lying(c.o, u); p.by += u > .4 && u < .8 ? -.6 : 0; return p; } },
    drag: { label: 'Dragging a kill backward', gait: 'stalk', n: 8, pose(u, c) {
      const o = c.o;
      return { feet: gaitFeet(o, 'stalk', 1 - u), by: o.leg * .2 + sn(u * 2) * .4, pitch: -1.6, head: [2, (o.up || 0) + o.leg * .42], snout: 24, jaw: 1, ear: -1, tail: { a: -14, w: .8, ph: u * TAU } };
    } },
    feed: { label: 'Feeding on a kill', dur: 1.5, n: 8, pose(u, c) {
      const o = c.o, down = (o.up || 0) + o.leg * .78, tug = u > .55 && u < .82 ? 1 : 0;
      return { feet: [[1, 0], [2, 0], [0, 0], [1, 0]], by: o.leg * .1, pitch: -1.2, bx: -tug, head: [2 - tug * 2, down - tug * 2.6], snout: 50 - tug * 16, jaw: Math.floor(u * 8) & 1, ear: -1, tail: { a: -8, w: 1.2, ph: u * TAU } };
    } },
    rub: { label: 'Clawing a tree', dur: 1.6, n: 8, hit: [.5, 'chips'], pose(u, c) {
      const o = c.o, k = Math.floor(u * 8) & 1;
      return { feet: [[-2, 0], [3, o.leg * .9 + k * 2], [-3, 0], [4, o.leg * 1.2 - k * 2]], pitch: o.leg * .75, by: -1, head: [-1, -3 - k], snout: -18, jaw: 0, tail: { a: 0 } };
    } },
    tow: { label: 'Towing a kill through water', gait: 'stalk', n: 8, pose(u, c) { return { feet: gaitFeet(c.o, 'stalk', 1 - u), by: 2, sink: 4, head: [2, 1], snout: 6, jaw: 1, tail: { w: 2.4, ph: u * TAU } }; } },
    lurk: { label: 'Lying in wait', dur: 4, n: 4, pose(u, c) { return { feet: still4, by: 3, sink: 7, head: [0, 1], blink: u > .9 ? 1 : 0, tail: { w: .4, ph: u * TAU } }; } },
    wade: { label: 'Wading', gait: 'stalk', n: 8, pose(u, c) { return { feet: gaitFeet(c.o, 'stalk', u), by: 2, sink: 4, head: [1, 0], tail: { w: 2, ph: u * TAU } }; } },
    bask: { label: 'Basking', dur: 5, n: 4, pose(u, c) { const p = lying(c.o, u); p.blink = u > .5 ? 1 : 0; p.jaw = u < .3 ? 1 : 0; p.snout = -6; p.head = [1, 0]; return p; } },
  };

  const kitRigQuad = rigQuad;
  function sunk(s, rows) {
    const line = s.ay - rnd(rows);
    for (let y = line + 1; y < s.h; y++) for (let x = 0; x < s.w; x++) { s.c[y * s.w + x] = null; s.e[y * s.w + x] = 0; }
    let x0 = s.w, x1 = 0;
    for (let x = 0; x < s.w; x++) if (s.c[line * s.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    for (let x = x0 - 2; x <= x1 + 2; x++) if (hash(x, rows, 7) > .35) s.set(x, line, P.shallow[x < x0 || x > x1 ? 4 : 5]);
    s.sh = null;
    s.pts.feet = [];
  }
  rigQuad = function (kind, p) { const s = kitRigQuad(kind, p); if (p && p.sink) sunk(s, p.sink); return s; };

  const quad = kind => { const A = mkActor('quad', kind); A.anims = { ...QUAD_ANIMS, ...QUAD }; return A; };
  const pawn = (kind, over) => mkActor('pawn', kind, over);
  const critter = kind => mkActor(kind === 'rabbit' ? 'rabbit' : kind === 'fowl' ? 'fowl' : 'critter', kind);
  const STILL = { label: '', dur: 1, n: 1 };
  let PROPS = 0;
  const prop = spr => ({ rig: 'plain', kind: 'prop', seed: 0, id: 'prop' + (++PROPS), look: 'prop' + PROPS, base: spr, name: '', anims: { idle: STILL, still: STILL } });

  const RIGS = {};
  const kitFrameOf = frameOf;
  frameOf = function (A, st, lvl, smooth) {
    const R = RIGS[A.rig];
    if (!R) return kitFrameOf(A, st, lvl, smooth);
    const def = animOf(A, st.anim), n = (def.n || 6) * (smooth ? 3 : 1), u0 = clamp(st.u - Math.floor(st.u), 0, .9999), u = (Math.floor(u0 * n) + .5) / n;
    const key0 = quant(def.pose(u, { t: st.t || 0, seed: A.seed, lvl, o: A.o }), 5), flip = !!st.flip;
    return { s: cachedFrame(A.look + '|' + key0 + (flip ? 'F' : ''), () => { const s = R(A, JSON.parse(key0)); return flip ? mirror(s) : s; }), dx: 0, dy: 0 };
  };

  function clock(keys) {
    const period = keys[keys.length - 1][0], seg = (v, i, o) => { let n = 0; while (n + 2 < keys.length && keys[n + 1][i] <= v) n++; const a = keys[n], b = keys[n + 1]; return a[o] + (b[o] - a[o]) * clamp((v - a[i]) / (b[i] - a[i]), 0, 1); };
    return { period, hour: t => seg(((t % period) + period) % period, 0, 1), sec: h => seg(h, 1, 0) };
  }
  function routine(time) {
    const list = [], period = time.period, secOf = time.sec;
    const opt = o => !o ? undefined : o.to ? { ...o, to: at(o.to[0], o.to[1]) } : o;
    function add(A, tile, name) {
      const b = { A, name, steps: [], states: [], t: 0, pos: tile.slice(), start: tile.slice(), lies: 'down' };
      const wait = (anim, dur, o) => { if (dur < -.05) console.warn('lair routine runs late', name || A.kind, anim, dur.toFixed(2)); if (dur > .01) { b.steps.push(anim ? ['act', anim, dur, opt(o)] : ['hide', dur]); b.t += dur; } return b; };
      b.go = (pts, v, anim, tag) => { let p = b.pos, len = 0; for (const q of pts) { len += Math.hypot(q[0] - p[0], q[1] - p[1]) * 32; p = q; } b.steps.push(['go', pts.map(q => at(q[0], q[1])), v, anim, tag]); b.t += len / v; b.pos = p.slice(); return b; };
      b.act = (anim, dur, o) => wait(anim, dur, o);
      b.until = (hour, anim, o) => wait(anim, secOf(hour) - b.t, o);
      b.untilT = (t, anim, o) => wait(anim, t - b.t, o);
      b.rest = (anim, o) => wait(anim, period - b.t - .01, o);
      b.hide = dur => wait(null, dur);
      b.hideUntil = hour => wait(null, secOf(hour) - b.t);
      b.hideUntilT = t => wait(null, t - b.t);
      b.state = label => { b.states.push([b.t, label]); return b; };
      b.jump = to => { b.steps.push(['at', at(to[0], to[1])]); b.pos = to.slice(); return b; };
      b.drag = (pts, v, load, reach, anim) => {
        const side = pts[pts.length - 1][0] < b.pos[0] ? 1 : -1, off = q => [q[0] + side * reach, q[1] + .04];
        load.untilT(b.t, load.lies).go(pts.map(off), v, load.lies, load.keeps ? 'back' : undefined);
        return b.go(pts, v, anim || 'drag', 'back');
      };
      list.push(b);
      return b;
    }
    function done() {
      return list.map(b => {
        const S = script(b.A, at(b.start[0], b.start[1]), b.steps, { pad: period });
        for (const st of S.steps) if (st.tag === 'back') for (const g of st.segs) g.flip = !g.flip;
        S.name = b.name || '';
        S.states = b.states.length ? b.states : null;
        if (b.t > period + .05) console.warn('lair routine overruns the day', b.name || b.A.kind, (b.t - period).toFixed(2));
        return S;
      });
    }
    return { add, done, secOf, period };
  }

  const DECAY = { abandoned: 1, overgrown: 2, ruin: 3 }, WORN = [1, 1, .62, .3];
  const ROT = { food: [1, .5, 0, 0], hide: [1, 1, .5, 0], wood: [1, 1, 1, 0], bone: [1, 1, .6, .3] };
  const left = (n, kind, decay) => Math.ceil(n * (ROT[kind] ? ROT[kind][decay] : 1));
  const yard = (dist, reach, decay, worn, grown) => dist < reach * WORN[decay] ? worn : dist < reach ? grown : null;
  function regrow(k, cx, cy, rx, ry, seed, kinds, young, shown = []) {
    if (k.decay < 2) return;
    const r = rng(seed * 53 + k.decay), ruin = k.decay > 2;
    for (let i = 0; i < Math.round(rx * ry * (ruin ? 1.5 : .8)); i++) {
      const a = r() * TAU, q = Math.sqrt(r()), x = cx + Math.cos(a) * q * rx, y = cy + Math.sin(a) * q * ry, pick = r();
      if (GROUND[k.w.g[Math.round(y) * k.w.W + Math.round(x)]].water || shown.some(p => Math.abs(x - p[0]) < 1.3 && y - p[1] > -.5 && y - p[1] < 1.3)) continue;
      k.put(ruin && pick < .12 ? LAIR_PROPS.sapling(seed + i, young) : pick < (ruin ? .42 : .2) ? plant(kinds[i % kinds.length], i, k.season) : LAIR_PROPS.weeds(seed + i, 26 + (i % 3) * 6, k.decay - 1, k.turf), x, y);
    }
  }

  const sprite = (...ids) => { for (const id of ids) { const e = DBX.byId.get(id); if (e && e.kind === 'sprite') return DBX.built(e); } throw new Error('no kit sprite among ' + ids.join(', ')); };
  const copy = s => { const c = new Spr(s.w, s.h, s.ax, s.ay); c.c = s.c.slice(); c.e = s.e.slice(); c.sh = s.sh; c.emit = s.emit; c.sway = s.sway; c.leaf = s.leaf; return c; };

  return { at, quad, pawn, critter, prop, RIGS, clock, routine, sprite, copy, STILL, DECAY, left, yard, regrow };
})();
const LAIR_SCENES = {};
