'use strict';
const ANIME_HAIR = {
  brown: R('#2a1810 #4a2c1a #744a28 #a06c3a #d09a5a'),
  fair: R('#6a4a14 #a07a20 #d4a830 #f0cc58 #fff0a0'),
  black: R('#0e0c14 #1c1a26 #302e40 #4a4a62 #8088a8'),
  red: R('#4a0e0e #7e1c14 #b83418 #e05a24 #ffa050'),
  copper: R('#40180c #6e2c12 #a24a1c #d0702c #f6a854'),
  white: R('#5a6070 #8a92a0 #bcc4cc #e4e8ec #ffffff'),
  grey: R('#2e3038 #4c5058 #747880 #9ca0a6 #d0d4d6'),
  blue: R('#101c4a #1c3078 #2c50b0 #4c7ce0 #9cc0ff'),
  teal: R('#0a3a34 #12645a #1e9a80 #3cd0a0 #a0f8d0'),
  pink: R('#4a1030 #801c50 #c03878 #f070a0 #ffc0d8'),
  violet: R('#24104a #401c7c #6a34b4 #9a5ce0 #d0a8ff'),
};
const ANIME_VIVID = ['blue', 'teal', 'pink', 'violet'];
const ANIME_STYLES = {
  short: { vol: 1, top: 2, side: .5, fringe: [2, 3, 1, 3, 2, 1, 3], tufts: [[-15, 2, 1.4], [25, 3, 1.6], [60, 4, 1.8], [95, 3, 1.6], [125, 4, 1.8], [160, 3, 1.6], [195, 2, 1.4]] },
  crop: { vol: 0, top: 1, side: .32, fringe: [0, 1, 0, 0, 1], tufts: [] },
  long: { vol: 1, top: 2, side: 1.05, fringe: [3, 2, 3, 1, 2, 3, 2], tufts: [[75, 2, 1.5], [115, 2, 1.4]], back: 1 },
  bun: { vol: 1, top: 1, side: .55, fringe: [2, 1, 2, 2, 1], tufts: [], extra: 'bun' },
  ponytail: { vol: 1, top: 2, side: .55, fringe: [2, 3, 2, 1, 3], tufts: [[70, 2, 1.5], [110, 2, 1.5]], extra: 'ponytail' },
  braids: { vol: 1, top: 1, side: .62, fringe: [2, 2, 1, 2, 2], tufts: [], extra: 'braids' },
  topknot: { vol: 0, top: 1, side: .4, fringe: [1, 0, 1, 1, 0], tufts: [], extra: 'topknot' },
  curls: { vol: 2, top: 2, side: .72, fringe: [2, 3, 2, 3, 2], tufts: [[0, 2, 2.2], [35, 2, 2.2], [70, 2, 2.2], [105, 2, 2.2], [140, 2, 2.2], [180, 2, 2.2], [215, 2, 2], [-35, 2, 2]], round: true },
  pigtails: { vol: 1, top: 2, side: .55, fringe: [3, 2, 3, 2, 3], tufts: [[90, 2, 1.5]], extra: 'twintails' },
  fringe: { vol: 1, top: 2, side: .8, fringe: [3, 3, 3, 3, 3], tufts: [] },
  mohawk: { vol: 0, top: 0, side: .25, fringe: [0, 0, 0], tufts: [], extra: 'mohawk', shaved: true },
  bald: { vol: 0, top: 0, side: 0, fringe: [0], tufts: [], none: true },
};
function headRows(headH, female) {
  const R = headH * .46, taper = female ? .62 : .4, rows = [];
  for (let j = 0; j < headH; j++) {
    const ny = (j + .5) / headH * 2 - 1, round = Math.pow(1 - Math.pow(Math.abs(ny), 2.6), 1 / 2.6);
    rows.push(Math.max(1, Math.round(R * round * (ny > .3 ? 1 - (ny - .3) / .7 * taper : 1))));
  }
  return rows;
}

