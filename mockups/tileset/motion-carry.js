'use strict';
const MOTION_LOAD = (() => {
  const DOZEN = 12, TILT_SPAN = 14, LOADS = new Map();
  const NOTES = { light: 'one hand at the hip, the usual walk', bulky: 'both arms in front, a shorter stride', heavy: 'slow and strained, on one shoulder or low in front' };
  const empty = (spr, i, j) => i < 0 || j < 0 || i >= spr.w || j >= spr.h || !spr.c[j * spr.w + i];
  const edged = (spr, i, j) => spr.c[j * spr.w + i] === P.ink && (empty(spr, i - 1, j) || empty(spr, i + 1, j) || empty(spr, i, j - 1) || empty(spr, i, j + 1));
  function put(pawn, layer) {
    const s = new Spr(pawn.w, pawn.h, pawn.ax, pawn.ay), { spr, grip, sag } = layer, [ax, ay] = pawn.pts.carry, placed = [], under = layer.fused ? pawn.bare : pawn;
    const body = pawn.parts.find(l => l.name === 'torso'), worn = body && body.cam > pawn.loadCam ? pawn.mask.map((m, q) => m || (pawn.c[q] && pawn.c[q] !== P.ink && !pawn.owner[q] ? 1 : 0)) : pawn.mask;
    const mask = layer.fused ? pawn.mask : worn.map((m, q) => m || (pawn.c[q] === P.ink && !pawn.owner[q] && [q - 1, q + 1, q - pawn.w, q + pawn.w].some(n => worn[n] === 1) ? 1 : 0));
    s.c = under.c.slice(); s.e = under.e.slice(); s.sh = pawn.sh; s.pts = { ...pawn.pts };
    const half = Math.max(grip[0], spr.w - 1 - grip[0], 1), whole = new Spr(pawn.w, pawn.h, pawn.ax, pawn.ay);
    for (let i = 0; i < spr.w; i++) {
      const X = ax - grip[0] + i, drop = Math.round(sag * ((i - grip[0]) / half) ** 2) + Math.round((i - grip[0]) * pawn.tilt / TILT_SPAN);
      for (let j = 0; j < spr.h; j++) {
        const row = layer.upside ? spr.h - 1 - j : j, c = spr.c[row * spr.w + i], Y = ay - grip[1] + j + drop, q = Y * s.w + X;
        const there = c && s.ok(X, Y) && !(layer.rows && (j < layer.rows[0] || j >= layer.rows[1])) && !(pawn.floor != null && Y > pawn.floor) && !(layer.fused && edged(spr, i, row));
        if (there) whole.c[q] = c;
        if (!there || mask[q]) continue;
        s.c[q] = c; s.e[q] = spr.e[row * spr.w + i]; placed.push(q);
      }
    }
    Object.assign(s, { parts: pawn.parts, owner: pawn.owner, layers: pawn.layers, loadCam: pawn.loadCam });
    if (pawn.layers) s.loadLayer = { name: 'load', cam: pawn.loadCam, spr: whole };
    const lined = layer.fused ? s.outline() : s;
    return pawn.styled ? pawn.styled(lined) : lined;
  }
  function init(objects) {
    for (const o of objects) if (o.cat === 'item' && DBX.of('item', o.id).length) LOADS.set(o.id, HAUL.of(o));
  }
  const all = () => [...LOADS.values()].filter(l => !l.tooLarge);
  const tooLarge = () => [...LOADS.values()].filter(l => l.tooLarge);
  function byStorage(pick) {
    const groups = new Map();
    for (const l of all().filter(pick)) { if (!groups.has(l.storage)) groups.set(l.storage, []); groups.get(l.storage).push(l); }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }
  const middle = list => list[list.length >> 1];
  const picker = () => HAUL.BULKS.map(bulk => ({ bulk, loads: byStorage(l => l.bulk === bulk).map(([, list]) => middle(list)) }));
  function dozen(bulk) {
    const groups = byStorage(l => l.bulk === bulk).map(([, list]) => list), out = [];
    for (let round = 0; out.length < DOZEN && groups.some(g => g.length > round); round++) for (const g of groups) if (g.length > round && out.length < DOZEN) out.push(g[Math.floor(round * g.length / Math.max(2, DOZEN / groups.length))] || g[round]);
    return [...new Set(out)];
  }
  const tally = () => HAUL.tally(all());
  return { put, init, get: id => LOADS.get(id), picker, dozen, tally, tooLarge, NOTES };
})();
