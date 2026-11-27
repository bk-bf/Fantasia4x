'use strict';
const CONCEPTS = (() => {
  const memo = {};
  const bare = src => {
    const s = new Spr(src.w, src.h, src.ax, src.ay), at = (x, y) => (x < 0 || y < 0 || x >= src.w || y >= src.h ? null : src.c[y * src.w + x]);
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = at(x, y);
      if (!c || (c === P.ink && (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)))) continue;
      s.set(x, y, c, src.e[y * src.w + x]);
    }
    return s;
  };
  const BREATH = [[3, 4, 2], [2, 3, 1], [0, 1, 1], [-1, 0, 0], [-1, -1, 0], [0, 0, 1], [1, 2, 2], [2, 3, 2]];
  const winded = kind => memo['wind' + kind] || (memo['wind' + kind] = (() => {
    const o = PAWNS[kind].o, f = FOLK[o.race || 'human'], src = pawn(kind), raw = bare(src), cx = 20, base = 51;
    const legTop = base - f.legs + 1, tTop = legTop - f.tl, hTop = tTop - f.hh, belt = tTop + f.tl - 2, x0 = cx - f.hw, x1 = cx + f.hw - 1, hx0 = cx - f.hd - 1, hx1 = cx + f.hd, er = hTop + Math.floor(f.hh * .5), cuff = base - 3;
    return BREATH.map(([d, hd, mouth]) => {
      const s = new Spr(src.w, src.h, src.ax, src.ay), n = Math.max(0, -d), top = belt - 3 - n;
      const move = (x, y, sx, sy) => { if (sy < 0 || sy >= raw.h) return; const c = raw.c[sy * raw.w + sx]; if (c) s.set(x, y, c, raw.e[sy * raw.w + sx]); };
      for (let x = 0; x < raw.w; x++) {
        if (x < x0 || x > x1) {
          for (let y = cuff + 1; y < raw.h; y++) move(x, y, x, y);
          for (let sy = 0; sy <= cuff; sy++) move(x, sy + d, x, sy);
          continue;
        }
        for (let y = 0; y < raw.h; y++) {
          const sy = y >= belt ? y : d >= 0 ? y - d : y < top ? y + n : belt - 3 + Math.floor((y - top) * 3 / (3 + n));
          if (sy >= tTop || x < hx0 || x > hx1) move(x, y, x, sy);
        }
      }
      for (let sy = 0; sy <= tTop + 1; sy++) for (let x = hx0; x <= hx1; x++) move(x, sy + hd, x, sy);
      if (mouth) s.rect(cx - 2, er + 3 + hd, 3, mouth, P.red[0]);
      s.set(cx - 4, er + 2 + hd, P.red[4]); s.set(cx + 3, er + 2 + hd, P.red[3]);
      s.outline(); s.sh = src.sh;
      return s;
    });
  })());
  const STAGE = [2, 2, 32, 56];
  const ground = (tw, th) => memo['ground' + tw + 'x' + th] || (memo['ground' + tw + 'x' + th] = DBX.crop({ world: DBX.flat(tw, th, 'tall_grass'), rect: [0, 0, tw * 32, th * 32], season: 'summer' }));
  const framesOf = c => c.cache || (c.cache = c.frames());
  const fit = fr => {
    let L = 0, R = 0, U = 0, D = 0;
    for (const s of fr) { L = Math.max(L, s.ax); R = Math.max(R, s.w - s.ax); U = Math.max(U, s.ay); D = Math.max(D, s.h - s.ay); }
    const tw = Math.max(2, Math.ceil((L + R + 12) / 32)), th = Math.max(2, Math.ceil((U + D + 14) / 32));
    return [tw, th, Math.round(tw * 16 + (L - R) / 2), th * 32 - 8 - D];
  };
  const stageOf = c => c.stage || (c.stage = fit(framesOf(c)));
  const draw = (cv, s, z, crop, stage) => {
    const [tw, th, ax, ay] = stage || STAGE, g = ground(tw, th), [cx, cy, w, h] = crop || [0, 0, g.w, g.h], px = new Uint8ClampedArray(w * h * 4), ox = ax - s.ax - cx, oy = ay - s.ay - cy;
    for (let y = 0; y < h; y++) px.set(g.rgba.slice(((y + cy) * g.w + cx) * 4, ((y + cy) * g.w + cx + w) * 4), y * w * 4);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const c = s.c[y * s.w + x], X = x + ox, Y = y + oy;
      if (!c || X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const i = (Y * w + X) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    cv.width = w; cv.height = h; cv.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0);
    if (z) { cv.style.width = w * z + 'px'; cv.style.height = h * z + 'px'; }
  };
  const list = [
    { id: 'winded_heave', name: 'Winded', note: 'concept for later', strip: [18, 18, 28, 42], about: 'The whole figure heaves while winded: shoulders and arms snap up on the inhale and sag on the exhale, the head dips at the bottom of each breath, the mouth opens and the cheeks flush. Eight frames, 0.105 s each. Set aside for later; the HUD shows winded as breath puffs at the mouth.', frames: () => winded('watch'), step: .105 }
  ];
  const live = new Set();
  for (const c of DBX.concepts) list.push(c);
  const play = (cv, c, z) => { const fr = framesOf(c), stage = stageOf(c); cv.c = c; cv.fr = fr; cv.z = z; cv.stage = stage; draw(cv, fr[0], z, null, stage); live.add(cv); };
  const loop = now => {
    requestAnimationFrame(loop);
    for (const cv of live) {
      if (!cv.isConnected) { live.delete(cv); continue; }
      const i = Math.floor(now / 1000 / cv.c.step) % cv.fr.length;
      if (cv.at !== i) { cv.at = i; draw(cv, cv.fr[i], 0, null, cv.stage); }
    }
  };
  requestAnimationFrame(loop);
  return { list, play, draw, framesOf, stageOf };
})();
