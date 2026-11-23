'use strict';
(() => {
  const X = DBX, { C, MAT, tone, IC, lerp, frame, stroke, poly, qv, bez, arc, rough, sel, part, ball, glyphs, makers } = X.hd;
  const { rod, light, pebble } = X.hdWeapons, { rampFrom, chaikin } = X.hdGoods;
  const GK = ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst', 'citrine', 'moonstone'];
  const glowOf = c => [Math.min(1, c[0] / 255 + .2), Math.min(1, c[1] / 255 + .2), Math.min(1, c[2] / 255 + .2)];
  const shard = (s, base, len, w, ang, R2, o) => {
    o = o || {};
    const F = frame(base, [base[0] + Math.sin(ang), base[1] - Math.cos(ang)]), tip = len * .22;
    poly(s, F.pts([[0, -w, 'l'], [len - tip, -w, 'l'], [len, 0, 'r'], [len - tip, w, 'r'], [0, w, 'b']]), (x, y, D) => {
      const [q, r] = F.inv(x, y), top = q > len - tip - Math.abs(r) * .0;
      let L = r < -w * .34 ? .78 : r < w * .3 ? .56 : .32;
      if (q > len - tip) L = r < 0 ? .92 : .5;
      if (Math.abs(r + w * .34) < .5 || Math.abs(r - w * .3) < .5) L += .14;
      L += (q / len - .5) * .16;
      if (o.vein && Math.abs(noise(x * .3, y * .3, o.vein) - .5) < .04) { s.set(x, y, [255, 255, 255], 230); return null; }
      if (D.all < 1.1) L -= .1;
      return rp(R2, L, x, y, .15);
    }, { e: o.e || 0 });
  };
  const matrix = (s, y) => { for (const [x, rx, ry, sd] of [[22, 9, 5, 1], [36, 11, 6, 2], [46, 7, 4.6, 3]]) pebble(s, [x, y + (sd === 2 ? 1 : 0)], rx, ry, MAT.stone, sd); };
  const rawGem = (R2, o) => () => {
    o = o || {};
    const s = IC(), e = o.e || 0;
    part(s, t => matrix(t, 50));
    for (const [bx, len, w, an] of [[24, 20, 4.4, -.5], [42, 18, 4, .55], [36, 14, 3.4, .2], [32, 32, 6.4, -.08]]) part(s, t => shard(t, [bx, 49], len, w, an, R2, { e, vein: o.vein }));
    if (o.glow) light(s, [32, 32], o.glow, 26);
    return sel(s);
  };
  const CUTS = {
    ruby: (a) => [17 * Math.cos(a), 13 * Math.sin(a)], sapphire: a => { const c = Math.cos(a), s2 = Math.sin(a), k = Math.pow(Math.pow(Math.abs(c), 4) + Math.pow(Math.abs(s2), 4), -.25); return [15 * c * k, 15 * s2 * k]; },
    emerald: a => { const c = Math.cos(a), s2 = Math.sin(a), k = Math.min(1 / Math.max(Math.abs(c), 1e-6), 1.36 / Math.max(Math.abs(s2), 1e-6), 1.5); return [12 * c * k, 12 * s2 * k]; },
    topaz: a => { const s2 = Math.sin(a), k = s2 < 0 ? 1 + (-s2) * .5 : 1; return [13 * Math.cos(a), 13 * s2 * k + 3]; }, amethyst: a => [15 * Math.cos(a), 15 * Math.sin(a)],
    citrine: a => { const c = Math.cos(a); return [19 * c * (1 - Math.abs(Math.sin(a)) * .0), 10 * Math.sin(a) * (1 - c * c * .3)]; }, moonstone: a => [16 * Math.cos(a), 13 * Math.sin(a)],
  };
  const cutGem = (kind, R2, o) => () => {
    o = o || {};
    const s = IC(), f = CUTS[kind] || CUTS.amethyst, n = 16, cx = 32, cy = o.ring ? 31 : 33, e = o.e || 0, cab = kind === 'moonstone';
    const out = [], tab = [];
    for (let i = 0; i < n; i++) { const a = i / n * 6.2832 + .196, p = f(a); out.push([cx + p[0], cy + p[1]]); tab.push([cx + p[0] * .52, cy + p[1] * .52]); }
    if (o.ring) part(s, t => { stroke(t, arc(cx, cy, 24, 24, 0, 6.2832, 48), 1.3, (u, v, d, hw, x, y) => tone(MAT.gold, .6 - (x + y - 64) * .008 - v * .2, x, y)); for (let k = 0; k < 8; k++) { const a = k / 8 * 6.2832, p = [cx + Math.cos(a) * 24, cy + Math.sin(a) * 24]; t.set(p[0], p[1], [255, 255, 255], 230); } });
    part(s, t => {
      if (cab) { for (let y = cy - 14; y <= cy + 14; y++) for (let x = cx - 17; x <= cx + 17; x++) { const nx = (x + .5 - cx) / 16.5, ny = (y + .5 - cy) / 13.5, q = nx * nx + ny * ny; if (q > 1) continue; const nz = Math.sqrt(1 - q); let L = .46 + (nx * LV[0] + ny * LV[1] + nz * LV[2]) * .46 + Math.max(0, .3 - Math.hypot(nx - .2, ny - .15)) * .9; let c = rp(R2, L, x, y, .25); if (Math.hypot(nx - .2, ny - .15) < .34) c = [c[0] * .9, c[1] * .96 + 8, Math.min(255, c[2] + 26)]; if (Math.hypot(nx + .36, ny + .42) < .16) c = [255, 255, 255]; t.set(x, y, c, e); } return; }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = (i + .5) / n * 6.2832 + .196, l = Math.cos(a) * LV[0] + Math.sin(a) * LV[1], L0 = .5 + l * .44 + ((i & 1) ? .08 : -.08); poly(t, [[out[i][0], out[i][1], 'o'], [out[j][0], out[j][1], 'i'], [tab[j][0], tab[j][1], 'i'], [tab[i][0], tab[i][1], 'i']], (x, y, D) => rp(R2, L0 + (D.o < 1.2 ? -.12 : 0) + (D.all < .7 ? .12 : 0), x, y, .12), { e }); }
      poly(t, tab.map(p => [p[0], p[1], 'e']), (x, y, D) => { const d = (x - cx) * .7 + (y - cy); return rp(R2, .66 + (d < -2 ? .2 : d > 3 ? -.14 : 0) + (D.all < 1 ? .16 : 0), x, y, .12); }, { e });
      for (const [dx, dy] of [[-5, -4], [-4, -4], [-5, -3], [4, 3]]) t.set(cx + dx, cy + dy, [255, 255, 255], e ? 240 : 0);
    });
    if (o.core) part(s, t => { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [-3, 0], [0, 3], [0, -3]]) t.set(cx + dx, cy + dy, [255, 255, 255], 250); }, { line: 0 });
    if (o.glow) light(s, [cx, cy], o.glow, o.ring ? 30 : 22);
    return sel(s);
  };
  const bar = (s, x, y, L, h, m, o) => {
    o = o || {};
    const dx = 6, dy = 5, tex = (x2, y2, f) => { let k = 0; if (o.slag && hash(x2, y2, 7) > .9) k -= .26; if (o.rough) k += (noise(x2 * .5, y2 * .5, 4) - .5) * .34; if (o.fibre) k += (hash(y2 * 3 + (f ? 0 : x2), 2, 3) - .5) * .12; if (o.layers && f === 1 && (y2 - y) % 2 === 0) k -= .14; if (o.blister && noise(x2 * .6, y2 * .6, 6) > .72) k += .2; if (o.ripple) { const w = Math.sin((x2 + Math.sin(y2 * .9 + x2 * .2) * 2.4) * .8 + y2 * .5); k += w > .3 ? .16 : w < -.4 ? -.18 : 0; } return k; };
    poly(s, [[x + 2, y, 'top'], [x + L - 2, y, 'r'], [x + L, y + h, 'bot'], [x, y + h, 'l']], (x2, y2, D) => tone(m, .46 + tex(x2, y2, 1) - (D.bot < 1.2 ? .14 : 0) + (D.top < 1.2 ? .2 : 0) + (m.shine > .7 ? Math.max(0, Math.sin((x2 - y2) * .2 + x) - .75) * .7 : 0), x2, y2), { e: o.e });
    poly(s, [[x + 2, y, 'f'], [x + 2 + dx, y - dy, 'top'], [x + L - 2 + dx, y - dy, 'r'], [x + L - 2, y, 'f']], (x2, y2, D) => tone(m, .72 + tex(x2, y2, 0) + (D.top < 1.2 ? .14 : 0) - (D.f < 1 ? .08 : 0), x2, y2), { e: o.e });
    poly(s, [[x + L - 2, y, 'l'], [x + L - 2 + dx, y - dy, 'top'], [x + L + dx, y + h - dy, 'bot'], [x + L, y + h, 'bot']], (x2, y2, D) => tone(m, .28 + tex(x2, y2, 2) * .6, x2, y2), { e: o.e });
    if (o.stamp) for (const [ax, ay] of [[0, 0], [1, 0], [2, 0], [1, -1], [1, 1]]) s.set(x + (L >> 1) + 2 + ax, y - 2 + ay * .0 - (ay ? ay : 0), m.r[2]);
  };
  const ingots = (m, o) => () => {
    o = o || {};
    const s = IC();
    if (o.puck) { part(s, t => { for (let y = 26; y <= 50; y++) for (let x = 14; x <= 50; x++) { const nx = (x + .5 - 32) / 18, top = (y - 33) / 7, q = nx * nx + top * top; const inTop = q <= 1, inSide = Math.abs(nx) <= 1 && y > 33 && y < 43 + Math.sqrt(Math.max(0, 1 - nx * nx)) * 7; if (!inTop && !inSide) continue; t.set(x, y, inTop ? tone(m, .74 - nx * .16 + (Math.hypot(nx * 1.2, top) < .5 ? Math.sin(Math.hypot(nx, top) * 18) * .06 : 0) + (hash(x, y, 4) > .95 ? -.2 : 0), x, y) : tone(m, .44 - nx * .2, x, y)); } }); return sel(s); }
    const n = o.n || 3, L = o.len || 30, h = o.h || 8;
    if (n >= 3) { part(s, t => bar(t, 9, 40, L, h, m, o)); part(s, t => bar(t, 21, 43, L, h, m, o)); part(s, t => bar(t, 15, 28, L, h, m, Object.assign({ stamp: o.mark }, o))); }
    else { part(s, t => bar(t, 12, 38, L + 6, h + 2, m, Object.assign({ stamp: o.mark }, o))); }
    if (o.rune) { glyphs(s, [[22, 31], [38, 31]], 3); light(s, [32, 34], [.7, .6, 1], 26); }
    return sel(s);
  };
  const dust = R2 => () => {
    const s = IC();
    part(s, t => { for (let y = 40; y <= 56; y++) for (let x = 10; x <= 54; x++) { const nx = (x + .5 - 32) / 22, ny = (y + .5 - 48) / 8; if (nx * nx + ny * ny > 1) continue; t.set(x, y, rp(C.clay, nx * nx + ny * ny > .62 ? (ny < 0 ? .78 : .34) : .46 - nx * .12, x, y, .3)); } });
    part(s, t => { for (let y = 26; y <= 50; y++) for (let x = 14; x <= 50; x++) { const nx = (x + .5 - 32) / 16, hgt = 46 - (1 - nx * nx) * 17 + (noise(x * .4, 3, 2) - .5) * 3; if (Math.abs(nx) > 1 || y < hgt || y > 47 + Math.sqrt(1 - nx * nx) * 3.4) continue; const sp = hash(x, y, 5); t.set(x, y, sp > .9 ? [255, 255, 255] : rp(R2, .5 - nx * .2 - (y - hgt) * .012 + (sp - .5) * .3, x, y, .4), sp > .9 ? 240 : 110); } }, { line: 0 });
    light(s, [32, 38], glowOf(R2[5]), 26);
    return sel(s);
  };
  makers.push(o => {
    const id = o.id, R2 = o.color ? rampFrom(o.color) : null;
    if (o.group !== 'Material') return null;
    const gk = GK.find(k => id.includes(k));
    if (o.sub === 'Crystal') return rawGem(R2);
    if (o.sub === 'Gem') return cutGem(gk, R2);
    if (o.sub === 'Magic Gem') return cutGem(gk, R2, { e: 140, ring: 1, core: 1, glow: glowOf(hex(o.color)) });
    if (id === 'mana_crystal') return rawGem(R2, { e: 150, glow: [.7, .45, 1] });
    if (id === 'star_shard') return () => { const s = IC(), R3 = rampFrom('#b0bcf0'); part(s, t => { shard(t, [32, 54], 44, 7, .5, R3, { e: 170 }); }); part(s, t => { shard(t, [26, 52], 20, 4, -.5, R3, { e: 170 }); shard(t, [38, 50], 14, 3, 1.2, R3, { e: 170 }); }); part(s, t => { for (const [x, y] of [[45, 16], [18, 34], [50, 40]]) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) t.set(x + dx, y + dy, [255, 255, 255], 250); }, { line: 0 }); light(s, [36, 30], [.8, .85, 1], 34); return sel(s); };
    if (id === 'gem_dust') return dust(R2);
    if (/^infused_/.test(id)) return rawGem(R2, { e: 120, vein: 5, glow: glowOf(hex(o.color)) });
    if (/_bar$|wrought_iron|pig_iron/.test(id) || o.sub === 'Steel') {
      if (id === 'rebar') return null;
      const m = id === 'magic_alloy_bar' ? { r: rampFrom('#9C7CC0'), d: .3, n: .05, ns: .3, shine: 1 } : /gold/.test(id) ? MAT.gold : /silver/.test(id) ? MAT.silver : /copper/.test(id) ? Object.assign({}, MAT.copper, { pat: 0 }) : /tin/.test(id) ? MAT.tin : /bronze/.test(id) ? MAT.bronze : /lead/.test(id) ? MAT.lead : /steel/.test(id) ? MAT.steel : MAT.iron;
      if (id === 'crucible_steel') return ingots(MAT.steel, { puck: 1 });
      if (id === 'pattern_welded_steel') return ingots(MAT.steel, { n: 1, ripple: 1 });
      if (id === 'magic_alloy_bar') return ingots(m, { rune: 1, e: 60 });
      return ingots(/bloom|blister|shear|mild/.test(id) ? Object.assign({}, MAT.steel, { r: MAT.iron.r.map((c, i) => [(c[0] + MAT.steel.r[i][0]) / 2, (c[1] + MAT.steel.r[i][1]) / 2, (c[2] + MAT.steel.r[i][2]) / 2]), shine: .6 }) : m, { slag: id === 'iron_bar', rough: /pig_iron|bloom/.test(id), fibre: /wrought/.test(id), blister: /blister/.test(id), layers: /shear/.test(id), mark: /gold|silver/.test(id), n: /pig_iron/.test(id) ? 1 : 3 });
    }
    return null;
  });
})();