function animeFrame(look, pose) {
  const b = look.body, female = look.sex === 'female', H = Math.max(24, b.legs + b.tl + b.hh), k = H / 32, g = clamp(Math.pow(b.build, .7), .7, 1.5);
  const headH = clamp(Math.round(14 * Math.pow(k, .55)), 11, 18), rows = headRows(headH, female), R = Math.max(...rows);
  const rest = H - headH + 1, L = Math.max(5, Math.round(rest * .47)), T = rest - L, wide = k * g;
  const sh = clamp(Math.round((female ? 3.1 : 4.1) * wide), 2, 11), wh = Math.max(2, sh - (g < 1.25 ? 1 : 0)), hp = female ? sh + (k >= .85 ? 1 : 0) : wh;
  const aw = clamp(Math.round((female ? 1.9 : 2.4) * Math.sqrt(k) * Math.pow(g, .8)), 2, 4), lw = clamp(Math.round((female ? 2.3 : 2.8) * Math.sqrt(k) * Math.pow(g, .6)), 2, 5);
  const cx = RG.CX, base = RG.BASE, legTop = base - L + 1, torsoTop = legTop - T - pose.br, headTop = torsoTop - headH + 1;
  const eyeW = headH >= 16 ? 3 : 2, eyeOff = Math.max(2, Math.round(R * .5)), eyeTop = headTop + Math.round(headH * .52), eyeRows = 3;
  return { female, H, k, g, headH, rows, R, L, T, sh, wh, hp, aw, lw, cx, base, legTop, torsoTop, headTop, eyeW, eyeOff, eyeTop, eyeRows, eyeBottom: eyeTop + eyeRows - 1, belt: T - 2, gap: k > 1.2 ? 2 : 1, pose, size: clamp(k, .7, 1.7) };
}

function animeColours(look) {
  const skin = skinOf(look), sn = skin.length - 1, cloth = DYES[look.garb], cn = cloth.length - 1;
  const hair = ANIME_HAIR[look.vividHair || look.hair] || ANIME_HAIR.brown, m = look.marks;
  const iris = m.dragonEyes ? P.gold[4] : m.beastEyes ? P.gold[3] : m.murkEyes ? P.frost[5] : EYES[look.eyes].col === P.ink ? [70, 50, 44] : EYES[look.eyes].col;
  return { skin, sk: k => skin[clamp(sn - k, 0, sn)], cloth, cl: k => cloth[clamp(cn - k, 0, cn)], hair, hose: HOSE[look.legwear], iris, pupil: iris.map(v => v * .32) };
}

function animeLegs(pen, F, look, C) {
  const { cx, base, legTop, lw, L, gap } = F, boot = Math.min(L - 1, F.H > 44 ? 4 : 3), hn = C.hose.length - 1;
  for (const sd of [-1, 1]) for (let y = legTop; y <= base; y++) {
    const booted = y > base - boot, ramp = booted ? P.leather : C.hose, n = ramp.length - 1, flare = booted ? 1 : 0, w = lw + flare;
    const x0 = sd < 0 ? cx - gap - lw + 1 - flare : cx + gap;
    for (let i = 0; i < w; i++) {
      const lit = sd < 0 ? i < Math.ceil(w / 2) : i === 0 && w > 2;
      pen.put(x0 + i, y, ramp[clamp((booted ? n - 2 : hn - 2) - (lit ? 0 : 1) - (y === base ? 1 : 0) + (booted && y === base - boot + 1 && lit ? 2 : 0), 0, n)]);
    }
    if (y === base) pen.put(sd < 0 ? x0 - 1 : x0 + w, y, P.leather[1]);
  }
}

function torsoHalf(F, r) {
  const { T, sh, wh, hp, belt } = F;
  if (r <= 0) return Math.max(2, sh - 1);
  if (r >= T) return hp;
  if (r >= belt) return wh;
  return Math.round(sh + (wh - sh) * Math.max(0, (r - 2) / Math.max(1, belt - 2)));
}

