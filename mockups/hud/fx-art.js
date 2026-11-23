'use strict';
(() => {
  const A = HUD.art, RAMP = A.RAMP, F = HUD.fxart = {}, memo = {};
  const keep = (k, make) => memo[k] || (memo[k] = make());
    const STAR = R('#5a1a0c #8c2c10 #c8442a #f07818 #fcc23a #fff0a0'), CROSS = R('#4a1410 #741c14 #a02a18 #d04a30 #f08060 #ffc0a0'), SLEEP = R('#1c2a44 #2c4466 #46688c #7ea4c4 #b4d4ea #e6f4fa');
  const HURT = R('#4a1410 #7c1c16 #b02c20 #e0503a #ff8a70 #ffc8b0'), CRIT = R('#5a1a0c #a02a18 #e0541e #f6a23c #ffd870 #fff6c0'), DULL = R('#2c2b2e #56544e #8a8678 #b8b2a0 #d8d2bc #f0ead8');
  const COLD = R('#12264a #1c3c6c #3c6ea4 #6ea6d8 #a4d4f2 #e0f2fc'), GORE = R('#2c0a0c #5e1216 #8e1c1c #c02c26 #e85040 #ff9478'), HONEY = R('#4a3408 #76540e #b0841a #e0b030 #f8d860 #fff2a8');
  const ramp3 = h => { const c = hex(h); return [dark(c, .34), dark(c, .5), dark(c, .72), c, lit(c, 1.22), lit(c, 1.5)]; };
  F.ramps = { HURT, CRIT, DULL, COLD, GORE, HONEY, of: ramp3 };

  const copy = s => { const c = new Spr(s.w, s.h, s.ax, s.ay); c.c = s.c.slice(); c.e = s.e.slice(); c.sh = s.sh; return c; };
  const melt = (s, amt) => { const c = copy(s); for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (dith(x, y) < amt) c.c[y * s.w + x] = null; return c; };
  const box = s => { let x0 = s.w, y0 = s.h, x1 = 0, y1 = 0; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.c[y * s.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
  F.melt = melt; F.box = box;
  F.rise = s => s.ay - box(s)[1];

  const shade = (rows, ramp, o) => {
    o = o || {};
    const h = rows.length, w = rows[0].length, s = new Spr(w + 2, h + 2, (w >> 1) + 1, h + 1), n = ramp.length - 1, e = o.e === undefined ? 150 : o.e;
    const on = (x, y) => y >= 0 && y < h && x >= 0 && x < w && rows[y][x] === '#';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      const hi = !on(x, y - 1) || !on(x - 1, y), lo = !on(x, y + 1) || !on(x + 1, y);
      s.set(x + 1, y + 1, ramp[clamp(o.grad ? n - Math.floor(y * 3 / h) : n - 1 + (hi && !lo ? 1 : 0) - (lo && !hi ? 2 : 0), 0, n)], e);
    }
    return o.line === null ? s : s.outline(o.line);
  };

  const FONT = HUD.fxfont;
  const glyph = (font, ch, tall) => {
    const g = font[ch] || font[ch.toUpperCase()] || font['?'];
    if (!tall) return g;
    const d = /[a-z]/.test(ch) ? [1, 3] : [1, 4];
    return g.flatMap((r, i) => (d.includes(i) ? [r, r] : [r]));
  };
  const zoom = (g, k) => (k > 1 ? g.flatMap(r => Array(k).fill([...r].map(c => c.repeat(k)).join(''))) : g);
  const typeset = (text, font, o) => {
    const gs = [...text].map(ch => zoom(glyph(font, ch, o.tall), o.k || 1));
    return Array.from({ length: gs[0].length }, (_, y) => gs.map(g => g[y]).join('.'.repeat(o.gap)));
  };
  const advance = (text, font, gap) => [...text].reduce((n, ch) => n + (font[ch] || font['?'])[0].length + gap, -gap);
  const trim = rows => {
    const used = rows.map(r => r.includes('#')), y0 = used.indexOf(true), y1 = used.lastIndexOf(true);
    if (y0 < 0) return ['.'];
    let x0 = rows[0].length, x1 = 0;
    for (const r of rows) { const a = r.indexOf('#'); if (a >= 0) { x0 = Math.min(x0, a); x1 = Math.max(x1, r.lastIndexOf('#')); } }
    return rows.slice(y0, y1 + 1).map(r => r.slice(x0, x1 + 1));
  };
  const beside = (a, b, gap) => { const h = Math.max(a.length, b.length), pad = r => Array.from({ length: h - r.length }, () => '.'.repeat(r[0].length)).concat(r); const l = pad(a), r = pad(b); return l.map((row, i) => row + '.'.repeat(gap) + r[i]); };
  const DROP = ['..#..', '..#..', '.###.', '.###.', '#####', '#####', '.###.'], PIP = ['.#.', '###', '.#.'];
  F.word = (text, ramp, o) => keep('w' + text + ramp[3] + JSON.stringify(o || 0), () => {
    o = o || {};
    let rows = trim(o.big ? typeset(text, FONT.bold, { gap: 3, k: 2 }) : typeset(text, o.small ? FONT.thin : FONT.bold, { gap: 2, tall: 1 }));
    if (o.icon) rows = beside(o.icon === 'drop' ? DROP : PIP, rows, 3);
    const s = shade(rows, ramp, { e: o.e === undefined ? 170 : o.e, grad: o.small });
    return [s, melt(s, .5)];
  });

  const glyphs = (list, ramp, o) => list.map(r => shade(r, ramp, o));
  F.zed = keep('zed', () => { const z = glyphs([['#####', '...#.', '..#..', '.#...', '#####'], ['#######', '#######', '....##.', '...##..', '..##...', '#######', '#######'], ['#########', '#########', '......###', '.....###.', '...###...', '.###.....', '###......', '#########', '#########']], SLEEP, { e: 180 }); return [...z, melt(z[2], .5)]; });
  F.cross = keep('cross', () => { const c = glyphs([['.##.', '####', '####', '.##.'], ['..##..', '..##..', '######', '######', '..##..', '..##..'], ['...##...', '...##...', '...##...', '########', '########', '...##...', '...##...', '...##...']], CROSS, { e: 170 }); return [...c, melt(c[2], .5)]; });
  F.star = keep('star', () => glyphs([['.#.', '###', '.#.'], ['..#..', '..#..', '#####', '..#..', '..#..'], ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...']], STAR, { e: 210 }));

  F.dot = (c, e) => keep('d' + c + e, () => { const s = new Spr(1, 1, 0, 0); s.set(0, 0, c, e); return s; });

  F.tint = (spr, kind, amt) => {
    const memo = spr.tints || (spr.tints = {}), key = kind + amt;
    if (memo[key]) return memo[key];
    const ramp = kind === 'burn' ? P.fire : kind === 'frost' ? P.mana : GEM.star, n = ramp.length - 1, s = copy(spr);
    for (let i = 0; i < s.c.length; i++) {
      const c = s.c[i];
      if (!c) continue;
      const l = (c[0] * .3 + c[1] * .59 + c[2] * .11) / 255;
      s.c[i] = ramp[clamp(Math.round(l * n * 1.25 + (kind === 'frost' ? 1.4 : 1)), 0, n)];
      s.e[i] = kind === 'frost' ? 200 : 255;
    }
    s.sh = null;
    return memo[key] = amt ? melt(s, amt) : s;
  };
  F.lick = keep('lick', () => [0, 1, 2, 3].map(f => {
    const h = f === 3 ? 4 : 8 - f, s = new Spr(7, 9, 3, 8);
    for (let y = 0; y < h; y++) {
      const k = (y + 1) / h, half = Math.max(0, Math.round(Math.pow(k, .8) * 2.2 - (y === h - 1 ? .4 : 0))), cx = 3 + (y < h * .45 ? (f & 1 ? 1 : -1) * (y < h * .25 ? 1 : 0) : 0);
      for (let x = -half; x <= half; x++) s.set(cx + x, 8 - h + 1 + y, P.fire[Math.abs(x) === half ? 1 : k > .55 && Math.abs(x) < half - .5 ? 4 : 3], 255);
    }
    return s.outline(P.ember[1]);
  }));
  const MIST = R('#4e5c6e #7a8a9c #a8b8c8 #d2dee8 #eef4f8 #ffffff');
  F.breath = keep('breath', () => {
    const b = glyphs([['##', '##'], ['.##.', '####', '.##.'], ['.###.', '#####', '#####', '.##..'], ['..###..', '.######', '#######', '.#####.'], ['..##.##..', '.########', '#########', '.#######.']], MIST, { e: 215, line: MIST[1] });
    return [...b, melt(b[4], .45), melt(b[4], .75)];
  });
  F.glint = keep('glint', () => [['..#..', '.###.', '#####', '.###.', '..#..'], ['.#.', '###', '.#.']].map(r => shade(r, P.mana, { e: 230 })));
  F.arc = keep('arc', () => [0, 1, 2, 3].map(v => {
    const s = new Spr(13, 13, 6, 6), a = v * 1.57 + .5, c = Math.cos(a), sn = Math.sin(a);
    let pj = 0;
    for (let i = -5; i <= 5; i++) { const j = i === 5 ? 0 : Math.round((hash(i, v, 81) - .5) * 4); for (const q of [pj, j]) s.set(6 + c * i - sn * q, 6 + sn * i + c * q, GEM.star[i & 1 ? 5 : 4], 255); pj = j; }
    return s.outline(P.gold[0]);
  }));

  F.coin = keep('coin', () => [9, 7, 3, 7].map((w, i) => {
    const s = new Spr(11, 11, 5, 10);
    s.ball(5.5, 5.5, w / 2, 4.5, 0, P.gold, { d: .25, bias: .14, e: 130 });
    if (w > 5) { s.rect(4 + (i === 3 ? 1 : 0), 4, w > 7 ? 3 : 2, 3, P.gold[1], 130); s.set(4 + (i === 3 ? 1 : 0), 4, P.gold[0], 130); }
    else s.rect(5, 2, 1, 7, P.gold[4], 130);
    return s.outline();
  }));

  const VOID = [20, 15, 12], SLOT = [44, 33, 24];
  F.bar = (w, frac, ramp, o) => keep('bar' + w + Math.round(frac * 100) + ramp[2] + JSON.stringify(o || 0), () => {
    o = o || {};
    const h = 5, s = new Spr(w, h, w >> 1, h - 1), n = ramp.length - 1, iw = w - 2, fx = Math.round(iw * clamp(frac, 0, 1));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = y, b = h - 1 - y, i = x - 1;
      if (x === 0 || x === w - 1 || t === 0 || b === 0) { if (!((x === 0 || x === w - 1) && (t === 0 || b === 0))) s.set(x, y, P.ink); continue; }
      const fill = ramp[t === 1 ? n : b === 1 ? n - 3 : n - 1 - (hash(x >> 1, y, 5) > .86 ? 1 : 0)];
      if (o.pegs) s.set(x, y, i % 3 === 2 ? VOID : i < fx ? fill : SLOT, 170);
      else s.set(x, y, i < fx && !(i >= fx - 2 && dith(x, y) > (fx - i) / 2.5) ? fill : hash(x, y, 6) > .9 ? SLOT : VOID, 170);
    }
    return s;
  });

  F.shot = (kind, ang, v) => keep('s' + kind + Math.round(ang * 16 / Math.PI) + (kind === 'spark' ? v : ''), () => {
    const a = Math.round(ang * 16 / Math.PI) * Math.PI / 16, c = Math.cos(a), sn = Math.sin(a), s = new Spr(56, 56, 28, 28);
    const at = (i, j, col, e) => s.set(28 + c * i - sn * j, 28 + sn * i + c * j, col, e), rod = (i0, i1, col, e) => { for (let i = i0; i <= i1; i++) at(i, 0, col, e); };
    const streak = (i0, n, col, e) => { for (let k = 0; k < n; k++) at(i0 - k * 2 - (k > 2 ? k - 2 : 0), 0, col, e); };
    if (kind === 'arrow') { rod(-8, 4, P.wood[5]); rod(5, 7, P.iron[6]); at(5, 1, P.iron[4]); at(5, -1, P.iron[4]); for (const i of [-8, -7, -6]) { at(i, 1, P.cloth[5]); at(i, -1, P.red[3]); } s.outline(); streak(-12, 4, P.cloth[4], 60); }
    else if (kind === 'bolt') { rod(-4, 2, P.wood[3]); for (let i = -4; i <= 2; i++) at(i, 1, P.wood[1]); rod(3, 5, P.iron[6]); at(3, -1, P.iron[4]); at(3, 2, P.iron[3]); at(-4, -1, P.leather[5]); at(-4, 2, P.leather[4]); s.outline(); streak(-8, 4, P.iron[5], 60); }
    else if (kind === 'spear') { rod(-14, 8, P.wood[5]); for (let i = -14; i <= 8; i++) at(i, 1, P.wood[2]); at(8, 0, P.leather[4]); at(8, 1, P.leather[3]); for (let i = 9; i <= 14; i++) { at(i, 0, P.iron[6]); at(i, 1, P.iron[4]); if (i > 9 && i < 13) { at(i, -1, P.iron[5]); at(i, 2, P.iron[3]); } } s.outline(); streak(-18, 3, P.cloth[4], 60); }
    else if (kind === 'stone') { s.ball(28.5, 28.5, 3, 3, 0, P.rock, { d: .3, bias: .1 }); s.outline(); at(-6, 1, P.rockWarm[4], 40); at(-9, -1, P.rockWarm[3], 40); }
    else if (kind === 'fireball') {
      for (let i = -3; i >= -14; i--) { const w = i > -7 ? 2 : i > -11 ? 1 : 0; for (let j = -w; j <= w; j++) if (i > -6 || ((i + j) & 1)) at(i, j, P.fire[i > -6 ? 3 : i > -10 ? 2 : 1], 255); }
      s.ball(28.5, 28.5, 3.6, 3.6, 1, P.fire, { bias: .36, d: .3, e: 255 }); s.outline(P.ember[1]); at(-17, 2, P.fire[2], 255); at(-15, -3, P.fire[1], 255); at(-20, -1, P.fire[1], 255);
    } else if (kind === 'frostbolt') {
      for (let i = -5; i <= 6; i++) { at(i, 0, P.mana[i > 2 ? 5 : 4], 235); if (i > -3 && i < 5) { at(i, -1, P.mana[5], 235); at(i, 1, P.mana[2], 235); } }
      s.outline(P.frost[0]); at(-8, 1, P.mana[4], 235); at(-11, -1, P.mana[3], 235); at(-14, 0, P.mana[3], 235); at(-17, 1, P.mana[2], 235);
    } else {
      let px = -9, pj = 0;
      for (let k = 1; k <= 4; k++) { const nx = -9 + k * 4.2, nj = k === 4 ? 0 : (hash(k, v, 71) > .5 ? 1 : -1) * (1.5 + hash(k, v, 72) * 1.5); for (let q = 0; q <= 5; q++) at(mix(px, nx, q / 5), mix(pj, nj, q / 5), GEM.star[q & 1 ? 5 : 4], 255); px = nx; pj = nj; }
      at(8, 0, GEM.star[5], 255); at(9, 0, GEM.star[5], 255); s.outline(P.gold[0]);
    }
    return s;
  });
  F.hit = kind => keep('h' + kind, () => [0, 1, 2].map(f => {
    const s = new Spr(30, 30, 15, 15), ray = (n, r0, r1, col, e, off) => { for (let k = 0; k < n; k++) { const a = k / n * 6.283 + (off || 0); for (let r = r0; r <= r1; r++) s.set(15 + Math.cos(a) * r, 15 + Math.sin(a) * r, col, e); } };
    if (kind === 'thud') { if (f === 0) { ray(4, 0, 3, P.cloth[5], 220); s.outline(); } else ray(6, f * 3, f * 3 + 1, f === 1 ? P.bone[5] : P.bone[3], 120, .4); }
    else if (kind === 'dust') { s.ball(15.5, 15.5, 2.4 + f * 2, 1.8 + f * 1.4, 0, P.rockWarm, { n: .6, ns: .7, d: .5, bias: .16 }); if (f === 2) for (let i = 0; i < s.c.length; i++) if (dith(i % 30, (i / 30) | 0) < .5) s.c[i] = null; }
    else if (kind === 'burst') { if (f === 0) { s.ball(15.5, 15.5, 4, 4, 0, P.fire, { bias: .4, d: .3, e: 255 }); s.outline(P.ember[1]); } else { ray(12, f * 3 + 1, f * 3 + 2, P.fire[f === 1 ? 3 : 2], 255, .2); ray(6, f * 2, f * 2 + 1, P.fire[f === 1 ? 4 : 1], 255); if (f === 1) s.outline(P.ember[1]); } }
    else if (kind === 'shatter') { if (f === 0) { ray(6, 0, 3, P.mana[5], 235); s.outline(P.frost[0]); } else { ray(6, f * 3, f * 3 + 2, P.mana[f === 1 ? 4 : 3], 235); ray(6, f * 2, f * 2 + 1, P.mana[2], 235, .52); } }
    else { if (f === 0) { ray(4, 0, 4, GEM.star[5], 255, .78); ray(4, 0, 2, GEM.star[4], 255); s.outline(P.gold[0]); } else ray(8, f * 4, f * 4 + 2, GEM.star[f === 1 ? 4 : 3], 255, .2); }
    return s;
  }));

  F.ring = (rx, ry, ramp) => keep('ring' + rx + ramp[2], () => {
    const w = rx * 2 + 5, h = ry * 2 + 5, s = new Spr(w, h, w >> 1, h >> 1);
    for (let k = 0; k < 96; k++) { const a = k / 96 * 6.283; s.set(w / 2 - .5 + Math.cos(a) * rx, h / 2 - .5 + Math.sin(a) * ry, ramp[Math.sin(a) < 0 ? 3 : 4], 190); }
    return s.outline();
  });

  F.bubble = (text, skin, tail) => keep('bub' + skin + text + tail, () => {
    const T = FONT.thin, lines = []; let cur = '';
    for (const w of text.split(' ')) { const t = cur ? cur + ' ' + w : w; if (cur && advance(t, T, 2) > 150) { lines.push(cur); cur = w; } else cur = t; }
    lines.push(cur);
    const lr = lines.map(l => typeset(l, T, { gap: 2, tall: 1 })), tw = Math.max(...lr.map(r => r[0].length)), LH = 13;
    const w = tw + 12, bh = lines.length * LH + 6, tx = clamp(tail === undefined ? w >> 1 : tail < 0 ? w + tail : tail, 7, w - 8);
    const plate = new Spr(w, bh + 5, tx, bh + 4), frame = new Spr(w, bh + 5, tx, bh + 4);
    const V = skin === 'vellum', line = V ? RAMP.inkwash[1] : P.ink, ink = V ? RAMP.inkwash[0] : hex('#f6e6be'), rim = V ? RAMP.vellum[6] : RAMP.beam[5];
    const fill = (x, y, low) => V ? rp(RAMP.vellum, .82 + (fbm(x * .08, y * .08, 7, 2) - .5) * .3 - (low ? .22 : 0), x, y, .8) : rp(RAMP.oakDark, .56 + (fbm(x * .05, y * .4, 9, 2) - .5) * .5 - (low ? .2 : 0), x, y, .8);
    const halo = V ? RAMP.vellum[6] : RAMP.oakDark[1];
    for (let y = 0; y < bh; y++) for (let x = 0; x < w; x++) {
      const l = x, r = w - 1 - x, t = y, b = bh - 1 - y, d = Math.min(l, r, t, b), cx = Math.min(l, r), cy = Math.min(t, b);
      if (cx + cy < 2) continue;
      if (d === 0 || cx + cy === 2) frame.set(x, y, line, 160);
      else if (d === 1 && (t === 1 || l === 1)) frame.set(x, y, rim, 160);
      else plate.set(x, y, fill(x, y, b === 1 || r === 1), 160);
    }
    for (let j = 0; j < 5; j++) for (let i = -(4 - j); i <= 4 - j; i++) {
      if (Math.abs(i) === 4 - j) frame.set(tx + i, bh - 1 + j, line, 160);
      else { plate.set(tx + i, bh - 1 + j, fill(tx + i, bh - 1 + j, i > 0), 160); frame.c[(bh - 1 + j) * w + tx + i] = null; }
    }
    const on = (rows, x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && rows[y][x] === '#';
    lr.forEach((rows, li) => {
      const ox = 6, oy = 4 + li * LH;
      for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= rows[0].length; x++) {
        if (on(rows, x, y)) frame.set(ox + x, oy + y, ink, 200);
        else if ([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].some(([a, b]) => on(rows, x + a, y + b))) frame.set(ox + x, oy + y, halo, 160);
      }
    });
    return { alpha: V ? .8 : .72, plate: [plate, melt(plate, .5)], frame: [frame, melt(frame, .5)] };
  });

  const lie = (src, flip) => {
    const [x0, y0, x1, y1] = box(src), w = y1 - y0 + 1, h = x1 - x0 + 1, s = new Spr(w, h, w >> 1, h - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * src.w + x; if (src.c[i]) s.set(y - y0, flip ? x1 - x : x - x0, src.c[i], src.e[i]); }
    return s;
  };
  F.folk = (key, o) => keep('folk' + key, () => mkPawn(o));
  F.lying = (key, src, roll) => keep('lie' + key, () => {
    const p = lie(src, !roll), w = p.w + 8, h = p.h + 6, s = new Spr(w, h, w >> 1, h - 2);
    if (roll) { s.fill(1, 4, w - 2, p.h + 1, M.weave(P.leather, 2)); s.fill(3, 6, 8, p.h - 4, (x, y, i, j) => P.cloth[i === 0 || j === 0 ? 5 : 4]); }
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.c[y * p.w + x]) s.set(x + 4, y + 2, p.c[y * p.w + x], p.e[y * p.w + x]);
    if (roll) { const tex = M.cloth(roll, roll.length - 3, 5); s.fill(17, 4, w - 20, p.h, (x, y, i, j) => (j === 0 ? lit(tex(x, y), 1.2) : i === 0 ? dark(tex(x, y), .7) : tex(x, y))); }
    s.outline(); s.sh = { rx: (w >> 1) + 2, ry: 5, dx: 3, dy: 0 };
    return s;
  });
  F.down = (key, src, cut) => keep('down' + key, () => {
    const s = copy(src);
    for (let y = s.ay - cut + 1; y < s.h; y++) for (let x = 0; x < s.w; x++) s.c[y * s.w + x] = null;
    s.ay -= cut; s.outline(); s.sh = src.sh;
    return s;
  });
  F.carcass = keep('carcass', () => {
    const s = new Spr(34, 18, 17, 15);
    s.ball(17, 10, 12, 5, 0, P.furTan, { n: .4, ns: .8, d: .2 }).ball(27, 11, 4, 3, 1, P.furTan, { d: .2 });
    for (let i = 0; i < 5; i++) { s.rect(11 + i * 3, 6, 1, 6, P.bone[5]); s.rect(12 + i * 3, 7, 2, 5, P.red[i & 1 ? 1 : 2]); }
    s.rect(3, 12, 6, 1, P.bone[4]); s.rect(24, 14, 5, 1, P.bone[4]);
    s.outline(); s.sh = { rx: 15, ry: 4, dx: 2, dy: 0 };
    return s;
  });
})();
