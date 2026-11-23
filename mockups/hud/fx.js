'use strict';
(() => {
  const A = HUD.art, F = HUD.fxart, RAMP = A.RAMP, Q = new URLSearchParams(location.search), $ = id => document.getElementById(id);
  const { HURT, CRIT, DULL, COLD, GORE, HONEY } = F.ramps, tint = F.ramps.of;
  const AMB = { dusk: [.86, .6, .56], night: [.24, .29, .5] }, FIRE = { x: 912, y: 523, rad: 170, col: [1, .6, .24] }, frozen = Q.has('fxt');
  const NAMES = { fx: 'World effects', fxfight: 'Combat effects', fxicons: 'Icon floaters' };
  const LOOP = 'floaters loop here · in game each plays once, when the condition starts';
  let cv = null, g = null, raf = 0, S = null, gen = 0, mkey = '', MUL = [], clock = +Q.get('fxt') || 0, last = 0, slow = false, nopins = Q.get('fxn') === '0', shut = Q.get('fxk') === '0', zoom = Q.has('fxz') ? +Q.get('fxz') : null, base = null, words = Q.get('fxw') === '1';

  function grade() {
    const a = HUD.amb, n = a.night, d = clamp(a.warm * 1.35, 0, 1), key = n.toFixed(2) + '|' + d.toFixed(2);
    if (key === mkey) return;
    mkey = key; gen++;
    MUL = Array.from({ length: 8 }, (_, lv) => [0, 1, 2].map(i => {
      const q = lv / 7 * FIRE.col[i], at = (amb, lk) => Math.min(1.5, amb + q * lk);
      return n * at(AMB.night[i], 1) + (1 - n) * (d * at(AMB.dusk[i], .6) + (1 - d) * at(1, .22));
    }));
  }
  const bake = (s, m, crop) => {
    const b = crop ? F.box(s) : [0, 0, s.w - 1, s.h - 1], w = b[2] - b[0] + 1, h = b[3] - b[1] + 1, c = A.mk(w, h), cg = c.getContext('2d'), im = cg.createImageData(w, h), d = im.data;
    for (let y = 0, p = 0; y < h; y++) for (let x = 0; x < w; x++, p += 4) {
      const i = (y + b[1]) * s.w + x + b[0], col = s.c[i];
      if (!col) continue;
      const k = s.e[i] / 255;
      for (let j = 0; j < 3; j++) d[p + j] = Math.min(255, col[j] * (k + m[j] * (1 - k)));
      d[p + 3] = 255;
    }
    cg.putImageData(im, 0, 0);
    return c;
  };
  const tex = (s, lv) => { const c = s.fx && s.fx.gen === gen ? s.fx : (s.fx = { gen, lv: [] }); return c.lv[lv || 0] || (c.lv[lv || 0] = bake(s, MUL[lv || 0])); };
  const lvAt = (x, y) => { const d = Math.hypot(x - FIRE.x, (y - FIRE.y) * 1.25) / FIRE.rad; return d >= 1 ? 0 : Math.min(7, Math.round((1 - d) * (1 - d) * 7)); };
  const put = (s, x, y, lv) => g.drawImage(tex(s, lv), Math.round(x) - s.ax, Math.round(y) - s.ay);
  const veil = (s, x, y, a) => { g.globalAlpha = a; put(s, x, y); g.globalAlpha = 1; };
  const css = (c, e, lv) => { const m = MUL[lv || 0], k = (e || 0) / 255; return `rgb(${c.map((v, i) => Math.min(255, Math.round(v * (k + m[i] * (1 - k))))).join(' ')})`; };
  const frac = (t, per, ph) => { const v = t / per + (ph || 0); return v - Math.floor(v); };
  const age = (t, per, at) => frac(t, per, -at / per) * per;
  const shades = {};
  const shadow = sh => shades[sh.rx + '|' + sh.ry] || (shades[sh.rx + '|' + sh.ry] = A.paint(Math.ceil(sh.rx) * 2 + 2, Math.ceil(sh.ry) * 2 + 2, (x, y) => {
    const nx = (x - sh.rx - 1) / sh.rx, ny = (y - sh.ry - 1) / sh.ry, q = nx * nx + ny * ny;
    return q < 1 && clamp((1 - q) * 3.2, 0, 1) > dith(x, y) * .7 + .15 ? [5, 4, 10, 97] : null;
  }));

  function stage(name) {
    const st = {
      name, skin: HUD.state.skin, things: [], over: [], keys: [], pins: [], cast: [],
      thing(y, fn) { st.things.push({ y, fn }); },
      top(fn) { st.over.push(fn); },
      baked(spr, x, y) { return { x, y, spr, head: y - F.rise(spr), lv: lvAt(x, y - 12) }; },
      actor(spr, x, y, o) {
        const a = st.baked(spr, x, y), l = o && o.lunge;
        if (spr.sh) st.cast.push([shadow(spr.sh), Math.round(x + spr.sh.dx - spr.sh.rx - 1), Math.round(y + spr.sh.dy - spr.sh.ry - 1)]);
        st.thing(y, t => {
          const u = l ? age(t, l.per, l.at) : 1, k = u < .26 ? Math.sin(u / .26 * Math.PI) * 7 : 0;
          put(spr, x + (l ? l.dx * k : 0), y + (l ? l.dy * k : 0), a.lv);
        });
        return a;
      },
      key(label, x, y, spr) { st.keys.push({ label, spr }); st.pins.push([st.keys.length, x, y]); return st.keys.length; },
      pin(n, x, y) { st.pins.push([n, x, y]); }
    };
    return st;
  }

  const E = {
    bar(st, x, y, v, ramp, o) { const s = F.bar(24, v, ramp, o); st.top(() => put(s, x, y)); return s; },
    sleep(st, x, y) { st.top(t => { for (let i = 2; i >= 0; i--) { const f = frac(t, 2.1, -i / 3); put(F.zed[f < .3 ? 0 : f < .58 ? 1 : f < .82 ? 2 : 3], x + 3 + f * 13 + Math.sin(f * 6.283) * 2, y - f * 30); } }); },
    rest(st, x, y) { st.top(t => { for (let i = 0; i < 3; i++) { const f = frac(t, 2.1, -i / 3); put(F.cross[f < .2 ? 0 : f < .5 ? 1 : f < .8 ? 2 : 3], x + (i - 1) * 9 + Math.sin(f * 6.283 + i * 2) * 1.5, y - f * 28); } }); },
    reel(st, x, y) { st.top(t => { for (const a of [0, 1, 2].map(i => t * 3.6 + i * 2.094).sort((p, q) => Math.sin(p) - Math.sin(q))) { const z = Math.sin(a); put(F.star[z > .4 ? 2 : z < -.4 ? 0 : 1], x + Math.cos(a) * 11, y + z * 4); } }); },
    pant(st, kind, a) {
      const [mx, my] = F.mouth(kind), B = F.breath, at = [.16, .32, .48, .64, .78, .9, 1], per = .4, life = .7;
      st.top(t => {
        for (let i = 0; i < 2; i++) {
          const n = Math.floor(t / per) - i, u = (t - n * per) / life;
          if (u < 0 || u >= 1) continue;
          const f = B[at.findIndex(v => u < v)];
          put(f, a.x + mx + f.ax - (f.w >> 1) - u * 15, a.y + my + (f.h >> 1) + Math.sin(u * 2.4) * 1.5 - u * u * 3 + (n & 1), a.lv);
        }
      });
    },
    badge(st, x, y, pair, o) {
      st.top(t => {
        const u = age(t, o.per, o.at);
        if (u > o.ttl) return;
        const f = u / o.ttl, dy = f < .12 ? mix(8, -3, 1 - (1 - f / .12) ** 2) : f < .78 ? mix(-3, -9, (f - .12) / .66) : mix(-9, -15, (f - .78) / .22);
        put(pair[f < .04 || f > .8 ? 1 : 0], x, y + dy);
      });
    },
    coin(st, x, y) { st.top(t => { const f = frac(t, 2.6); put(F.coin[f < .18 ? [1, 2, 3, 0][Math.floor(f / .045)] : 0], x, y + Math.round(Math.sin(t * 3.9) * 2)); }); },
    float(st, x, y, pair, o) {
      st.top(t => {
        const u = age(t, o.per, o.at), ttl = o.ttl || .9;
        if (u > ttl) return;
        const f = u / ttl, dy = f < .7 ? mix(3, -26, f / .7) : mix(-26, -38, (f - .7) / .3);
        put(pair[f < .07 || f > .84 ? 1 : 0], x + (o.shake && u < .14 ? (Math.floor(u * 50) & 1 ? 1 : -1) : 0), y + dy);
      });
      return pair[0];
    },
    say(st, x, y, text, tail, o) {
      const b = F.bubble(text, st.skin, tail);
      st.top(t => {
        const u = age(t, o.per, o.at), f = u / 4.5;
        if (f > 1) return;
        const i = f < .04 || f > .9 ? 1 : 0, yy = y + Math.round(f < .8 ? mix(2, -8, f / .8) : mix(-8, -12, (f - .8) / .2));
        veil(b.plate[i], x, yy, b.alpha); put(b.frame[i], x, yy);
      });
      return b.frame[0];
    },
    shot(st, kind, hit, a, b, o) {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), dur = clamp(Math.hypot(b[0] - a[0], b[1] - a[1]) / 32 * .13, .6, 2.3);
      st.top(t => {
        const u = age(t, o.per, o.at);
        if (u < dur) { put(F.shot(kind, ang, Math.floor(t * 24) % 3), mix(a[0], b[0], u / dur), mix(a[1], b[1], u / dur)); return; }
        if (o.on && u < dur + 1.6) STATUS[o.fx](t, u - dur, o.on);
        if (u < dur + .24) put(F.hit(hit)[Math.min(2, Math.floor((u - dur) / .08))], b[0], b[1]);
      });
    },
    route(st, from, stops, col, o) {
      const pts = [from];
      for (const b of stops) { const a = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.min(Math.abs(dx), Math.abs(dy)); if (d > 0 && d < Math.max(Math.abs(dx), Math.abs(dy))) pts.push([a[0] + Math.sign(dx) * d, a[1] + Math.sign(dy) * d]); pts.push(b); }
      E.path(st, pts, col);
      const last = stops.length - 1;
      stops.forEach((p, i) => { if (i < last) st.top(() => put(F.ring(5, 3, col), p[0], p[1])); });
      if (!(o && o.attack)) st.top(() => put(F.ring(9, 4, col), stops[last][0], stops[last][1]));
    },
    path(st, pts, col) {
      const seg = pts.slice(1).map((p, i) => ({ a: pts[i], b: p, len: Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]) })), total = seg.reduce((n, s) => n + s.len, 0);
      st.top(t => {
        const dots = [];
        for (let d = (t * 14) % 8 + 6; d < total - 5; d += 8) { let r = d, s = seg[0]; for (s of seg) { if (r <= s.len) break; r -= s.len; } dots.push([Math.round(mix(s.a[0], s.b[0], r / s.len)), Math.round(mix(s.a[1], s.b[1], r / s.len))]); }
        g.fillStyle = css(P.ink, 0); for (const [x, y] of dots) g.fillRect(x - 2, y - 2, 4, 4);
        g.fillStyle = css(col[4], 190); for (const [x, y] of dots) g.fillRect(x - 1, y - 1, 2, 2);
        g.fillStyle = css(col[5], 190); for (const [x, y] of dots) g.fillRect(x - 1, y - 1, 1, 1);
      });
    },
    brackets(st, bx, col) {
      st.top(t => {
        const p = Math.floor(t * 2.5) & 1, x0 = bx[0] + p, y0 = bx[1] + p, x1 = bx[2] - p, y1 = bx[3] - p;
        for (const [c, o] of [[css(P.ink, 0), 1], [css(col[4], 190), 0]]) { g.fillStyle = c; for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { g.fillRect(Math.min(x, x + sx * 6) + o, Math.min(y, y + sy) + o, 7, 2); g.fillRect(Math.min(x, x + sx) + o, Math.min(y, y + sy * 6) + o, 2, 7); } }
      });
    },
  };
  const STATUS = {
    burn(t, v, a) {
      const k = v / 1.6, b = F.box(a.spr), top = a.y - a.spr.ay + b[1], ht = b[3] - b[1], fr = Math.floor(t * 10);
      if (k < .75) put(F.tint(a.spr, 'burn', fr & 1 ? .55 : .72), a.x, a.y);
      [[-4, .45], [3, .2], [6, .7]].forEach(([dx, dy], i) => put(F.lick[k > .8 ? 3 : (fr + i) % 3], a.x + dx, top + dy * ht + 4));
      for (let i = 0; i < 3; i++) { const f = frac(t, .9, i / 3); put(F.dot(P.fire[f < .4 ? 3 : 1], 255), a.x + (i - 1) * 4 + Math.sin(f * 7 + i) * 2, top - f * 14); }
    },
    frost(t, v, a) {
      const k = v / 1.6, b = F.box(a.spr), top = a.y - a.spr.ay + b[1], ht = b[3] - b[1];
      put(F.tint(a.spr, 'frost', [0, .25, .5, .75][Math.min(3, Math.floor(k * 4))]), a.x, a.y);
      [[-5, .3], [5, .55], [0, .85]].forEach(([dx, dy], i) => { const f = frac(t, .8, i * .37); if (f < .5 && k < .85) put(F.glint[f < .25 ? 0 : 1], a.x + dx, top + dy * ht + 2); });
    },
    shock(t, v, a) {
      if (v > 1) return;
      const b = F.box(a.spr), top = a.y - a.spr.ay + b[1], ht = b[3] - b[1], fr = Math.floor(t * 18);
      if (fr & 1) put(F.tint(a.spr, 'shock', v > .6 ? .5 : 0), a.x, a.y);
      [[-7, .35], [7, .6]].forEach(([dx, dy], i) => { if ((fr + i) % 3) put(F.arc[(fr + i * 2) % 4], a.x + dx, top + dy * ht + 6); });
    }
  };
  const word = (text, ramp, o) => F.word(text, ramp, o);

  function colony(st, icons) {
    const key = icons ? () => 0 : st.key, pin = icons ? () => 0 : st.pin;
    const ring = $('marks').querySelector('.pawnring'), gx = ring ? parseInt(ring.style.left, 10) + 15 : 496, gy = ring ? parseInt(ring.style.top, 10) + 7 : 475;
    const greta = st.baked(pawn('woodcutter'), gx, gy), hauler = st.baked(pawn('watch'), 680, 507), cook = st.baked(pawn('cook'), 884, 507), trader = st.baked(pawn('trader', 1), 1076, 539), fire = build('campfire');
    key('Work progress', greta.x + 22, greta.head - 6, E.bar(st, greta.x, greta.head - 4, .62, HONEY, { pegs: 1 }));
    const bed = st.actor(F.lying('mender', F.folk('mender', { race: 'human', tunic: P.cloth, hair: P.fallOrange, longhair: 1, seed: 22 }), P.green), 640, 578);
    const tender = st.actor(F.folk('tender', { race: 'human', tunic: P.green, pants: P.cloth, hair: P.furDark, bun: 1, seed: 31 }), 684, 572);
    E.bar(st, tender.x, tender.head - 4, .4, HONEY, { pegs: 1 }); pin(1, tender.x + 22, tender.head - 6);
    key('Health', bed.x + 24, bed.y - 34, E.bar(st, bed.x, bed.y - 32, .55, RAMP.leaf));
    E.rest(st, bed.x - 2, bed.y - 40); key('Resting', bed.x - 26, bed.y - 52, F.cross[2]);
    const nap = st.actor(F.lying('sleeper', F.folk('sleeper', { race: 'human', tunic: P.blue, hair: P.furDark, seed: 21 }), P.red), 1004, 594);
    E.sleep(st, nap.x - 14, nap.y - 26); key('Sleeping', nap.x + 18, nap.y - 46, F.zed[2]);
    const vex = st.actor(F.lying('vex', F.folk('vex', { race: 'human', tunic: P.leather, hair: P.hay, seed: 23 })), 800, 834);
    E.reel(st, vex.x - 14, vex.y - 30); E.bar(st, vex.x + 14, vex.y - 30, .22, RAMP.leaf); pin(2, vex.x + 36, vex.y - 32);
    key('Collapsed', vex.x - 36, vex.y - 32, F.star[2]);
    E.pant(st, 'watch', hauler); key('Winded', hauler.x - 20, hauler.head + 24, F.breath[4]);
    st.thing(535.5, t => put(fire.frames[Math.floor(t * 6) % fire.frames.length], 912, 535, 7));
    E.coin(st, trader.x, trader.head - 8); key('Trader', trader.x + 16, trader.head - 16, F.coin[0]);
    const hob = st.actor(pawn('farmer'), 846, 514);
    if (!icons) {
      E.say(st, hob.x - 2, hob.head - 5, 'Frost took the cabbages again.', -12, { per: 7, at: .4 }); key('Speech', hob.x - 20, hob.head + 22);
      E.say(st, cook.x + 2, cook.head - 5, 'Then it is turnip stew till spring.', 12, { per: 7, at: .9 });
      const n = key('Condition gained', vex.x + 54, vex.y - 60, E.float(st, vex.x + 4, vex.y - 38, word('Collapsed', tint('#e0452c'), { small: 1, icon: 'pip' }), { per: 3.2, at: .6, ttl: 1.4 }));
      E.float(st, hauler.x, hauler.head - 4, word('Winded', tint('#a98ae0'), { small: 1, icon: 'pip' }), { per: 3.2, at: .9, ttl: 1.4 }); pin(n, hauler.x - 46, hauler.head - 24);
    }
    const dozer = st.actor(F.down('wolfnap', beast('wolf'), 7), 905, 884), eater = st.actor(beast('wolf', 1), 1012, 892);
    st.actor(F.carcass, eater.x - 36, eater.y + 2);
    E.sleep(st, dozer.x + 14, dozer.head - 2); key('Sleeping creature', dozer.x - 12, dozer.head - 22, F.zed[2]);
    key('Feeding progress', eater.x + 24, eater.head - 2, E.bar(st, eater.x, eater.head - 4, .7, HONEY, { pegs: 1 }));
    if (!icons) return;
    const I = HUD.fxicons, over = a => [a.x, a.y - 34];
    const smith = st.baked(pawn('smith', 1), 980, 383), guard = st.baked(pawn('guard'), 592, 539), weaver = st.baked(pawn('weaver'), 724, 703), carrier = st.baked(pawn('hauler'), 816, 539), tiller = st.baked(pawn('farmer', 1), 1008, 827);
    const cast = {
      collapsed: [vex.x, vex.y - 20, 0], starving: [vex.x, vex.y - 20, 1], winded: [...over(hauler), 0], exhausted: [...over(hauler), 1], knocked: [...over(greta), 0], bleeding: [...over(greta), 1],
      fractured: [...over(guard), 1], poisoned: [...over(carrier), 0], sick: [bed.x, bed.y - 36, 0], healed: [bed.x, bed.y - 36, 1], burning: [...over(smith), 1], frozen: [...over(tiller), 0],
      moodbreak: [...over(weaver), 1], wellfed: [eater.x, eater.head - 10, 0], rested: [nap.x, nap.y - 24, 1]
    };
    st.table = I.list;
    I.list.forEach((c, i) => {
      const [x, y, late] = cast[c.id];
      E.badge(st, x, y, words ? I.worded(c.id) : I.icon(c.id), { per: 4.8, at: late ? 2.9 : .5, ttl: 1.7 });
      st.pin(i + 1, x + (late ? 16 : -16), y + 12);
    });
  }

  const STAGES = {
    fx: { cam: [800, 620], note: ' · ' + LOOP, build: st => colony(st, false) },
    fxicons: { cam: [800, 620], note: ' · ' + LOOP, build: st => colony(st, true) },
    fxfight: {
      cam: [640, 362],
      build(st) {
        const greta = st.baked(pawn('woodcutter'), 496, 475), owl = st.baked(beast('owlbear'), 464, 443), guard = st.baked(pawn('guard'), 592, 539), cook = st.baked(pawn('cook'), 884, 507), per = 3.6;
        const wolf = st.actor(beast('wolf', 1), 644, 568, { lunge: { dx: -1, dy: -.1, per, at: 2.08 } });
        const dwarf = st.actor(F.folk('axer', { race: 'dwarf', armor: P.iron, pants: P.furDark, hair: P.fallOrange, hat: 'helm', tool: 'axe', shield: P.blue, seed: 41 }).flip(), 702, 574, { lunge: { dx: -1, dy: 0, per, at: 1.9 } });
        st.key('Attack lunge', wolf.x - 16, wolf.y + 12);
        st.key('Health, colonist', guard.x - 22, guard.head - 2, E.bar(st, guard.x, guard.head - 4, .72, RAMP.leaf));
        st.key('Health, creature', wolf.x + 24, wolf.head - 2, E.bar(st, wolf.x, wolf.head - 4, .46, RAMP.blood));
        E.bar(st, owl.x, owl.head - 4, .64, RAMP.blood); E.bar(st, greta.x, greta.head - 4, .88, RAMP.leaf);
        st.key('Block, parry, dodge', guard.x - 44, guard.head - 26, E.float(st, guard.x - 6, guard.head - 8, word('BLOCK', COLD), { per: per * 3, at: 2.0 }));
        E.float(st, guard.x - 6, guard.head - 8, word('PARRY', COLD), { per: per * 3, at: 2 + per }); E.float(st, guard.x - 6, guard.head - 8, word('dodge', COLD), { per: per * 3, at: 2 + per * 2 });
        st.key('Damage', wolf.x + 30, wolf.head - 28, E.float(st, wolf.x + 4, wolf.head - 8, word('-7', HURT), { per, at: 1.98 }));
        st.key('Bleed', wolf.x + 20, wolf.y + 12, E.float(st, wolf.x + 4, wolf.head + 12, word('bleed', GORE, { icon: 'drop' }), { per, at: 1.98 }));
        E.route(st, [guard.x, guard.y - 4], [[owl.x + 6, owl.y - 4]], RAMP.vermilion, { attack: 1 });
        const ob = F.box(owl.spr), ox = owl.x - owl.spr.ax, oy = owl.y - owl.spr.ay;
        E.brackets(st, [ox + ob[0] - 3, oy + ob[1] - 3, ox + ob[2] + 3, oy + ob[3] + 3], RAMP.vermilion);
        st.key('Draft target, attack', owl.x - 52, owl.y - 2);
        st.key('Critical hit', owl.x - 52, owl.head - 30, E.float(st, owl.x, owl.head - 8, word('-21!', CRIT, { big: 1 }), { per: 4.4, at: 1.8, shake: 1 }));
        st.key('Fracture, organ hit', owl.x - 52, owl.head + 14, E.float(st, owl.x, owl.head + 30, word('Fractured!', tint('#ff9944')), { per: 8.8, at: 1.8 }));
        E.float(st, owl.x, owl.head + 30, word('Organ hit!', tint('#ff9944')), { per: 8.8, at: 6.2 });
        st.key('Knockdown, conditions', owl.x - 52, owl.head - 12, E.float(st, owl.x + 6, owl.head - 8, word('Knocked Down', tint('#ff6a3a'), { small: 1, icon: 'pip' }), { per: 4.4, at: 3.1, ttl: 1.3 }));
        E.float(st, wolf.x + 4, wolf.head - 8, word('Staggered', tint('#E08840'), { small: 1, icon: 'pip' }), { per, at: 3.0, ttl: .9 });
        E.route(st, [cook.x, cook.y - 2], [[852, 545], [904, 590], [1044, 590]], HONEY);
        st.key('Draft target, move', 1064, 578, F.ring(9, 4, HONEY)); st.key('Queued waypoint', 838, 562, F.ring(5, 3, HONEY));
        E.say(st, dwarf.x + 2, dwarf.head - 5, 'Back to your den, cur!', 10, { per: 7.2, at: 1 }); st.key('Battle cry', dwarf.x + 24, dwarf.head + 6);
        const bow = st.actor(pawn('hunter', 1), 900, 192), orc = st.actor(F.folk('thrower', { race: 'orc', tunic: P.leather, pants: P.furDark, sleeves: 0, mohawk: P.furDark, seed: 8 }).flip(), 872, 238), mage = st.actor(pawn('mage', 1), 920, 250);
        const gobs = [st.actor(pawn('goblin'), 704, 204), st.actor(pawn('goblin'), 742, 246), st.actor(pawn('gobboss'), 660, 248)], aim = a => [a.x, a.y - 14];
        st.key('Out of ammo', bow.x + 46, bow.head - 30, E.float(st, bow.x, bow.head - 8, word('No ammo', DULL), { per: 4.8, at: 1.7 }));
        const lanes = [['arrow', 'thud', bow, [496, 175], 'Arrow'], ['bolt', 'thud', bow, [624, 141], 'Bolt'], ['spear', 'thud', orc, [432, 205], 'Spear'], ['stone', 'dust', orc, [528, 239], 'Stone'], ['fireball', 'burst', mage, gobs[0], 'Fireball, burn', 'burn'], ['frostbolt', 'shatter', mage, gobs[1], 'Frostbolt, frost', 'frost'], ['spark', 'flash', mage, gobs[2], 'Spark, shock', 'shock']];
        for (const [kind, hit, from, foe, label, fx] of lanes) {
          const a = [from.x - 12, from.y - 22], to = fx ? aim(foe) : foe;
          E.shot(st, kind, hit, a, to, { per: 5.2, at: 2.05, fx, on: fx && foe });
          st.key(label, to[0] + 16, to[1] - 14, F.shot(kind, 0, 0)); st.keys[st.keys.length - 1].more = F.hit(hit)[1];
        }
      }
    }
  };

  function look() {
    const pin = zoom > 0 && S.pins.find(p => p[0] === zoom), c = pin ? [pin[1], pin[2]] : STAGES[S.name].cam, k = base.k * (zoom === null ? 1 : 2), v = HUD.view;
    const left = Math.round(clamp(v.W / 2 - c[0] * k, v.W - cv.width * k, 0)), top = Math.round(clamp(v.H / 2 - c[1] * k, v.H - cv.height * k, 0));
    $('world').style.transform = `translate(${left}px,${top}px) scale(${k})`;
    $('hud').querySelector('.fx-pins').innerHTML = S.pins.map(([n, x, y]) => `<i style="left:${Math.round(left + x * k)}px;top:${Math.round(top + y * k)}px">${n}</i>`).join('');
  }
  function legend(el) {
    const n = S.keys.length, T = S.table, half = T && Math.ceil(T.length / 2);
    const row = (c, i) => `<div class="fx-r" data-fx="${i + 1}"><em>${i + 1}</em><span></span><i></i><i></i><i></i></div>`, grid = list => `<div class="fx-grid"><b></b><b>Condition</b><b>Text</b><b>Icon</b><b>Icon + word</b>${list.join('')}</div>`;
    const rows = T ? T.map(row) : [], main = T ? `<div class="fx-tab">${grid(rows.slice(0, half))}${grid(rows.slice(half))}</div>` : `<ol style="--rows:${Math.ceil(n / (n > 12 ? 3 : 2))}">${S.keys.map((k, i) => `<li data-fx="${i + 1}"><span></span><i></i></li>`).join('')}</ol>`;
    el.innerHTML = `<header><b>${NAMES[S.name]}</b>${T ? '<button data-fx="words">Words</button>' : ''}<button data-fx="pins">Numbers</button><button data-fx="slow">Slow</button><button data-fx="zoom">2×</button><button data-fx="key">Key</button></header>${main}<p>mock data · invented names, lines and numbers${STAGES[S.name].note || ''} · a row looks closer</p>`;
    el.querySelectorAll('li').forEach((li, i) => {
      const k = S.keys[i];
      li.firstChild.textContent = k.label;
      for (const s of [k.spr, k.more]) if (s) { const c = bake(s, [1, 1, 1], true), z = c.width <= 22 && c.height <= 9 ? 2 : 1; c.style.width = c.width * z + 'px'; c.style.height = c.height * z + 'px'; li.lastChild.append(c); }
    });
    el.querySelectorAll('.fx-r').forEach((r, i) => {
      const c = T[i], I = HUD.fxicons;
      r.children[1].textContent = c.name;
      [I.text(c), I.icon(c.id), I.worded(c.id)].forEach((pair, j) => r.children[2 + j].append(bake(pair[0], [1, 1, 1], true)));
    });
  }
  function flags() {
    const hud = $('hud');
    hud.classList.toggle('fx-nopins', nopins); hud.classList.toggle('fx-shut', shut);
    hud.querySelectorAll('.fx-tab canvas').forEach(c => { const z = zoom === null ? 1 : 2; c.style.width = c.width * z + 'px'; c.style.height = c.height * z + 'px'; });
    hud.querySelectorAll('[data-fx]').forEach(b => { const f = b.dataset.fx; b.classList.toggle('on', f === 'words' ? words : f === 'slow' ? slow : f === 'pins' ? !nopins : f === 'key' ? !shut : f === 'zoom' ? zoom === 0 : zoom === +f); });
  }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(.1, (now - last) / 1000), hs = HUD.state;
    last = now;
    if (!frozen && !hs.paused) clock += dt * hs.speed * (slow ? .2 : 1);
    grade();
    g.clearRect(0, 0, cv.width, cv.height);
    for (const [c, x, y] of S.cast) g.drawImage(c, x, y);
    for (const th of S.things) th.fn(clock);
    for (const fn of S.over) fn(clock);
  }
  function sync() {
    const hud = $('hud'), el = hud.querySelector('.fx-key'), map = $('mapday');
    cancelAnimationFrame(raf);
    if (!el) { if (cv) cv.remove(); cv = S = null; return; }
    if (!cv) { cv = A.mk(map.width, map.height); cv.id = 'fxcv'; $('world').insertBefore(cv, $('marks')); g = cv.getContext('2d'); }
    mkey = ''; grade();
    S = stage(el.dataset.fxs);
    STAGES[S.name].build(S);
    S.things.sort((a, b) => a.y - b.y);
    base = { k: HUD.view.k };
    legend(el); look(); flags();
    last = performance.now(); raf = requestAnimationFrame(tick);
  }

  for (const n of Object.keys(STAGES)) HUD.WIN[n] = st => (st.wins.filter(w => STAGES[w]).pop() === n ? `<aside class="fx-key" data-fxs="${n}"></aside><div class="fx-pins"></div>` : '');
  HUD.WINS = Object.keys(HUD.WIN);
  const fill = HUD.fill;
  HUD.fill = (root, skin) => { fill(root, skin); sync(); };
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-fx]');
    if (!b) return;
    const f = b.dataset.fx;
    if (f === 'words') { words = !words; sync(); return; }
    if (f === 'slow') slow = !slow; else if (f === 'pins') nopins = !nopins; else if (f === 'key') shut = !shut; else { zoom = f === 'zoom' ? (zoom === null ? 0 : null) : zoom === +f ? null : +f; look(); }
    flags();
  });
})();