function animeTorso(pen, F, look, C) {
  const { cx, torsoTop, T, belt, female, legTop, L, base, hp } = F, hooded = look.hat === 'hood' || look.hat === 'coif';
  for (let r = 0; r <= T + 1; r++) {
    const y = torsoTop + r, h = torsoHalf(F, r);
    for (let x = cx - h; x <= cx + h; x++) {
      const u = (x - cx + h) / (2 * h), tone = (u < .34 ? 1 : u < .75 ? 2 : 3) + (r === 1 && Math.abs(x - cx) <= 2 ? 1 : 0);
      pen.put(x, y, r === belt ? (x === cx ? P.gold[4] : P.leather[u < .5 ? 3 : 2]) : C.cl(tone));
    }
  }
  if (female) {
    const hem = base - 2, drop = Math.max(1, hem - legTop), flare = F.k < .8 ? 1 : 2;
    for (let y = legTop; y <= hem; y++) {
      const h = hp + Math.round((y - legTop) / drop * flare);
      for (let x = cx - h; x <= cx + h; x++) {
        const u = (x - cx + h) / (2 * h), fold = y > legTop + 2 && Math.abs(x - cx) % 3 === 2 ? 1 : 0;
        pen.put(x, y, y === hem ? (look.trim ? look.trim[3] : C.cl(4)) : C.cl((u < .3 ? 1 : u < .72 ? 2 : 3) + fold));
      }
    }
    if (look.apron) for (let y = legTop; y <= hem - 2; y++) for (let x = cx - Math.max(1, hp - 2); x <= cx + Math.max(1, hp - 2); x++) pen.put(x, y, P.cloth[y === hem - 2 ? 3 : x < cx ? 5 : 4]);
    const chest = T >= 8 ? 2 : 1, full = look.body.build >= 1.3 ? 2 : 1;
    if (!hooded) {
      for (const [r, half] of [[0, 1], [1, 1]]) for (let x = cx - half; x <= cx + half; x++) pen.put(x, torsoTop + r, C.sk(x < cx ? 1 : 2));
      for (const x of [cx - 2, cx + 2]) pen.put(x, torsoTop + 1, P.cloth[5]);
      for (let x = cx - 1; x <= cx + 1; x++) pen.put(x, torsoTop + 2, P.cloth[x === cx ? 4 : 5]);
    }
    for (let r = chest + 1; r <= chest + full; r++) { for (const x of [cx - 2, cx - 1]) pen.put(x, torsoTop + r, C.cl(0)); for (const x of [cx + 1, cx + 2]) pen.put(x, torsoTop + r, C.cl(1)); pen.put(cx, torsoTop + r, C.cl(3)); }
    for (let x = cx - 2; x <= cx + 2; x++) pen.put(x, torsoTop + chest + full + 1, C.cl(x < cx ? 3 : 4));
  } else {
    const hem = legTop + Math.max(2, Math.round(L * .3));
    for (let y = legTop; y <= hem; y++) for (let x = cx - hp; x <= cx + hp; x++) pen.put(x, y, y === hem ? (look.trim ? look.trim[3] : C.cl(4)) : C.cl(x - cx < -hp * .3 ? 1 : x - cx < hp * .5 ? 2 : 3));
    pen.put(cx, torsoTop, C.sk(2)); pen.put(cx, torsoTop + 1, C.sk(2));
    if (look.pouch) pen.rect(cx + Math.max(1, hp - 2), legTop, 2, 2, P.leather[3]);
  }
}

function animeArms(pen, F, look, C) {
  const { cx, sh, aw, torsoTop, T, female } = F, len = Math.max(3, T - 1), long = look.sleeves === 'long', bend = Math.ceil(len * .5);
  for (const sd of [-1, 1]) {
    if (sd < 0 && look.marks.oneArm) continue;
    for (let j = 0; j < len + 2; j++) {
      const y = torsoTop + 1 + j, out = Math.round(j / (len + 1) * 2), x0 = sd < 0 ? cx - sh - aw - out : cx + sh + 1 + out, hand = j >= len, sleeved = long ? j < len - 1 : j < bend, cuff = long ? j === len - 1 : j === bend;
      for (let i = 0; i < aw; i++) {
        if (j === 0 && (sd < 0 ? i === 0 : i === aw - 1)) continue;
        const outer = sd < 0 ? i === 0 : i === aw - 1;
        pen.put(x0 + i, y, sleeved ? C.cl(sd < 0 ? (outer ? 1 : 2) : (outer ? 3 : 2)) : cuff ? (female ? P.cloth[5] : C.cl(4)) : C.sk(hand ? (sd < 0 ? 0 : 1) : sd < 0 ? (outer ? 1 : 2) : 2));
      }
    }
  }
}

function animeHead(pen, F, look, C) {
  const { cx, headTop, rows, R, eyeTop, eyeBottom, eyeOff, eyeRows, eyeW, female, pose } = F, m = look.marks;
  rows.forEach((h, j) => { for (let x = cx - h; x <= cx + h; x++) pen.put(x, headTop + j, C.sk(x - cx >= h - 1 && x - cx >= R - 2 || j >= rows.length - 2 && x - cx >= h - 1 ? 2 : x - cx <= -R + 2 && j > rows.length * .4 && j < rows.length * .75 ? 0 : 1)); });
  for (const sd of [-1, 1]) for (const y of [eyeTop + 1, eyeTop + 2]) pen.put(cx + sd * (R + 1), y, C.sk(sd < 0 ? 1 : 2));
  if (m.blind) return;
  for (const sd of [-1, 1]) {
    const x = sd < 0 ? cx - eyeOff - eyeW + 1 : cx + eyeOff, shut = pose.blink || (sd < 0 && m.oneEye), lash = female ? C.pupil : C.hair[0];
    if (shut) { for (let i = 0; i < eyeW; i++) pen.put(x + i, eyeBottom - 1, lash); continue; }
    for (let i = 0; i < eyeW; i++) pen.put(x + i, eyeTop - 1, lash);
    if (female) pen.put(sd < 0 ? x - 1 : x + eyeW, eyeTop, lash);
    for (let r = 0; r < eyeRows; r++) for (let i = 0; i < eyeW; i++) {
      const shine = r === 0 && i === (pose.glance < 0 ? eyeW - 1 : 0), low = r === eyeRows - 1;
      pen.put(x + i, eyeTop + r, shine ? [255, 255, 255] : low ? (i === 0 ? C.iris : C.iris.map(v => v * .62)) : C.pupil);
    }
    if (look.oddEye && sd > 0) { pen.put(x, eyeBottom, EYES[look.oddEye].col); pen.put(x + 1, eyeBottom, EYES[look.oddEye].col.map(v => v * .62)); }
  }
  const mouthY = Math.min(headTop + rows.length - 2, eyeBottom + 2);
  if (female) { pen.put(cx, mouthY, blend(C.sk(2), ROSE, .6)); for (const sd of [-1, 1]) pen.put(cx + sd * (eyeOff + 1), eyeBottom + 1, blend(C.sk(1), ROSE, .32)); }
  else { pen.put(cx - 1, mouthY, C.sk(3)); pen.put(cx, mouthY, C.sk(3)); }
  animeBeard(pen, F, look, C, mouthY);
}

