'use strict';
(() => {
  const X = DBX, { C, MAT, matOf, tone, IC, lerp, frame, stroke, poly, qv, bez, arc, rough, sel, part, haft, cordC, strand, metalFace, blade, ball, glyphs, makers } = X.hd;
  const { blob } = X.hdTools, { rod, gem, light } = X.hdWeapons, { rrect, skin, bulge, strap, buckle, rivet, weaveC } = X.hdGear, { FUR, spOf, rampFrom, chaikin, boneC } = X.hdGoods;
  const CL = {
    linen: C.cloth, quilt: R('#3e3a2c #5a543e #787054 #968c6c #b4a888 #cec4a4 #e2dabe #f2ecd8'), sack: R('#3a2c18 #524022 #6c5630 #866e40 #a08854 #b8a26c #ceba88'),
    wool: R('#262a22 #3a4032 #525a46 #6c765c #889274 #a4ae90 #c0c8ae'), silk: R('#4a3a5a #66527a #84709a #a290b6 #c0b2d0 #dcd2e6 #f2ecf6'), rune: R('#0e1630 #16264e #223a72 #325496 #4c74b6 #7098d0 #9cbee6'),
    arcane: R('#1e0e30 #32184e #4a2670 #663a92 #8456b0 #a47aca #c6a4e2'), regal: C.red, soot: C.black, bark: C.bark, ermine: R('#6a6a62 #8e8e84 #b2b2a6 #d2d2c8 #eaeae2 #fafaf6'),
  };
  const styleOf = o => {
    const id = o.id, m = matOf(o);
    if (/rune_woven/.test(id)) return { r: CL.rune, t: 'cloth', trim: MAT.gold, glyph: 1 };
    if (/arcane/.test(id)) return { r: CL.arcane, t: 'cloth', trim: MAT.gold, glyph: 1 };
    if (/regal/.test(id)) return { r: CL.regal, t: 'cloth', trim: 'ermine' };
    if (/silk/.test(id)) return { r: CL.silk, t: 'cloth', trim: MAT.silver };
    if (/quilted|gambeson|arming/.test(id)) return { r: CL.quilt, t: 'quilt' };
    if (/linen/.test(id)) return { r: CL.linen, t: 'cloth' };
    if (/sackcloth/.test(id)) return { r: CL.sack, t: 'weave' };
    if (/wool/.test(id)) return { r: CL.wool, t: 'cloth' };
    if (/wicker|wattle/.test(id)) return { r: C.wicker, t: 'wicker' };
    if (/branch|bark/.test(id)) return { r: C.wood, t: 'sticks' };
    if (/great_bone|bone|skull/.test(id)) return { m: MAT.bone, r: C.bone, t: 'bone' };
    if (/croc/.test(id)) return { r: FUR.croc, t: 'scale' };
    if (/kobold_scale/.test(id)) return { m: MAT.rust, r: C.rust, t: 'scale' };
    if (/copper_scale/.test(id)) return { m: MAT.copper, r: C.copper, t: 'scale' };
    if (/lamellar|rune_stitched/.test(id)) return { m: MAT.steel, r: C.steel, t: 'lamellar', trim: MAT.gold, glyph: 1, lace: C.blue };
    if (/splint/.test(id)) return { m: MAT.iron, r: C.iron, t: 'splint' };
    if (/mail|ring_vest/.test(id)) return { m: /goblin/.test(id) ? MAT.rust : MAT.iron, r: C.iron, t: 'mail' };
    if (/rune_graven/.test(id)) return { m: MAT.alloy, r: C.alloy, t: 'plate', trim: MAT.gold, glyph: 1 };
    if (/ceremonial/.test(id)) return { m: MAT.steel, r: C.steel, t: 'plate', trim: MAT.gold, fancy: 1 };
    if (/orc/.test(id)) return { m: MAT.orc, r: C.orc, t: 'plate', crude: 1 };
    if (/goblin|scrap/.test(id)) return { m: MAT.rust, r: C.rust, t: 'plate', crude: 1 };
    if (o.sub === 'Metal' && !/boar/.test(id)) return { m, r: m.r, t: 'plate' };
    if (/iron_|steel_/.test(id) && !/shod|buckled|plated_jack/.test(id)) return { m, r: m.r, t: 'plate' };
    if (/cured_hide|hide_boots|rawhide/.test(id)) return { r: C.hide, t: 'leather' };
    if (/soot/.test(id)) return { r: CL.soot, t: 'leather' };
    if (/^direwolf_(head|bodybase|bracers|gloves|greaves|boots)$/.test(id)) return { r: FUR.grey, t: 'fur', fur: { fur: FUR.grey } };
    if (/^owlbear_/.test(id)) return { r: FUR.brown, t: 'fur', mottle: FUR.grey, fur: { fur: FUR.brown } };
    if (/^hippogriff_/.test(id)) return { r: FUR.white, t: 'feather', bar: FUR.brown, fur: { fur: FUR.tan } };
    for (const a of ['jackal', 'deer', 'direwolf', 'wolf', 'elk', 'sabretooth', 'boar', 'cave_bear', 'gnoll']) if (id.includes(a)) return { r: rampFrom(o.color && !/boar|cave_bear/.test(id) ? hex(o.color).map(c => c * .82) : '#7a4a26'), t: 'leather', fur: /boar/.test(id) ? null : spOf(a === 'gnoll' ? 'jackal' : a === 'direwolf' ? 'dire_wolf' : a) };
    return { r: o.color && /leather|hide|glove|gauntlet|coif|hood|cloak/.test(id) ? rampFrom(hex(o.color).map(c => c * .9)) : C.leather, t: 'leather' };
  };
  const texC = (st, L, x, y, cx) => {
    const dx = x - (cx === undefined ? 32 : cx) + 64;
    switch (st.t) {
      case 'cloth': return rp(st.r, L + Math.sin(x * .7 + Math.sin(y * .13) * 2) * .07 + ((x + y) & 1 ? .015 : -.015), x, y, .3);
      case 'quilt': { const lx = dx % 5; L += lx === 0 ? -.2 : lx === 2 ? .08 : 0; if ((y + (Math.floor(dx / 5) & 1) * 3) % 6 === 0 && lx !== 0) L -= .1; return rp(st.r, L, x, y, .25); }
      case 'weave': return rp(st.r, L + (((x >> 1) + (y >> 1)) & 1 ? .1 : -.1) + (hash(x, y, 3) - .5) * .1, x, y, .3);
      case 'wicker': return weaveC(st.r, { light: () => L - .5 })(x, y);
      case 'sticks': { const lx = dx % 4; return rp(st.r, L + (lx === 0 ? -.28 : lx === 1 ? .16 : 0) + (hash(Math.floor(dx / 4), y >> 2, 3) - .5) * .16, x, y, .25); }
      case 'fur': { const m2 = st.mottle && noise(x * .16, y * .16, 7) > .56 ? st.mottle : st.r; return rp(m2, L + (noise(x * .9, y * .32, 3) - .5) * .5 + (hash(x, y >> 1, 4) - .5) * .12, x, y, .35); }
      case 'feather': { const row = Math.floor((y + 60) / 6), lx = (dx + (row & 1) * 2) % 5, ly = (y + 60) % 6; if (ly === 2 || ly === 3) return rp(st.bar, L + (lx === 0 ? -.2 : 0), x, y, .25); return rp(st.r, L + (lx === 0 ? -.26 : lx === 2 ? .1 : 0) + (ly === 5 ? -.16 : 0), x, y, .25); }
      case 'leather': return rp(st.r, L + (noise(x * .45, y * .45, 3) - .5) * .16 - (hash(x, y, 7) > .93 ? .1 : 0), x, y, .3);
      case 'mail': { const row = Math.floor(y / 3), lx = (dx + (row & 1) * 2) % 4, ly = ((y % 3) + 3) % 3; return tone(st.m, L + (ly === 0 && lx < 2 ? .24 : ly === 2 || lx === 3 ? -.24 : 0), x, y); }
      case 'scale': { const row = Math.floor(y / 5), lx = (dx + (row & 1) * 3) % 6, ly = ((y % 5) + 5) % 5; L += ly === 4 || lx === 5 || (ly === 3 && (lx === 0 || lx === 4)) ? -.28 : ly === 0 && lx > 0 && lx < 4 ? .16 : lx === 1 ? .08 : 0; return st.m ? tone(st.m, L, x, y) : rp(st.r, L, x, y, .25); }
      case 'splint': { const lx = dx % 5; L += lx === 0 ? -.3 : lx === 1 ? .18 : lx === 4 ? -.1 : 0; if (lx === 2 && y % 8 === 3) L += .3; return tone(st.m, L, x, y); }
      case 'lamellar': { const row = Math.floor(y / 7), lx = (dx + (row & 1) * 2) % 4, ly = ((y % 7) + 7) % 7; if (ly === 3 && lx === 1 && st.lace) return rp(st.lace, .7, x, y, 0); return tone(st.m, L + (ly === 6 || lx === 3 ? -.28 : ly === 0 ? .18 : lx === 0 ? .08 : 0), x, y); }
      case 'bone': { const ly = ((y % 6) + 6) % 6; return tone(MAT.bone, L + .06 + (ly === 5 ? -.34 : ly === 0 ? .14 : 0) + (hash(Math.floor(y / 6), dx >> 2, 3) - .5) * .1, x, y); }
      default: return tone(st.m, L + Math.max(0, Math.sin((x - y) * .15 + 1) - .72) * .9 * (st.m.shine || 0) + (st.crude ? (noise(x * .3, y * .3, 5) - .5) * .2 : 0), x, y);
    }
  };
  const trimC = (st, x, y, k) => st.trim === 'ermine' ? (hash(x >> 1, y >> 1, 5) > .86 ? [24, 20, 26] : rp(CL.ermine, .7 + (hash(x, y, 2) - .5) * .2, x, y, .3)) : st.trim.r ? tone(st.trim, k === undefined ? .62 : k, x, y) : rp(st.trim, .6, x, y, .2);
  const fab = (st, o) => {
    o = o || {};
    const cx = o.cx === undefined ? 32 : o.cx, hw = o.hw || 14;
    return (x, y, D) => {
      const u = (x + .5 - cx) / hw;
      let L = (o.base || .54) - u * .15 - Math.max(0, Math.abs(u) - .55) * .28;
      if (st.trim && o.trim) for (const tg of o.trim) if (D[tg] < (o.tw || 2.6)) return trimC(st, x, y, D[tg] < 1 ? .4 : .7);
      if (o.fur) for (const tg of o.fur) if (D[tg] < (o.fw || 2.8)) return rp(o.furR, .56 + (noise(x * .9, y * .5, 3) - .5) * .6 - u * .1, x, y, .4);
      if (D.all < 1.3) L -= .14;
      if (o.ridge && Math.abs(x + .5 - cx) < 1) L += .2;
      return texC(st, L, x, y, cx);
    };
  };
  const limb = (st, cx) => (u, v, d, hw, x, y) => texC(st, .54 - v * .2 - (Math.abs(v) > .72 ? .14 : 0), x, y, cx);
  const torso = o => {
    const sh = o.sh || 14, wa = o.wa || 11, hem = o.hem || 50, hw = o.hw || 13, top = o.top || 12, nk = o.neck === undefined ? 7 : o.neck, nw = o.nw || 6;
    return [[32 - nw, top, 'top'], ...qv([32 - sh, top + 2], [32 - sh + 4, top + 8], [32 - sh + 2, top + 15], 'arm', 5), [32 - sh + 2, top + 15, 'side'], [32 - wa, 38, 'side'], [32 - hw, hem, 'hem'], [32 + hw, hem, 'side'], [32 + wa, 38, 'side'], ...qv([32 + sh - 2, top + 15], [32 + sh - 4, top + 8], [32 + sh, top + 2], 'arm', 5), [32 + sh, top + 2, 'top'], ...qv([32 + nw, top], [32, top + nk], [32 - nw, top], 'neck', 6)];
  };
  const body = (st, o) => () => {
    const s = IC(), top = o.top || 12, sh = o.sh || 14, hem = o.long ? 58 : o.mid ? 54 : o.hem || 50, hw = o.long ? 17 : o.mid ? 15 : 13, fr = st.fur && st.fur.fur;
    if (o.sleeve) part(s, t => { for (const sg of [-1, 1]) { const S = [32 + sg * (sh - 3), top + 6], E = o.sleeve === 'long' ? [32 + sg * (sh + 9), top + 34] : o.sleeve === 'bell' ? [32 + sg * (sh + 10), top + 36] : [32 + sg * (sh + 6), top + 17]; stroke(t, [S, E], u => o.sleeve === 'bell' ? 5 + u * 4.4 : 5.6 - u * 1.2, (u, v, d, hw2, x, y) => { if (st.trim && u > .88) return trimC(st, x, y, .6); if (o.cuffFur && u > .82) return rp(fr, .5 + (noise(x * .9, y * .5, 3) - .5) * .6, x, y, .4); return limb(st, S[0])(u, sg * v, d, hw2, x, y); }); } });
    part(s, t => poly(t, torso({ sh, hem, hw, top, neck: o.neck, wa: o.wa }), fab(st, { trim: o.trimHem ? ['hem', 'neck'] : ['neck'], ridge: o.ridge, fur: o.furCollar && st.t === 'leather' ? ['neck', 'arm', 'hem'] : null, furR: fr, fw: 2.8 })));
    if (o.flank) part(s, t => { for (let y = top + 17; y < hem - 4; y += 4) { strand(t, [39, y], [43, y + 3], C.cord, .6); strand(t, [43, y], [39, y + 3], C.cord, .6); } for (let y = top + 16; y < hem - 2; y++) t.set(41, y, st.r[1]); }, { line: 0 });
    if (o.open) part(s, t => { for (let y = top + 7; y < hem; y++) { t.set(31, y, st.trim ? trimC(st, 31, y, .7) : st.r[1]); t.set(32, y, st.trim ? trimC(st, 32, y, .4) : st.r[0]); } }, { line: 0 });
    if (o.split) part(s, t => { for (let y = 44; y <= hem; y++) for (let x = 31; x <= 32 + (y - 44) * .16; x++) { t.set(x, y, null); } });
    if (o.pecs) part(s, t => { for (const sg of [-1, 1]) stroke(t, bez([32 + sg * 2, top + 13], [32 + sg * 7, top + 20], [32 + sg * 11, top + 13], 8), .6, (u, v, d, h2, x, y) => tone(st.m, .26, x, y)); for (let y = 40; y < 48; y += 3) stroke(t, [[22, y], [42, y]], .5, (u, v, d, h2, x, y) => tone(st.m, .26, x, y)); }, { line: 0 });
    if (o.faulds) part(s, t => { for (let k = 0; k < 3; k++) poly(t, [[32 - 12 - k, 47 + k * 4, 'top'], [32 + 12 + k, 47 + k * 4, 'top'], [32 + 13 + k, 52 + k * 4, 'bot'], [32 - 13 - k, 52 + k * 4, 'bot']], (x, y, D) => texC(st, .56 - (x - 32) * .012 - (D.bot < 1.2 ? .2 : 0) + (D.top < 1.2 ? .14 : 0), x, y)); });
    if (o.pauldrons) part(s, t => { for (const sg of [-1, 1]) for (let k = 0; k < 2; k++) poly(t, chaikin([[32 + sg * (sh - 6), top - 1 + k * 4, 'top'], [32 + sg * (sh + 2), top - 2 + k * 4, 'top'], [32 + sg * (sh + 7), top + 4 + k * 5, 'bot'], [32 + sg * (sh + 1), top + 8 + k * 5, 'bot'], [32 + sg * (sh - 5), top + 6 + k * 4, 'bot']], 2), (x, y, D) => { if (st.trim && D.bot < 1.6) return trimC(st, x, y); return texC(Object.assign({}, st, { t: 'plate' }), .6 - sg * (x - 32 - sg * sh) * .03 - (D.all < 1.2 ? .14 : 0), x, y); }); });
    if (o.plates) part(s, t => { for (const [x0, y0, w2, h2] of o.plates.list || [[22, 20, 9, 9], [33, 20, 9, 9], [22, 31, 9, 8], [33, 31, 9, 8]]) poly(t, rrect(x0, y0, x0 + w2, y0 + h2, 2), (x, y, D) => { const m2 = o.plates.m; let L = .56 - (x - 32) * .012 - (D.all < 1.2 ? .18 : 0); return m2.r ? tone(m2, L, x, y) : rp(m2, L + (noise(x * .4, y * .4, 3) - .5) * .14, x, y, .3); }); if (o.plates.rivet) for (const [x0, y0, w2, h2] of o.plates.list || [[22, 20, 9, 9], [33, 20, 9, 9], [22, 31, 9, 8], [33, 31, 9, 8]]) { rivet(t, x0 + 1, y0 + 1, o.plates.rivet); rivet(t, x0 + w2 - 2, y0 + 1, o.plates.rivet); } });
    if (o.belt) part(s, t => { for (let x = 32 - (o.wa || 11) - 1; x <= 32 + (o.wa || 11) + 1; x++) for (let j = 0; j < 4; j++) t.set(x, 38 + j, rp(C.dark, j === 0 ? .68 : j === 3 ? .3 : .48, x, 38 + j, .2)); buckle(t, 29, 37, o.beltM || MAT.bronze, 6, 6); });
    if (o.spikes) part(s, t => { for (const sg of [-1, 1]) for (let k = 0; k < 2; k++) poly(t, [[32 + sg * (sh - 5 + k * 5), top + 2, 'top'], [32 + sg * (sh - 1 + k * 5), top - 7, 'top'], [32 + sg * (sh + k * 5), top + 3, 'bot']], (x, y) => tone(o.spikes, x < 32 ? .7 : .4, x, y)); });
    if (o.lacing) part(s, t => { for (let y = top + 9; y < 36; y += 4) { strand(t, [29, y], [35, y + 3], C.cord, .6); strand(t, [35, y], [29, y + 3], C.cord, .6); } }, { line: 0 });
    if (o.rivets) part(s, t => { for (const [x, y] of [[22, 22], [41, 22], [22, 34], [41, 34], [26, 46], [37, 46]]) rivet(t, x, y, o.rivets); }, { line: 0 });
    if (st.glyph) { glyphs(s, [[24, 26], [40, 26]], 4, { col: st.t === 'cloth' ? [255, 226, 140] : undefined }); light(s, [32, 28], st.t === 'cloth' ? [1, .85, .5] : [.5, .85, 1], 22); }
    return sel(s);
  };
  const cloak = (st, o) => () => {
    const s = IC(), fr = o.fur;
    part(s, t => poly(t, [[22, 12, 'top'], ...qv([22, 12], [10, 20], [8, 50], 'side', 8), ...qv([8, 50], [14, 58], [20, 54], 'hem', 4), ...qv([20, 54], [26, 59], [32, 55], 'hem', 4), ...qv([32, 55], [38, 59], [44, 54], 'hem', 4), ...qv([44, 54], [50, 58], [56, 50], 'hem', 4), ...qv([56, 50], [54, 20], [42, 12], 'side', 8), ...qv([42, 12], [32, 17], [22, 12], 'neck', 6)], (x, y, D) => { let L = .5 - (x - 32) * .006 + Math.sin((x - 32) * .5 + Math.sin(y * .1) * .6) * .1 * Math.min(1, (y - 12) / 20); if (D.all < 1.3) L -= .14; if (st.trim && D.hem < 2.4) return trimC(st, x, y); return texC(st, L, x, y); }));
    if (fr) part(s, t => poly(t, rough(chaikin([[18, 11, 'top'], [32, 8, 'top'], [46, 11, 'top'], [52, 20, 'bot'], [42, 24, 'bot'], [32, 21, 'bot'], [22, 24, 'bot'], [12, 20, 'bot']], 2), 2, 3), (x, y, D) => rp(fr, .5 + (noise(x * .9, y * .4, 3) - .5) * .6 - (x - 32) * .006 - (D.bot < 1.6 ? .16 : 0), x, y, .4)), { k: .22 });
    if (o.head) part(s, t => { blob(t, frame([32, 10], [32, 9]), 6, 7.4, { r: fr, d: .5, n: .4, ns: .9, shine: 0 }); for (const sg of [-1, 1]) poly(t, [[32 + sg * 3, 5, 'top'], [32 + sg * 7, -1 + 2, 'top'], [32 + sg * 8, 8, 'bot']], (x, y) => rp(fr, .46, x, y, .3)); t.set(29, 10, [240, 220, 120]); t.set(35, 10, [240, 220, 120]); t.rect(31, 14, 3, 2, fr[0]); });
    part(s, t => { rod(t, [[25, 15], [39, 15]], .8, o.clasp || MAT.bronze); ball(t, [25, 15], 2.2, o.clasp || MAT.bronze); ball(t, [39, 15], 2.2, o.clasp || MAT.bronze); });
    return sel(s);
  };
  const dome = (o) => chaikin([[32 - o.w, o.b, 'side'], [32 - o.w, o.b - o.h * .5, 'top'], [32 - o.w * .7, o.b - o.h * .9, 'top'], [32, o.b - o.h, 'top'], [32 + o.w * .7, o.b - o.h * .9, 'top'], [32 + o.w, o.b - o.h * .5, 'side'], [32 + o.w, o.b, 'hem']], 3);
  const helm = (st, o) => () => {
    const s = IC(), w = o.w || 15, b = o.deep ? 50 : 38, h = o.deep ? 38 : 26, m = st.m, T = (L, x, y) => texC(st, L, x, y), dk = st.m ? st.m.r[0] : st.r[0];
    if (o.horns) part(s, t => { for (const sg of [-1, 1]) stroke(t, bez([32 + sg * (w - 2), b - h * .62], [32 + sg * (w + 12), b - h * .6], [32 + sg * (w + 9), b - h - 6], 10), u => 3.6 * (1 - u * .8) + .4, (u, v, d, hw, x, y) => tone(MAT.bone, .6 - sg * v * .3 - (Math.floor(u * 12) % 2 ? .08 : 0), x, y), { round: 1 }); });
    if (o.crest) part(s, t => poly(t, chaikin([[30, b - h + 2, 'bot'], [22, b - h - 9, 'top'], [32, b - h - 14, 'top'], [44, b - h - 8, 'top'], [48, b - h + 8, 'bot'], [38, b - h + 1, 'bot']], 2), (x, y, D) => rp(o.crest, .5 + (hash(Math.floor((x * .8 - y * .5)), 2, 3) - .5) * .4 - (D.all < 1.2 ? .14 : 0), x, y, .3)));
    if (o.neck) part(s, t => poly(t, [[32 - w, b - 14, 'top'], [32 + w, b - 14, 'top'], [32 + w + 4, 58, 'bot'], [32 - w - 4, 58, 'hem']], fab(st, { hw: w + 4, base: .46 })));
    if (o.tail) part(s, t => poly(t, [[32 - w - 1, b - 6, 'top'], [32 + w + 1, b - 6, 'top'], [32 + w + 6, b + 4, 'hem'], [32 - w - 6, b + 4, 'side']], fab(st, { hw: w + 6, base: .5 })));
    part(s, t => poly(t, o.cap ? dome({ w, b, h }) : [...dome({ w, b: b - 10, h: h - 10 }).filter(p => p[1] < b - 10.5), [32 + w, b - 10, 'side'], [32 + w - 1, b, 'hem'], [32 - w + 1, b, 'side'], [32 - w, b - 10, 'side']], fab(st, { hw: w, base: .56, ridge: o.ridgeLine, trim: o.trimHem ? ['hem'] : null })));
    if (o.face === 'open') part(s, t => poly(t, chaikin([[32 - 8, b - 6, 'e'], [32 - 9, b - 20, 'e'], [32, b - 26, 'e'], [32 + 9, b - 20, 'e'], [32 + 8, b - 6, 'e'], [32, b - 2, 'e']], 2), (x, y, D) => D.all < 1.6 ? T(.7, x, y) : rp(C.black, .12 + (y - b + 26) * .006, x, y, .3)), { line: 0 });
    if (o.face === 'T') part(s, t => { for (let y = b - 22; y <= b; y++) for (let x = 32 - 9; x <= 32 + 9; x++) if ((y < b - 16 && Math.abs(x - 32) < 9.5) || Math.abs(x - 32) < 2.2 + (y > b - 4 ? 1 : 0)) t.set(x, y, [16, 13, 18]); for (let x = 32 - 10; x <= 32 + 10; x++) if (!t.get(x, b - 23)) t.set(x, b - 23, T(.84, x, b - 23)); }, { line: 0 });
    if (o.face === 'slit') part(s, t => { for (let x = 32 - 11; x <= 32 + 11; x++) { t.set(x, b - 13, [16, 13, 18]); t.set(x, b - 12, [16, 13, 18]); t.set(x, b - 14, T(.86, x, b - 14)); } }, { line: 0 });
    if (o.face === 'cross') part(s, t => { for (let x = 32 - 11; x <= 32 + 11; x++) if (Math.abs(x - 32) > 2) { t.set(x, b - 22, [16, 13, 18]); t.set(x, b - 21, [16, 13, 18]); } for (let y = b - 30; y <= b - 2; y++) for (let i = -1; i <= 1; i++) t.set(32 + i, y, trimC({ trim: o.band || MAT.gold }, 32 + i, y, i < 0 ? .8 : .5)); for (let x = 32 - w + 1; x <= 32 + w - 1; x++) for (let j = 0; j < 3; j++) t.set(x, b - 26 + j, trimC({ trim: o.band || MAT.gold }, x, b - 26 + j, j === 0 ? .8 : .5)); for (const [x, y] of [[24, b - 9], [27, b - 6], [24, b - 4], [40, b - 9], [37, b - 6], [40, b - 4]]) t.set(x, y, [16, 13, 18]); }, { line: 0 });
    if (o.eyes) part(s, t => { for (const sg of [-1, 1]) { blob(t, frame([32 + sg * 6, b - 18], [32 + sg * 6, b - 19]), 4, 4.4, { r: R('#0c0a0e #18141c #241e28'), d: .2, shine: 0 }); } poly(t, [[30, b - 10, 'e'], [32, b - 14, 'e'], [34, b - 10, 'e']], () => [16, 13, 18]); for (let x = 24; x <= 40; x += 3) { t.set(x, b - 1, [16, 13, 18]); t.set(x, b - 2, [16, 13, 18]); } }, { line: 0 });
    if (o.bands) part(s, t => { const B2 = o.bands; for (let x = 32 - w; x <= 32 + w; x++) for (let j = 0; j < 3; j++) t.set(x, b - 3 + j - (o.deep ? 14 : 0), tone(B2, j === 0 ? .82 : j === 2 ? .34 : .56, x, b)); stroke(t, bez([32, b - h], [30, b - h * .5], [32, b - 3 - (o.deep ? 14 : 0)], 8), 1.3, (u, v, d, hw, x, y) => tone(B2, .6 - v * .3, x, y)); for (const sg of [-1, 1]) stroke(t, bez([32, b - h], [32 + sg * w * .8, b - h * .8], [32 + sg * (w - 1), b - 4 - (o.deep ? 14 : 0)], 8), 1.1, (u, v, d, hw, x, y) => tone(B2, .56 - sg * v * .3, x, y)); for (let x = 32 - w + 2; x < 32 + w; x += 5) rivet(t, x, b - 2 - (o.deep ? 14 : 0), B2); }, { line: 0 });
    if (o.brim) part(s, t => { for (let y = b - 3; y <= b + 5; y++) for (let x = 32 - w - 8; x <= 32 + w + 8; x++) { const nx = (x + .5 - 32) / (w + 8.5), ny = (y - b - 1) / 4.6; if (nx * nx + ny * ny > 1) continue; t.set(x, y, T(.56 - nx * .16 + (ny < -.3 ? .2 : ny > .4 ? -.2 : 0), x, y)); } });
    if (o.nasal) part(s, t => { for (let x = 32 - w; x <= 32 + w; x++) for (let j = 0; j < 4; j++) t.set(x, b - 3 + j, T(j === 0 ? .84 : j === 3 ? .3 : .56 - (x - 32) * .01, x, b - 3 + j)); for (let y = b; y <= b + 10; y++) { const hw2 = y > b + 7 ? 3 : 2; for (let i = -hw2; i <= hw2; i++) t.set(32 + i, y, T(i < 0 ? .78 : i === 0 ? .62 : .36, 32 + i, y)); } });
    if (o.aventail) part(s, t => poly(t, [[32 - w + 1, b + 1, 'top'], [32 - 5, b + 1, 'top'], [32 - 7, b + 15, 'hem'], [32 - w - 3, b + 17, 'side']].concat([[32 + 5, b + 1, 'top'], [32 + w - 1, b + 1, 'side'], [32 + w + 3, b + 17, 'hem'], [32 + 7, b + 15, 'side']].length ? [] : []), fab(o.aventail, { hw: w })), {});
    if (o.aventail) part(s, t => poly(t, [[32 + 5, b + 1, 'top'], [32 + w - 1, b + 1, 'side'], [32 + w + 3, b + 17, 'hem'], [32 + 7, b + 15, 'side']], fab(o.aventail, { hw: w })));
    if (o.cheeks) part(s, t => { for (const sg of [-1, 1]) poly(t, chaikin([[32 + sg * (w - 1), b - 2, 'top'], [32 + sg * (w - 9), b - 1, 'top'], [32 + sg * (w - 8), b + 10, 'bot'], [32 + sg * (w - 2), b + 12, 'bot']], 2), fab(st, { hw: w, base: .5 })); });
    if (o.comb) part(s, t => stroke(t, bez([32 - w + 4, b - h * .7], [32, b - h - 7], [32 + w - 4, b - h * .7], 10), u => 1 + Math.sin(u * 3.14) * 1.4, (u, v, d, hw, x, y) => T(.7 - v * .3, x, y)));
    if (o.peak) part(s, t => poly(t, [[32 - w + 2, b - 14, 'top'], [32 + w - 2, b - 14, 'top'], [32 + w - 5, b - 9, 'bot'], [32 - w + 5, b - 9, 'bot']], (x, y, D) => T(.66 - (D.bot < 1.2 ? .3 : 0), x, y)));
    if (o.ears) part(s, t => { for (const sg of [-1, 1]) poly(t, [[32 + sg * 5, b - h + 5, 'top'], [32 + sg * 11, b - h - 6, 'top'], [32 + sg * 14, b - h + 9, 'bot']], (x, y, D) => D.all > 2 ? rp(C.leather, .3, x, y, .2) : rp(o.ears, .5, x, y, .3)); }, { k: .22 });
    if (o.snout) part(s, t => { blob(t, frame([32, b - 9], [32, b - 10]), 6, 6.6, { r: o.snoutR, d: .5, n: .4, ns: .9, shine: 0 }); if (o.snout === 'beak') poly(t, [[28, b - 12, 'top'], [36, b - 12, 'top'], [32, b - 1, 'bot']], (x, y) => rp(C.gold, x < 32 ? .7 : .4, x, y, .2)); else { t.rect(30, b - 7, 5, 3, [22, 18, 20]); } for (const sg of [-1, 1]) { t.set(32 + sg * 7, b - 19, [240, 214, 110]); t.set(32 + sg * 8, b - 19, [240, 214, 110]); t.set(32 + sg * 7, b - 18, [20, 16, 18]); } if (o.tusks) for (const sg of [-1, 1]) stroke(t, bez([32 + sg * 5, b - 5], [32 + sg * 9, b - 5], [32 + sg * 9, b - 12], 5), u => 1.6 - u, boneC, { round: 1 }); if (o.fangs) for (const sg of [-1, 1]) stroke(t, [[32 + sg * 4, b - 4], [32 + sg * 4.5, b + 6]], u => 1.6 - u * 1.2, boneC, { round: 1 }); }, { k: .22 });
    if (st.glyph) { glyphs(s, [[24, b - h * .55], [40, b - h * .55]], 3, { col: st.t === 'cloth' ? [255, 226, 140] : undefined }); light(s, [32, b - h * .5], [.5, .85, 1], 18); }
    return sel(s);
  };
  const coif = (st, o) => () => {
    o = o || {};
    const s = IC(), fr = st.fur && st.fur.fur, lined = fr && st.t === 'leather';
    part(s, t => poly(t, o.mantle ? [[20, 36, 'top'], [44, 36, 'top'], ...qv([44, 36], [56, 44], [58, 56], 'side', 6), ...[52, 46, 40, 32, 24, 16, 10].map((x, i) => [x, 57 + (i & 1 ? 0 : 2), 'hem']), ...qv([6, 56], [8, 44], [20, 36], 'side', 6)] : [[21, 38, 'top'], [43, 38, 'top'], [45, 55, 'side'], [38, 58, 'hem'], [26, 58, 'hem'], [19, 55, 'side']], fab(st, { hw: o.mantle ? 24 : 13, base: .46, fur: lined ? ['hem'] : null, furR: fr, trim: ['hem'] })));
    part(s, t => poly(t, chaikin([[18, 45, 'side'], [16, 27, 'top'], [21, 13, 'top'], [32, 8, 'top'], [43, 13, 'top'], [48, 27, 'side'], [46, 45, 'hem'], [32, 48, 'hem']], 3), fab(st, { hw: 16, base: .56 })));
    part(s, t => poly(t, chaikin([[24, 42, 'e'], [23, 29, 'e'], [27, 22, 'e'], [32, 20, 'e'], [37, 22, 'e'], [41, 29, 'e'], [40, 42, 'e'], [32, 45, 'e']], 3), (x, y, D) => D.all < (lined ? 2.6 : 1.4) ? (lined ? rp(fr, .6 + (noise(x * .9, y * .5, 3) - .5) * .6, x, y, .4) : texC(st, .74, x, y)) : rp(C.black, .1 + (y - 20) * .006 + (x - 32) * .004, x, y, .3)), { line: 0 });
    if (!o.plain) part(s, t => { for (let y = 9; y < 20; y++) t.set(32, y, (st.m ? st.m.r : st.r)[1]); for (const sg of [-1, 1]) for (let k = 0; k < 9; k++) t.set(32 + sg * (9 + k * .8), 15 + k * 1.6, (st.m ? st.m.r : st.r)[1]); }, { line: 0 });
    if (o.lace) part(s, t => { for (let y = 47; y < 56; y += 3) { strand(t, [30, y], [34, y + 2], C.cord, .6); strand(t, [34, y], [30, y + 2], C.cord, .6); } }, { line: 0 });
    if (o.tie) part(s, t => { strand(t, [29, 46], [26, 54], C.cord, .7); strand(t, [35, 46], [38, 53], C.cord, .7); t.rect(31, 46, 3, 2, C.cord[4]); }, { line: 0 });
    if (o.brim) part(s, t => { for (let y = 19; y <= 25; y++) for (let x = 14; x <= 50; x++) { const nx = (x + .5 - 32) / 18.5, ny = (y - 22) / 3.4; if (nx * nx + ny * ny > 1) continue; t.set(x, y, texC(st, .6 - nx * .16 + (ny < -.3 ? .2 : ny > .4 ? -.24 : 0), x, y)); } });
    if (st.glyph) { glyphs(s, [[22, 16], [42, 16]], 3, { col: st.t === 'cloth' ? [255, 226, 140] : undefined }); light(s, [32, 16], [.5, .85, 1], 18); }
    return sel(s);
  };
  const band = (m, o) => () => {
    o = o || {};
    const s = IC(), cy = 34, rx = 22, ry = 8, bh = o.th || 6, pts = o.points || 0;
    const draw = (t, front) => { for (let x = 32 - rx; x <= 32 + rx; x++) { const nx = (x + .5 - 32) / rx, yy = Math.sqrt(Math.max(0, 1 - nx * nx)) * ry, y0 = Math.round(cy + (front ? yy : -yy)); let top = y0; if (front && pts) { const ph = ((nx + 1) * pts * .5) % 1, pk = 1 - Math.abs(ph - .5) * 2; top = y0 - Math.round(pk * (o.ph || 9) * (1 - Math.abs(nx) * .3)); } for (let y = top; y < y0 + bh; y++) { let L = front ? .62 - nx * .2 : .3; if (y === top) L += .2; if (y === y0 + bh - 1) L -= .2; if (front && y === y0 + 1) L += .1; t.set(x, y, o.bone ? tone(MAT.bone, L, x, y) : tone(m, L, x, y)); } } };
    part(s, t => draw(t, 0)); part(s, t => draw(t, 1));
    if (o.gem) part(s, t => { gem(t, [32, cy + ry + bh / 2 - (pts ? 1 : 0)], o.gr || 3, o.gem); for (const sg of o.sideGems ? [-1, 1] : []) gem(t, [32 + sg * 12, cy + ry * .78 + bh / 2], 2, o.gem2 || o.gem); }, { line: 0 });
    if (o.gem) light(s, [32, cy + ry + 2], [.9, .8, .9], 14);
    if (o.bone) part(s, t => { for (let k = -2; k <= 2; k++) { const x = 32 + k * 8, nx = (x - 32) / rx, y = cy + Math.sqrt(1 - nx * nx) * ry; stroke(t, [[x, y + 1], [x, y - 7]], u => 1.6 - u, boneC, { round: 1 }); } });
    if (o.twist) part(s, t => { for (let x = 32 - rx + 2; x < 32 + rx - 1; x += 3) { const nx = (x - 32) / rx, y = Math.round(cy + Math.sqrt(1 - nx * nx) * ry); for (let j = 0; j < bh; j++) t.set(x + (j >> 1), y + j, m.r[2]); } }, { line: 0 });
    return sel(s);
  };
  const torc = (m, o) => () => {
    o = o || {};
    const s = IC(), pts = arc(32, 30, 19, 19, 2.1, 7.33, 36), e0 = pts[0], e1 = pts[pts.length - 1];
    part(s, t => stroke(t, pts, 2.7, (u, v, d, hw, x, y) => tone(m, ((u * 34 + v * 1.1) % 2 < 1 ? .74 : .42) - v * .2, x, y), { round: 1 }));
    part(s, t => { for (const p of [e0, e1]) { ball(t, p, 4, m); if (o.gem) gem(t, p, 2.4, o.gem); } });
    return sel(s);
  };
  const necklace = (m, o) => () => {
    o = o || {};
    const s = IC(), ch = [...bez([14, 10], [10, 34], [32, 44], 14), ...bez([32, 44], [54, 34], [50, 10], 14).slice(1)];
    part(s, t => { if (o.cord) stroke(t, ch, 1, cordC(o.cord, 1.8, 90), { round: 1 }); else if (o.heavy) { for (let k = 1; k < ch.length - 1; k += 1) poly(t, rrect(ch[k][0] - 2.6, ch[k][1] - 2.4, ch[k][0] + 2.6, ch[k][1] + 2.4, 1), metalFace(m, frame(ch[k], [ch[k][0], ch[k][1] - 1]), { bevel: 0 })); } else X.hdWeapons.chain(t, ch, m); });
    if (o.teeth) part(s, t => { for (const k of [8, 11, 14, 17, 20]) { const p = ch[k]; stroke(t, [[p[0], p[1]], [p[0] + (k - 14) * .3, p[1] + (k === 14 ? 12 : 9)]], u => 2 * (1 - u * .8) + .3, boneC, { round: 1 }); } });
    if (o.fang) part(s, t => { stroke(t, bez([32, 44], [29, 52], [35, 60], 6), u => 3.2 * (1 - u * .85) + .3, boneC, { round: 1 }); stroke(t, [[30, 44], [34, 44]], 2, cordC(C.sinew, 1.4, 4)); });
    if (o.disc) part(s, t => { ball(t, [32, 49], o.heavy ? 7 : 5.6, m, {}); rod(t, arc(32, 49, o.heavy ? 4.4 : 3.4, o.heavy ? 4.4 : 3.4, 0, 6.3, 16), .6, m.r.map(c => [c[0] * .7, c[1] * .7, c[2] * .7])); });
    if (o.gem) part(s, t => { poly(t, chaikin([[32, 42, 'top'], [39, 49, 'bot'], [32, 58, 'bot'], [25, 49, 'top']], 1), metalFace(m, frame([32, 49], [32, 48]), { bevel: 0 })); gem(t, [32, 50], 4.2, o.gem); });
    if (o.gem) light(s, [32, 50], [.9, .8, .9], 16);
    return sel(s);
  };
  const ring = (m, o) => () => {
    o = o || {};
    const s = IC();
    part(s, t => stroke(t, arc(32, 38, 15, 15, 0, 6.2832, 40), 3, (u, v, d, hw, x, y) => { let L = .5 - (x + y - 70) * .012 + (v < -.4 ? .2 : v > .5 ? -.2 : 0); if (Math.abs(v) < .2) L += .12; return tone(m, L, x, y); }));
    if (o.signet) part(s, t => { poly(t, rrect(25, 14, 39, 27, 3), metalFace(m, frame([32, 20], [32, 19]), { bevel: 0 })); for (const [x, y] of [[30, 18], [31, 19], [32, 20], [33, 19], [34, 18], [32, 22], [32, 23]]) t.set(x, y, m.r[1]); });
    else if (o.gem) part(s, t => { poly(t, chaikin([[25, 20, 'top'], [32, 12, 'top'], [39, 20, 'bot'], [36, 27, 'bot'], [28, 27, 'bot']], 1), metalFace(m, frame([32, 20], [32, 19]), { bevel: 0 })); gem(t, [32, 19], 5.4, o.gem); });
    if (o.gem) light(s, [32, 19], [.9, .8, .9], 16);
    return sel(s);
  };
  const pair = (st, kind, o) => () => {
    o = o || {};
    const s = IC(), fr = st.fur && st.fur.fur, T = (L, x, y, cx) => texC(st, L, x, y, cx);
    const one = (t, ox, oy, fl) => {
      const P2 = pts => pts.map(p => [ox + (fl ? -p[0] : p[0]), oy + p[1], p[2]]), cx = ox;
      if (kind === 'boot') {
        poly(t, P2([[-5, o.ankle ? -9 : -20, 'top'], [5, o.ankle ? -9 : -20, 'top'], [5, 2, 'side'], ...qv([5, 2], [13, 4], [14, 11], 'side', 5), [14, 14, 'hem'], [-6, 14, 'side'], [-6, 2, 'side']]), (x, y, D) => { if (D.hem < 2.6) return o.sole && o.sole.r ? tone(o.sole, .5, x, y) : rp(o.sole || C.dark, .34, x, y, .2); if (fr && D.top < 4) return rp(fr, .5 + (noise(x * .9, y * .5, 3) - .5) * .6, x, y, .4); if (st.trim && D.top < 2.4) return trimC(st, x, y); return T(.56 - (fl ? -1 : 1) * (x - cx) * .02 - (D.all < 1.3 ? .14 : 0), x, y, cx); });
        if (o.straps) for (const y of o.ankle ? [-3, 6] : [-12, -4, 6]) for (let x = -6; x <= (y > 0 ? 12 : 5); x++) t.set(ox + (fl ? -x : x), oy + y, rp(C.cord, .6, x, y, .2));
        if (st.t === 'plate') for (const y of [-12, -5]) for (let x = -5; x <= 5; x++) t.set(ox + (fl ? -x : x), oy + y, st.m.r[1]);
      } else if (kind === 'glove') {
        poly(t, P2(chaikin([[-6, 14, 'hem'], [-7, 0, 'side'], [-8, -8, 'side'], [-7, -16, 'top'], [-3, -19, 'top'], [2, -19, 'top'], [6, -16, 'top'], [7, -8, 'side'], [7, 0, 'side'], [6, 14, 'side']], 1)), (x, y, D) => { if (fr && D.hem < 4.4) return rp(fr, .5 + (noise(x * .9, y * .5, 3) - .5) * .6, x, y, .4); if (st.trim && D.hem < 2.6) return trimC(st, x, y); let L = .56 - (x - cx) * .02 - (D.all < 1.3 ? .14 : 0); const lx = (fl ? -1 : 1) * (x - ox); if (!o.mitt && y - oy < -6 && (Math.abs(lx + 3.5) < .6 || Math.abs(lx) < .6 || Math.abs(lx - 3.5) < .6)) L -= .3; if (o.knuckle && Math.abs(y - oy + 6) < 1.2) L += .22; return T(L, x, y, cx); });
        poly(t, P2(chaikin([[6, 2, 'top'], [11, -6, 'top'], [13, -3, 'bot'], [9, 6, 'bot'], [6, 8, 'bot']], 1)), (x, y, D) => T(.5 - (D.all < 1.2 ? .14 : 0), x, y, cx));
        if (o.fingers === 3) for (let y = -19; y < -6; y++) for (let x = 3; x <= 7; x++) t.set(ox + (fl ? -x : x), oy + y, null);
      } else if (kind === 'bracer') {
        poly(t, P2([[-7, -17, 'top'], [7, -17, 'top'], [5, 16, 'side'], [-5, 16, 'hem']]), (x, y, D) => { if (fr && (D.top < 4 || D.hem < 3)) return rp(fr, .5 + (noise(x * .9, y * .5, 3) - .5) * .6, x, y, .4); if (st.trim && (D.top < 2.4 || D.hem < 2.4)) return trimC(st, x, y); return T(.56 - (x - cx) * .03 - Math.max(0, Math.abs(x - cx) - 4) * .05 - (D.all < 1.3 ? .14 : 0), x, y, cx); });
        if (o.straps) for (const y of [-9, 0, 9]) { for (let x = -7; x <= 7; x++) if (Math.abs(x) <= 7 - (y + 17) * .06) t.set(ox + x, oy + y, rp(C.dark, .5, x, y, .2)); t.set(ox, oy + y, MAT.bronze.r[6]); t.set(ox + 1, oy + y, MAT.bronze.r[4]); }
        if (o.lace) for (let y = -13; y < 13; y += 4) { strand(t, [ox - 2, oy + y], [ox + 2, oy + y + 3], C.cord, .6); strand(t, [ox + 2, oy + y], [ox - 2, oy + y + 3], C.cord, .6); }
      } else {
        if (o.knee) poly(t, P2(chaikin([[-7, -17, 'top'], [0, -23, 'top'], [7, -17, 'top'], [6, -9, 'bot'], [-6, -9, 'bot']], 2)), (x, y, D) => T(.64 - (x - cx) * .03 - (D.all < 1.2 ? .16 : 0), x, y, cx));
        poly(t, P2([[-6, -12, 'top'], [6, -12, 'top'], [5, 8, 'side'], [7, 17, 'side'], [-5, 17, 'hem'], [-5, 8, 'side']]), (x, y, D) => { if (fr && D.top < 4 && !o.knee) return rp(fr, .5 + (noise(x * .9, y * .5, 3) - .5) * .6, x, y, .4); if (st.trim && D.hem < 2.4) return trimC(st, x, y); let L = .56 - (x - cx) * .03 - (D.all < 1.3 ? .14 : 0); if (st.t === 'plate' && Math.abs(x - cx) < 1) L += .2; return T(L, x, y, cx); });
        if (o.straps) for (const y of [-6, 4, 12]) for (let x = -6; x <= 6; x++) t.set(ox + x, oy + y, rp(C.dark, .5, x, y, .2));
        if (o.gap) for (let y = -4; y <= -1; y++) for (let x = -8; x <= 8; x++) t.set(ox + x, oy + y, null);
      }
    };
    part(s, t => one(t, kind === 'boot' ? 21 : 19, kind === 'boot' ? 35 : 33, 0));
    part(s, t => one(t, kind === 'boot' ? 43 : 45, kind === 'boot' ? 39 : 35, kind !== 'boot'));
    if (st.glyph) { glyphs(s, [[19, 32], [19, 38]], 2, { col: st.t === 'cloth' ? [255, 226, 140] : undefined }); glyphs(s, [[45, 34], [45, 40]], 2, { seed: 2, col: st.t === 'cloth' ? [255, 226, 140] : undefined }); }
    return sel(s);
  };
  const legs = (st, o) => () => {
    o = o || {};
    const s = IC();
    if (o.skirt) part(s, t => poly(t, [[20, 14, 'top'], [44, 14, 'top'], ...qv([44, 14], [50, 34], [53, 52], 'side', 6), ...qv([53, 52], [42, 57], [32, 53], 'hem', 5), ...qv([32, 53], [22, 57], [11, 52], 'hem', 5), ...qv([11, 52], [14, 34], [20, 14], 'side', 6)], (x, y, D) => { let L = .54 - (x - 32) * .008 + Math.sin((x - 32) * .55) * .1 * Math.min(1, (y - 14) / 16) - (D.all < 1.3 ? .14 : 0); if (D.hem < 3 && (x + y) % 3 === 0) return null; return texC(st, L, x, y); }));
    else part(s, t => { for (const sg of [-1, 1]) poly(t, [[32, 14, 'top'], [32 + sg * 13, 14, 'side'], [32 + sg * 15, 30, 'side'], [32 + sg * 13, 57, 'hem'], [32 + sg * 4, 57, 'side'], [32 + sg * 1.5, 30, 'side'], [32, 26, 'side']], fab(st, { cx: 32 + sg * 8, hw: 7, trim: ['hem'] })); });
    part(s, t => { for (let x = 19; x <= 44; x++) for (let j = 0; j < 4; j++) t.set(x, 12 + j, rp(o.skirt ? C.hide : C.dark, j === 0 ? .68 : j === 3 ? .3 : .5, x, 12 + j, .2)); if (!o.skirt) { strand(t, [30, 16], [28, 23], C.cord, .7); strand(t, [33, 16], [35, 22], C.cord, .7); } });
    if (st.glyph) glyphs(s, [[22, 50], [42, 50]], 4, { col: [255, 226, 140] });
    return sel(s);
  };
  const SHAPE = {
    round: r => arc(32, 32, r, r, 0, 6.2832, 36).map(p => [p[0], p[1], p[0] + p[1] < 64 ? 'top' : 'bot']).slice(0, 36),
    heater: () => [[14, 10, 'top'], [50, 10, 'bot'], ...qv([50, 10], [52, 40], [32, 58], 'bot', 10), ...qv([32, 58], [12, 40], [14, 10], 'top', 10)],
    kite: () => [...qv([14, 18], [16, 6], [32, 6], 'top', 6), ...qv([32, 6], [48, 6], [50, 18], 'bot', 6), ...qv([50, 18], [48, 40], [32, 61], 'bot', 10), ...qv([32, 61], [16, 40], [14, 18], 'top', 10)],
    slab: () => rough([[13, 9, 'top'], [50, 12, 'bot'], [52, 53, 'bot'], [15, 56, 'top']].flatMap((p, i, l) => [p, [(p[0] + l[(i + 1) % 4][0]) / 2, (p[1] + l[(i + 1) % 4][1]) / 2, p[2]]]), 2.4, 7),
  };
  const shield = o => () => {
    const s = IC(), pts = o.shape === 'round' ? SHAPE.round(o.r || 22) : SHAPE[o.shape](), rim = o.rim, rw = o.rw || 2.6;
    part(s, t => poly(t, pts, (x, y, D) => {
      const dx = x - 32, dy = y - 32;
      if (rim && D.all < rw) return rim.r ? tone(rim, (D.top < rw ? .72 : .4) - (D.all < 1 ? .16 : 0), x, y) : rp(rim, (D.top < rw ? .66 : .36), x, y, .2);
      let L = .56 - (dx + dy) * .005;
      if (o.face.r) return tone(o.face, L + Math.max(0, Math.sin((x - y) * .15 + 1) - .72) * .7 * o.face.shine, x, y);
      if (o.weave) return weaveC(o.face, { light: () => L - .5 })(x, y);
      if (o.planks) { const lx = ((x + 3) % 8 + 8) % 8; L += lx === 0 ? -.3 : lx === 1 ? .12 : 0; L += (hash(Math.floor((x + 3) / 8), y >> 2, 3) - .5) * .14; return rp(o.face, L, x, y, .25); }
      if (o.hide) { L += (noise(x * .2, y * .2, 4) - .5) * .3; if (Math.abs(noise(x * .14, y * .14, 9) - .5) < .02) L -= .2; }
      if (o.quarter && ((dx < 0) !== (y < 30))) return rp(o.quarter, L, x, y, .3);
      if (o.cross && (Math.abs(dx) < 2.6 || Math.abs(y - 26) < 2.6)) return o.cross.r ? tone(o.cross, L + .1, x, y) : rp(o.cross, L + .1, x, y, .2);
      return rp(o.face, L + (noise(x * .4, y * .4, 2) - .5) * .1, x, y, .3);
    }));
    if (o.spikes) part(s, t => { for (const [x, y] of [[20, 18], [44, 20], [20, 46], [44, 48]]) poly(t, [[x - 3, y + 2, 'top'], [x, y - 5, 'top'], [x + 3, y + 2, 'bot']], (x2, y2) => tone(MAT.orc, x2 < x ? .8 : .5, x2, y2)); });
    if (o.studs) part(s, t => { for (let a = 0; a < 8; a++) rivet(t, Math.round(32 + Math.cos(a * .785 + .39) * ((o.r || 22) - 5)), Math.round(32 + Math.sin(a * .785 + .39) * ((o.r || 22) - 5)), o.studs); }, { line: 0 });
    if (o.boss) part(s, t => { ball(t, [32, o.shape === 'round' ? 32 : 28], o.boss, o.bossM || MAT.iron); if (o.boss > 4) rod(t, arc(32, o.shape === 'round' ? 32 : 28, o.boss + 1.6, o.boss + 1.6, 0, 6.3, 22), .8, o.bossM || MAT.iron); });
    if (o.rune) { glyphs(s, [[22, 20], [42, 20]], 4); glyphs(s, [[26, 42], [38, 42]], 3, { seed: 2 }); light(s, [32, 30], [.5, .85, 1], 24); }
    return sel(s);
  };
  const splint = (cast, leg) => () => {
    const s = IC(), wrapC = (R2, n) => (u, v, d, hw, x, y) => rp(R2, .7 - v * .28 - ((u * n + v * .8) % 1 < .14 ? .16 : 0) + (hash(x, y, 3) - .5) * .06, x, y, .3);
    if (cast) { const pts = leg ? [[20, 8], [30, 44], [32, 50], [48, 54]] : [[14, 20], [34, 26], [40, 30], [48, 50]]; part(s, t => stroke(t, [pts[0], ...bez(pts[1], pts[2], pts[3], 8)], u => leg ? 8 - u * 2.4 : 6.6 - u * 1.2, wrapC(CL.ermine, 16), { round: 1 })); return sel(s); }
    const a = leg ? [14, 54] : [18, 50], b = leg ? [50, 14] : [46, 20], F = frame(a, b);
    part(s, t => stroke(t, [F(2, 0), F(F.len - 2, 0)], leg ? 8 : 7, wrapC(C.cloth, 9), { round: 1 }));
    part(s, t => { for (const r of leg ? [-5, 5] : [-4.2, 4.2]) haft(t, [F(-2, r), F(F.len + 2, r)], 1.5, C.ash, { seed: r + 9, round: 1 }); });
    part(s, t => { for (const q of [.18, .5, .82]) stroke(t, [F(F.len * q - .8, 0), F(F.len * q + .8, 0)], leg ? 8.4 : 7.4, (u, v, d, hw, x, y) => rp(C.leather, .56 - v * .3, x, y, .25)); }, { line: 0 });
    return sel(s);
  };
  const cutOf = id => {
    const robe = /robe/.test(id);
    return { long: robe, mid: /hauberk|gambeson|jack|tunic/.test(id), sleeve: robe ? 'bell' : /gambeson|doublet|tunic|hauberk|shirt/.test(id) ? (/gambeson|doublet/.test(id) ? 'long' : 'short') : /jack$/.test(id) ? 'short' : 0, belt: /robe|tunic|jerkin|gambeson|jack|hauberk/.test(id) };
  };
  X.hdArmor = { styleOf, cutOf };
  const gemIn = id => { for (const k of ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst', 'citrine', 'moonstone']) if (id.includes(k)) return GEM[k]; return null; };
  const armor = o => {
    const id = o.id, a = o.src.armor || {}, slot = a.slot || a.equipmentSlot, st = styleOf(o), fur = st.fur, pl = st.t === 'plate', mt = !!st.m;
    if (o.sub === 'Medicine') return splint(/cast/.test(id), /leg/.test(id));
    if (slot === 'ring') return /arm_ring/.test(id) ? band(MAT.bronze, { th: 8, twist: 1 }) : ring(/iron/.test(id) ? MAT.iron : /silver|moonstone|sapphire/.test(id) ? MAT.silver : MAT.gold, { signet: /signet/.test(id), gem: gemIn(id) });
    if (slot === 'amulet') return /torc/.test(id) ? torc(/bronze/.test(id) ? MAT.bronze : MAT.gold, { gem: /champion/.test(id) ? GEM.ruby : null }) : /tooth/.test(id) ? necklace(null, { cord: C.sinew, teeth: 1 }) : /fang/.test(id) ? necklace(null, { cord: C.sinew, fang: 1 }) : /chain_of_office/.test(id) ? necklace(MAT.gold, { heavy: 1, disc: 1 }) : necklace(/silver|wayfarer|moonstone|sapphire/.test(id) ? MAT.silver : MAT.gold, { gem: gemIn(id) || (/sage/.test(id) ? GEM.sapphire : null), disc: !gemIn(id) && !/sage/.test(id) });
    if (slot === 'offHand') return shield(/wattle/.test(id) ? { shape: 'round', r: 19, face: C.wicker, weave: 1, rim: C.wood } : /rawhide/.test(id) ? { shape: 'round', r: 21, face: C.hide, hide: 1, rim: C.wood, boss: 3, bossM: MAT.bone } : /plank/.test(id) ? { shape: 'round', face: C.ash, planks: 1, rim: C.wood, boss: 4.4, bossM: MAT.bronze } : /slab/.test(id) ? { shape: 'slab', face: MAT.orc, rim: MAT.orc, spikes: 1, boss: 5 } : /boss/.test(id) ? { shape: 'round', face: C.ash, planks: 1, rim: MAT.iron, boss: 7, studs: MAT.iron } : /buckler/.test(id) ? { shape: 'round', r: 16, face: MAT.iron, rim: MAT.iron, boss: 6 } : /kite/.test(id) ? { shape: 'kite', face: CL.rune, rim: MAT.alloy, rune: 1, cross: MAT.gold, boss: 3.4, bossM: MAT.gold } : { shape: 'heater', face: C.red, rim: MAT.steel, cross: C.cloth, quarter: C.blue, rw: 3 });
    if (slot === 'back') return cloak(/direwolf/.test(id) ? { r: FUR.dark, t: 'leather' } : st, { fur: /direwolf/.test(id) ? FUR.grey : null, head: /direwolf/.test(id), clasp: /wool/.test(id) ? MAT.bronze : MAT.iron });
    if (slot === 'head') {
      if (/circlet|diadem|crown/.test(id)) return band(/bone/.test(id) ? MAT.bone : /stargazer|scholar|filigree/.test(id) ? MAT.silver : MAT.gold, { points: /crown/.test(id) ? (/sovereign/.test(id) ? 9 : 7) : /diadem/.test(id) ? 5 : 0, ph: /diadem/.test(id) ? 5 : 9, gem: /bone/.test(id) ? null : /stargazer/.test(id) ? GEM.moonstone : /scholar/.test(id) ? GEM.sapphire : /warden/.test(id) ? GEM.emerald : /champion/.test(id) ? GEM.ruby : /sovereign/.test(id) ? GEM.amethyst : GEM.topaz, sideGems: /crown|diadem/.test(id), gem2: /sovereign/.test(id) ? GEM.ruby : null, bone: /bone/.test(id), th: /crown/.test(id) ? 7 : 5, gr: /crown/.test(id) ? 3.4 : 2.8 });
      if (/_head$|quilted_head/.test(id)) return coif(st, { lace: 1 });
      if (/mail_coif|rune_stitched_coif/.test(id)) return coif(st, { mantle: 1, plain: 1 });
      if (/hood/.test(id)) return coif(st, { tie: /cured|sackcloth/.test(id), brim: /brimmed/.test(id), mantle: /rune_woven/.test(id) });
      if (/coif/.test(id)) return coif(st, { lace: 1 });
      if (/kettle/.test(id)) return helm(st, { cap: 1, brim: 1 });
      if (/pot_helm/.test(id)) return helm(st, { cap: 1, brim: 1, bands: MAT.orc });
      if (/cap$|skullcap/.test(id)) return helm(st, { cap: 1, bands: /copper|bronze/.test(id) ? st.m : null, trimHem: 1 });
      if (/sallet/.test(id)) return helm(st, { cap: 1, tail: 1, face: 'slit', ridgeLine: 1 });
      if (/barbute/.test(id)) return helm(st, { deep: 1, face: 'T' });
      if (/great_helm/.test(id)) return helm(st, { deep: 1, face: 'cross', w: 14 });
      if (/burgonet/.test(id)) return helm(st, { cap: 1, comb: 1, peak: 1, cheeks: 1 });
      if (/crested/.test(id)) return helm(st, { cap: 1, crest: C.red, nasal: 1, cheeks: 1 });
      if (/spangen/.test(id)) return helm(st, { cap: 1, bands: MAT.bronze, nasal: 1, cheeks: 1 });
      if (/nasal/.test(id)) return helm(st, { cap: 1, nasal: 1, aventail: { m: MAT.iron, r: C.iron, t: 'mail' } });
      if (/skull/.test(id)) return helm({ m: MAT.bone, r: C.bone, t: 'plate' }, { deep: 1, eyes: 1, horns: 1, w: 13 });
      if (/orc_warhelm/.test(id)) return helm(st, { deep: 1, horns: 1, face: 'T' });
      if (/horned/.test(id)) return helm(/orc/.test(id) ? st : { m: MAT.iron, r: C.iron, t: 'plate' }, { cap: 1, horns: 1, nasal: 1, bands: /orc/.test(id) ? null : MAT.bronze, aventail: /orc/.test(id) ? null : { r: C.leather, t: 'leather' } });
      if (/great_bone/.test(id)) return helm(st, { deep: 1, face: 'T', horns: 1 });
      if (/rune_graven/.test(id)) return helm(st, { deep: 1, face: 'T', comb: 1 });
      return helm(st, { cap: 1, nasal: pl });
    }
    if (slot === 'bodyBase' || slot === 'bodyMid' || slot === 'bodyOuter') {
      const robe = /robe/.test(id);
      return body(st, { ...cutOf(id), flank: /bodybase/.test(id), beltM: mt ? MAT.iron : MAT.bronze, pecs: pl && !st.crude, faulds: pl && /plate|cuirass|ceremonial|warplate/.test(id), pauldrons: pl && /plate|ceremonial|warplate|half/.test(id) && !/breastplate/.test(id), ridge: pl && !st.crude, rivets: /plated_jack|scrap|half_plate/.test(id) ? MAT.iron : null, plates: /bone_plated/.test(id) ? { m: MAT.bone } : /plated_jack/.test(id) ? { m: MAT.iron, rivet: MAT.iron } : /layered|cave_bear_plate/.test(id) ? { m: C.dark, rivet: MAT.bronze } : null, spikes: /orc|gnoll/.test(id) ? MAT.orc : null, open: /regal|arcane|silk/.test(id), split: /hauberk/.test(id), trimHem: robe || /regal|ceremonial|rune/.test(id), furCollar: !!fur, cuffFur: !!fur, lacing: /jerkin|vest|harness|doublet/.test(id) && !mt, wa: /robe/.test(id) ? 12 : 11 });
    }
    if (slot === 'bracers') return pair(st, 'bracer', { straps: st.t !== 'plate' && st.t !== 'mail' && !fur, lace: !!fur });
    if (slot === 'greaves') return /hose/.test(id) ? legs(st) : /skirt/.test(id) ? legs(st, { skirt: 1 }) : pair(st, 'greave', { knee: pl || st.t === 'bone' || st.t === 'splint', straps: st.t === 'leather' || st.t === 'splint' || st.t === 'sticks' || !!fur, gap: !!fur && !/hippogriff/.test(id) });
    if (slot === 'gloves') return pair(st, 'glove', { knuckle: pl, mitt: /mitts/.test(id), fingers: /three_finger/.test(id) ? 3 : 0 });
    if (slot === 'boots' || slot === 'socks') return pair(/shod/.test(id) ? { r: C.leather, t: 'leather' } : st, 'boot', { sole: /shod/.test(id) ? MAT.iron : pl ? st.m : C.dark, straps: /wraps|sandals|hide/.test(id), ankle: !!fur });
    return null;
  };
  makers.push(o => o.group === 'Armor' ? armor(o) : null);
})();
