'use strict';
const MOTION_LOAD = (() => {
  const RIM = .62, DOZEN = 12, LOADS = new Map();
  const NOTES = { light: 'one hand, the usual walk', bulky: 'both arms at the chest, a shorter stride', heavy: 'on the shoulders, bent and slow' };
  function put(pawn, layer) {
    const s = new Spr(pawn.w, pawn.h, pawn.ax, pawn.ay), { spr, grip, sag } = layer, [ax, ay] = pawn.pts.carry, mask = pawn.mask, placed = [];
    s.c = pawn.c.slice(); s.e = pawn.e.slice(); s.sh = pawn.sh; s.pts = { ...pawn.pts };
    const half = Math.max(grip[0], spr.w - 1 - grip[0], 1);
    for (let i = 0; i < spr.w; i++) {
      const X = ax - grip[0] + i, drop = Math.round(sag * ((i - grip[0]) / half) ** 2);
      for (let j = 0; j < spr.h; j++) {
        const c = spr.c[j * spr.w + i], Y = ay - grip[1] + j + drop, q = Y * s.w + X;
        if (!c || !s.ok(X, Y) || mask[q]) continue;
        s.c[q] = c; s.e[q] = spr.e[j * spr.w + i]; placed.push(q);
      }
    }
    const covered = n => mask[n] && pawn.c[n] !== P.ink;
    for (const q of placed) if (s.c[q] !== P.ink && [q - 1, q + 1, q - s.w, q + s.w].some(covered)) s.c[q] = dark(s.c[q], RIM);
    return s;
  }
  function init(objects) {
    for (const o of objects) if (o.cat === 'item' && DBX.of('item', o.id).length) LOADS.set(o.id, HAUL.of(o));
  }
  const all = () => [...LOADS.values()];
  const inBulk = bulk => all().filter(l => l.bulk === bulk);
  function byStorage(bulk) {
    const groups = new Map();
    for (const l of inBulk(bulk)) { if (!groups.has(l.storage)) groups.set(l.storage, []); groups.get(l.storage).push(l); }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }
  const middle = list => list[list.length >> 1];
  const picker = () => HAUL.BULKS.map(bulk => ({ bulk, loads: byStorage(bulk).map(([, list]) => middle(list)) }));
  function dozen(bulk) {
    const groups = byStorage(bulk).map(([, list]) => list), out = [];
    for (let round = 0; out.length < DOZEN && groups.some(g => g.length > round); round++) for (const g of groups) if (g.length > round && out.length < DOZEN) out.push(g[Math.floor(round * g.length / Math.max(2, DOZEN / groups.length))] || g[round]);
    return [...new Set(out)];
  }
  const tally = () => HAUL.tally(all());
  return { put, init, get: id => LOADS.get(id), picker, dozen, tally, NOTES };
})();