function animeBeard(pen, F, look, C, mouthY) {
  const { cx, headTop, rows, eyeBottom } = F, hair = C.hair, skinSet = new Set(C.skin), chin = headTop + rows.length - 1;
  if (look.beard === 'none' || F.female) return;
  if (look.beard === 'stubble') { for (let y = eyeBottom + 1; y <= chin; y++) for (let x = cx - 5; x <= cx + 5; x++) if (skinSet.has(pen.get(x, y)) && (x + y) % 2 === 0) pen.put(x, y, C.sk(3)); return; }
  if (look.beard === 'moustache' || look.beard === 'goatee') for (let x = cx - 2; x <= cx + 1; x++) pen.put(x, mouthY - 1, hair[1]);
  if (look.beard === 'goatee') for (let y = mouthY + 1; y <= chin + 1; y++) for (let x = cx - 1; x <= cx; x++) pen.put(x, y, hair[y === chin + 1 ? 1 : 2]);
  if (look.beard === 'full' || look.beard === 'braided') {
    for (let y = eyeBottom + 1; y <= chin + 2; y++) for (let x = cx - 6; x <= cx + 6; x++) {
      const onFace = skinSet.has(pen.get(x, y)), under = y > chin && Math.abs(x - cx) <= 3 - (y - chin);
      if ((onFace && !(y === mouthY && Math.abs(x - cx + .5) < 1.5) && (y > eyeBottom + 1 || Math.abs(x - cx) >= 3)) || under) pen.put(x, y, hair[x - cx > 2 || y > chin ? 1 : x - cx < -2 ? 3 : 2]);
    }
    if (look.beard === 'braided') { for (let y = chin + 3; y <= chin + 6; y++) pen.put(cx, y, hair[y % 2 ? 2 : 1]); pen.put(cx, chin + 7, look.trim ? look.trim[3] : P.gold[3]); }
  }
}

function hairShape(F, st, seed) {
  const { cx, headTop, R, headH } = F, hy = headTop + R, mask = new Set(), key = (x, y) => y * RG.W + x, sideY = headTop + Math.round(headH * st.side);
  for (let y = headTop - st.top - 2; y <= sideY; y++) for (let x = cx - R - st.vol - 1; x <= cx + R + st.vol + 1; x++) {
    const dx = x - cx, dy = y - hy;
    if (Math.hypot(dx / (R + .6 + st.vol), dy / (R + .6 + (dy < 0 ? st.top : st.vol))) <= 1) mask.add(key(x, y));
  }
  st.tufts.forEach(([deg, len, width], i) => {
    const a = (deg + (hash(seed, i, 71) - .5) * 14) * Math.PI / 180, grow = F.headH / 14, ox = cx + Math.cos(a) * (R + st.vol - .5), oy = hy - Math.sin(a) * (R + (Math.sin(a) > 0 ? st.top : st.vol) - .5);
    for (let t = 0; t <= len * grow; t += .5) {
      const px = ox + Math.cos(a) * t, py = oy - Math.sin(a) * t + (st.round ? 0 : t * t * .04), half = st.round ? width * .55 : width * (1 - t / (len * grow + .5));
      for (let yy = Math.floor(py - half); yy <= Math.ceil(py + half); yy++) for (let xx = Math.floor(px - half); xx <= Math.ceil(px + half); xx++) if (Math.hypot(xx - px, yy - py) <= half + .15) mask.add(key(xx, yy));
    }
  });
  return { has: (x, y) => mask.has(key(x, y)), sideY };
}

function animeHair(pen, F, look, C) {
  const { cx, headTop, R, headH, pose } = F, st = ANIME_STYLES[look.style] || ANIME_STYLES.short, hair = C.hair, seed = seedOf(look.id + ':hair') % 7;
  if (st.none) return;
  const shape = hairShape(F, st, seed), brow = headTop + Math.round(headH * .3), at = dx => st.fringe[(dx + 40 + seed) % st.fringe.length];
  const fringeY = dx => brow + Math.round(at(dx) * headH / 14), faceHalf = R - (st.vol ? 2 : 1), skinSet = new Set(C.skin);
  const isHair = (x, y) => shape.has(x, y) && !(y >= fringeY(x - cx) && Math.abs(x - cx) <= faceHalf);
  for (let y = headTop - st.top - 8; y <= shape.sideY; y++) for (let x = cx - R - st.vol - 8; x <= cx + R + st.vol + 8; x++) {
    if (!isHair(x, y)) continue;
    if (st.shaved) { if ((x + y) % 2) pen.put(x, y, hair[1]); continue; }
    const dx = x - cx, dy = y - (headTop + R), zig = (x + seed) % 3 === 0 ? .2 : (x + seed) % 3 === 1 ? -.12 : 0;
    const lightness = dx / (R + st.vol) * .8 + dy / (R + st.top) + zig;
    let tone = lightness < -.72 ? 3 : lightness < .2 ? 2 : 1;
    if (Math.abs(dx + R * .35) <= 2 && Math.abs(dy + R * .62 + st.top * .3) <= 1 && (x + y) % 2 === 0) tone = 4;
    if (dy > -2 && !isHair(x, y + 1)) tone = 1;
    if (y >= brow - 1 && Math.abs(dx) <= faceHalf && at(dx) < at(dx + 1)) tone = Math.min(tone, 1);
    pen.put(x, y, hair[tone]);
  }
  for (let x = cx - faceHalf; x <= cx + faceHalf; x++) { const y = fringeY(x - cx); if (skinSet.has(pen.get(x, y)) && y < F.eyeTop - 1) pen.put(x, y, C.sk(2)); }
  const tie = look.trim ? look.trim[3] : P.red[3], sway = Math.round(pose.wave(.1));
  if (st.extra === 'bun') { for (let j = -3; j <= 0; j++) for (let i = -2; i <= 2; i++) if (Math.abs(i) + Math.abs(j + 1.5) < 3.2) pen.put(cx + i, headTop - st.top - 1 + j, hair[i > 0 || j === 0 ? 1 : j < -1 && i < 0 ? 3 : 2]); }
  if (st.extra === 'topknot') { pen.rect(cx - 1, headTop - 4, 3, 2, hair[2]); pen.put(cx - 1, headTop - 4, hair[3]); pen.put(cx + 1, headTop - 3, hair[1]); pen.rect(cx - 1, headTop - 2, 3, 1, tie); }
  if (st.extra === 'mohawk') for (let x = cx - 1; x <= cx + 1; x++) for (let y = headTop - 5 + Math.abs(x - cx); y <= headTop + 3; y++) pen.put(x, y - ((y + x) % 3 === 0 && y < headTop - 2 ? 1 : 0), hair[x > cx ? 1 : y < headTop - 2 ? 3 : 2]);
  if (st.extra === 'braids') for (const sd of [-1, 1]) { const x = cx + sd * (R - 1), end = F.torsoTop + Math.round(F.T * .6); for (let y = headTop + headH - 4; y <= end; y++) { pen.put(x + (y > F.torsoTop + 1 ? sway : 0), y, hair[y % 2 ? 2 : 1]); if (y % 2) pen.put(x + sd + (y > F.torsoTop + 1 ? sway : 0), y, hair[1]); } pen.put(x + sway, end + 1, tie); }
}

function animeBackHair(pen, F, look, C) {
  const { cx, headTop, R, headH, torsoTop, T, pose } = F, st = ANIME_STYLES[look.style] || ANIME_STYLES.short, hair = C.hair, sway = Math.round(pose.wave(.1));
  if (look.hat === 'hood' || look.hat === 'coif') return;
  if (st.back) {
    const end = torsoTop + Math.round(T * st.back) - 1;
    for (let y = headTop + R; y <= end; y++) for (let x = cx - R - st.vol; x <= cx + R + st.vol; x++) {
      const dx = x - cx, low = y > torsoTop + 2 ? sway : 0, ragged = end - (Math.abs(dx) % 3 === 1 ? 2 : 0) - (Math.abs(dx) >= R + st.vol ? 3 : 0);
      if (y <= ragged) pen.put(x + low, y, hair[dx > 1 ? 1 : (dx + y) % 4 === 0 ? 1 : dx < -R + 2 ? 3 : 2]);
    }
  }
  const tie = look.trim ? look.trim[3] : P.red[3];
  if (st.extra === 'ponytail') { const len = Math.round(headH * .6 + T * .7); for (let i = 0; i < len; i++) { const t = i / len, x = cx + R + 1 + Math.round(Math.sin(t * 2.2) * 3) + (t > .5 ? sway : 0), y = headTop + 2 + i, w = t < .6 ? 3 : t < .85 ? 2 : 1; for (let k = 0; k < w; k++) pen.put(x + k, y, hair[k === w - 1 ? 1 : k === 0 && t < .5 ? 3 : 2]); } pen.rect(cx + R, headTop + 2, 2, 2, tie); }
  if (st.extra === 'twintails') for (const sd of [-1, 1]) { const len = Math.round(headH * .4 + T * .8); for (let i = 0; i < len; i++) { const t = i / len, x = cx + sd * (R + 1 + Math.round(Math.sin(t * 2.4) * 2)) + (t > .5 ? sway : 0), y = headTop + 5 + i, w = t < .7 ? 3 : t < .9 ? 2 : 1; for (let k = 0; k < w; k++) pen.put(x + sd * k, y, hair[sd > 0 || k === w - 1 ? 1 : k === 0 ? 3 : 2]); } pen.rect(cx + sd * (R + 1) - (sd < 0 ? 1 : 0), headTop + 4, 2, 2, tie); }
}

function animeHeadwear(pen, F, look, C) {
  const { cx, headTop, R, headH } = F;
  if (look.hat === 'hood' || look.hat === 'coif') {
    const ramp = look.hat === 'coif' ? P.cloth : DYES[look.hood], n = ramp.length - 1, shape = hairShape(F, { vol: 1, top: 2, side: 1.1, tufts: [] }, 0);
    for (let y = headTop - 4; y <= headTop + headH + 1; y++) for (let x = cx - R - 3; x <= cx + R + 3; x++) {
      const dx = x - cx, open = y >= headTop + 4 && y <= headTop + headH - 2 && Math.abs(dx) <= R - 2, drape = y > headTop + headH - 2 && Math.abs(dx) <= R + 1;
      if ((shape.has(x, y) || drape) && !open) pen.put(x, y, ramp[clamp(n - (dx > R - 2 ? 3 : dx < -R + 3 ? 1 : 2) - (y >= headTop + 3 && Math.abs(dx) <= R - 1 ? 1 : 0), 0, n)]);
    }
  }
  if (look.hat === 'straw') {
    for (let y = headTop - 4; y <= headTop; y++) for (let x = cx - R + 2 + (y === headTop - 4 ? 1 : 0); x <= cx + R - 2 - (y === headTop - 4 ? 1 : 0); x++) pen.put(x, y, y === headTop ? P.red[2] : P.thatch[x > cx + 1 ? 3 : (x + y) % 2 ? 5 : 4]);
    for (let y = headTop + 1; y <= headTop + 2; y++) for (let x = cx - R - 4 + (y - headTop - 1); x <= cx + R + 4 - (y - headTop - 1); x++) pen.put(x, y, P.thatch[y === headTop + 2 ? 2 : (x & 1) ? 4 : 5]);
  }
}

function animeMarks(pen, F, look, C) {
  const { cx, headTop, R, headH, eyeTop, eyeBottom, eyeOff, torsoTop, T, legTop, sh, hp, aw, pose, size, base } = F, m = look.marks, skinIdx = new Map(C.skin.map((c, i) => [c, i])), sn = C.skin.length - 1;
  const each = f => { for (let y = 0; y < RG.H; y++) for (let x = 0; x < RG.W; x++) { const i = skinIdx.get(pen.get(x, y)); if (i !== undefined) f(x, y, i); } };
  if (m.scales >= 2) each((x, y, i) => { if ((x + ((y >> 1) & 1) * 2) % 4 === 0 && (m.scales >= 3 || hash(x, y, 11) > .5)) pen.put(x, y, C.skin[Math.max(0, i - 1)]); else if (m.scales >= 4 && hash(x, y, 13 + (pose.i >> 2)) > .93) pen.put(x, y, P.gold[4]); });
  if (m.chitin) each((x, y, i) => { if (y % 3 === 0) pen.put(x, y, C.skin[Math.max(0, i - 2)]); });
  if (m.ironSkin) each((x, y) => { if (!pose.still && ((x - y + pose.i * 5) % 60 + 60) % 60 < 2) pen.put(x, y, P.iron[6]); });
  if (m.leafSkin) each((x, y) => { if ((x + y) % 5 === 0) pen.put(x, y, P.hay[4]); });
  if (m.emberSkin) each((x, y) => { if (hash(x, y, 2 + (pose.i >> 1)) > (m.emberSkin >= 3 ? .8 : .93)) pen.put(x, y, pose.wave() > 0 ? P.gold[4] : P.ember[5]); });
  if (m.emberSkin >= 2 && !pose.still) for (let k = 0; k < (m.emberSkin >= 3 ? 3 : 1); k++) { const rise = (pose.u + k / 3) % 1; if (rise < .8) pen.under(cx + [-4, 3, 0][k] + Math.round(Math.sin(rise * TURN * 1.5 + k) * 1.5), headTop - 5 - Math.round(rise * 9), P.ember[rise < .4 ? 5 : rise < .65 ? 4 : 3]); }
  if (m.fur) { for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) for (let i = 0; i <= 3 - k; i++) pen.put(cx + sd * (R - 4 + i + (k >> 1)), headTop - 2 - k, i === 1 && k < 2 ? blend(C.sk(1), ROSE, .5) : C.hair[sd > 0 ? 1 : 2]); each((x, y, i) => { if (hash(x, y, 3) > .6 && (y > eyeBottom + 1 || Math.abs(x - cx) >= R - 1)) pen.put(x, y, C.hair[2]); }); }
  if (m.feathers) for (let x = cx - sh; x <= cx + sh; x++) if (hash(x, 1, 31) > .3) pen.put(x, torsoTop + (hash(x, 2, 31) > .5 ? 1 : 0), P.furWhite[x < cx ? 4 : 3]);
  if (m.horns) {
    const great = m.horns >= 4, len = m.horns === 2 ? 3 : great ? 11 : 6;
    for (const sd of [-1, 1]) for (let k = 0; k < len; k++) {
      const t = k / (len - 1), a = Math.PI * (.6 - 1.5 * t), x = great ? cx + sd * (R - 1 + Math.round(4 * Math.cos(a) + 1)) : cx + sd * (R - 2 + Math.round(k * .5)), y = great ? headTop + 1 - Math.round(4 * Math.sin(a)) : headTop - 1 - Math.round(k * .9);
      pen.put(x, y, P.bone[clamp(5 - Math.floor(t * 2) - (sd > 0 ? 1 : 0), 1, 5)]);
      if (great || t < .6) { pen.put(x - sd, y, P.bone[3]); if (great && t < .8) pen.put(x, y + 1, P.bone[k % 3 === 0 ? 2 : 4]); }
    }
  }
  if (m.tusks) for (const sd of [-1, 1]) for (let k = 0; k < Math.min(3, m.tusks); k++) pen.put(cx + sd * 2 - (sd > 0 ? 0 : 1) + (sd < 0 ? 1 : 0), eyeBottom + 2 - k, P.bone[5 - k]);
  if (m.fangs) for (const x of [cx - 1, cx + 1]) for (let k = 0; k < Math.min(2, m.fangs - 1 || 1); k++) pen.put(x, eyeBottom + 3 + k, P.bone[5]);
  if (m.spiderEyes) [[-eyeOff - 2, 1], [eyeOff + 2, 1], [-eyeOff, 3], [eyeOff, 3], [-1, -2], [1, -2]].slice(0, m.spiderEyes >= 4 ? 6 : m.spiderEyes >= 3 ? 4 : 2).forEach(([dx, dy], k) => { if (!(!pose.still && pose.i === (k * 2 + 1) % pose.n)) pen.put(cx + dx, eyeTop + dy, m.spiderEyes >= 4 ? P.red[2] : P.ink); });
  if (m.scar) for (let k = 0; k < 4; k++) pen.put(cx + eyeOff - 1 + (k >> 1), eyeTop - 1 + k + (k > 1 ? 1 : 0), C.sk(4));
  if (m.oneEye) { pen.rect(cx - eyeOff - 2, eyeTop - 1, 4, 4, P.leather[0]); pen.put(cx - eyeOff - 1, eyeTop, P.leather[2]); pen.line(cx - eyeOff + 2, eyeTop - 1, cx + R, headTop + 4, P.leather[1]); pen.line(cx - eyeOff - 2, eyeTop, cx - R, eyeTop, P.leather[1]); }
  if (m.blind) { const [shade, mid, light] = blindfoldCloth(C.skin); for (let x = cx - R; x <= cx + R; x++) { pen.put(x, eyeTop, x % 5 === 2 ? mid : light); pen.put(x, eyeTop + 1, Math.abs(x - cx) === R ? shade : mid); } }
  if (m.claws) for (const sd of [-1, 1]) for (let k = 0; k < Math.min(3, m.claws - 1); k++) for (const i of [0, aw - 1]) pen.under(cx + sd * (sh + 1 + 1) + (sd < 0 ? -aw : 0) + i + (sd > 0 ? 0 : 0), torsoTop + Math.max(3, T - 1) + 3 + k, P.bone[5 - k]);
  if (m.tail) { const col = m.fur ? C.hair : C.skin, n = col.length - 1, pts = [[hp, 1], [hp + 4, 4], [hp + 8, 3], [hp + 10, 0], [hp + 9, -3]].map(([dx, dy], j) => [cx + Math.round(dx * size) + (j > 1 ? Math.round(pose.wave(-j * .08) * (j - 1) * .7) : 0), legTop + Math.round(dy * size)]); pts.slice(1).forEach(([x1, y1], i) => { const [x0, y0] = pts[i]; for (let d = 0; d < (i < 2 ? 2 : 1); d++) pen.line(x0, y0 + d, x1, y1 + d, col[clamp(n - 1 - d, 0, n)], 0, true); }); if (m.fur) { const [tx, ty] = pts[pts.length - 1]; for (const [dx, dy] of [[0, 0], [-1, -1], [0, -1], [1, -1], [0, -2]]) pen.under(tx + dx, ty + dy, C.hair[3]); } }
  if (m.wings) {
    const great = look.from.wings === 'great-wings', beat = pose.wave(), leathery = (m.scales >= 3 || m.chitin || m.emberSkin >= 3) && !m.feathers, ramp = leathery ? C.skin : m.feathers ? P.furWhite : [P.furWhite, P.furGrey, P.furDark, P.hay][seedOf(look.id + ':plume') % 4], rn = ramp.length - 1;
    const span = Math.round((m.wings <= 3 ? 7 : great ? 23 : 17) * size), rise = Math.min(torsoTop - 4, (m.wings <= 3 ? 4 : Math.round(headH * (great ? 1.3 : 1))) + Math.round(beat * (m.wings <= 3 ? 1 : 2))), drop = Math.round((m.wings <= 3 ? 5 : T + F.L * .4)) - Math.round(beat * 2), wrist = Math.round(span * .6);
    for (const sd of [-1, 1]) for (let k = 0; k <= span; k++) {
      const x = cx + sd * (2 + k), top = k <= wrist ? Math.round(torsoTop + 2 - rise * k / wrist) : Math.round(torsoTop + 2 - rise + 4 * (k - wrist) / Math.max(1, span - wrist));
      let bottom = Math.max(top + 2, torsoTop + Math.round(drop * (1 - .55 * k / span)) - (k > wrist ? Math.round((k - wrist) * 1.2) : 0));
      if (k > 2 && (leathery ? k % 4 >= 2 : k & 1)) bottom -= leathery ? 2 : 1;
      for (let y = top; y <= bottom; y++) { const d = y - top; pen.under(x, y, leathery ? (d === 0 || k === wrist ? ramp[Math.max(0, rn - 3)] : ramp[clamp(rn - 1 - (d > (bottom - top) * .6 ? 1 : 0), 0, rn)]) : d < 2 ? ramp[rn] : y > bottom - 2 ? ramp[Math.max(0, rn - 3)] : ramp[clamp(rn - 1 - (k & 1), 0, rn)]); }
    }
  }
}

function animeOutline(s) {
  const { w, h, c } = s, add = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (c[y * w + x]) continue;
    const near = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h ? c[(y + dy) * w + x + dx] : null)).filter(Boolean);
    if (!near.length) continue;
    const dark = near.reduce((a, b) => (a[0] + a[1] + a[2] < b[0] + b[1] + b[2] ? a : b));
    add.push([y * w + x, [dark[0] * .34 + 6, dark[1] * .26 + 4, dark[2] * .36 + 12]]);
  }
  for (const [i, col] of add) c[i] = col;
}

function drawAnime(look, face, time) {
  const s = new Spr(RG.W, RG.H, RG.CX, RG.BASE), pose = idlePose(look, time), F = animeFrame(look, pose), C = animeColours(look), pen = canvasPen(s), hooded = look.hat === 'hood' || look.hat === 'coif';
  animeBackHair(pen, F, look, C);
  animeLegs(pen, F, look, C);
  animeTorso(pen, F, look, C);
  animeArms(pen, F, look, C);
  animeHead(pen, F, look, C);
  if (!hooded) animeHair(pen, F, look, C);
  animeHeadwear(pen, F, look, C);
  animeMarks(pen, F, look, C);
  animeOutline(s);
  s.pts = { hand: [F.cx + F.sh + 2, F.torsoTop + F.T], head: [F.cx, F.headTop - 3] };
  return s;
}
