'use strict';
const DBX = {
  list: [],
  byId: new Map(),
  byObj: new Map(),
  anchor: { tree: [16, 23], plant: [16, 23], crop: [16, 31], ore: [16, 23], site: [16, 23], building: [16, 23], creature: [16, 27], folk: [16, 27], item: [16, 23], ground: [0, 0] },
  seasons: ['summer', 'autumn', 'winter'],
  reg(cat, dbId, variant, make, meta) {
    const id = cat + '/' + dbId + '/' + variant;
    if (this.byId.has(id)) throw new Error('duplicate sprite id ' + id);
    const e = Object.assign({ id, cat, dbId, variant: String(variant), kind: 'sprite', origin: 'new', make }, meta || {});
    this.list.push(e); this.byId.set(id, e);
    const k = cat + '/' + dbId;
    if (!this.byObj.has(k)) this.byObj.set(k, []);
    this.byObj.get(k).push(e);
    return e;
  },
  seasonal(cat, dbId, seeds, make, meta) {
    for (const season of this.seasons) for (let i = 0; i < seeds; i++) this.reg(cat, dbId, season + '-' + i, () => make(i, season), meta);
  },
  tile(cat, dbId, variant, build, meta) {
    return this.reg(cat, dbId, variant, build, Object.assign({ kind: 'world' }, meta || {}));
  },
  of(cat, dbId) { return this.byObj.get(cat + '/' + dbId) || []; },
  concepts: [],
  concept(cat, dbId, c) { this.drop(cat, dbId); this.concepts.push(Object.assign({ cat, dbId }, c)); },
  conceptOf(o) { return this.concepts.find(c => c.cat === o.cat && c.dbId === o.id); },
  drop(cat, dbId) {
    const k = cat + '/' + dbId, l = this.byObj.get(k) || [];
    for (const e of l) this.byId.delete(e.id);
    this.list = this.list.filter(e => !l.includes(e));
    this.byObj.delete(k);
  },
  pick(cat, dbId, season) {
    const l = this.of(cat, dbId);
    return l.find(e => e.variant === season + '-0') || l.find(e => e.variant === 'summer-0') || l[0] || null;
  },
  built(e) { return e.out || (e.out = e.make()); },
  crop(o) {
    const r = renderWorld(o.world, { season: o.season || 'summer', roofs: o.roofs }), [x0, y0, w, h] = o.rect;
    const rgba = new Uint8ClampedArray(w * h * 4), emissive = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y0 + y) * r.W + x0 + x, c = r.alb32[p], i = (y * w + x) * 4;
      rgba[i] = c & 255; rgba[i + 1] = (c >> 8) & 255; rgba[i + 2] = (c >> 16) & 255; rgba[i + 3] = 255; emissive[y * w + x] = r.em[p];
    }
    const out = { w, h, rgba, emissive };
    if (o.post) o.post(out);
    return out;
  },
  bake(e) {
    if (e.baked) return e.baked;
    const o = this.built(e);
    let b;
    if (e.kind === 'world') {
      const px = this.crop(o);
      if (o.clear) { const base = this.crop(Object.assign({}, o, { world: o.clear })); for (let i = 0; i < px.w * px.h; i++) if (px.rgba[i * 4] === base.rgba[i * 4] && px.rgba[i * 4 + 1] === base.rgba[i * 4 + 1] && px.rgba[i * 4 + 2] === base.rgba[i * 4 + 2]) px.rgba[i * 4 + 3] = 0; }
      b = { id: e.id, w: px.w, h: px.h, ox: o.ox || 0, oy: o.oy || 0, rgba: px.rgba, emissive: px.emissive };
    } else {
      const s = o, a = e.at || this.anchor[e.cat] || [16, 23];
      let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1;
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.c[y * s.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) throw new Error('empty sprite ' + e.id);
      const w = x1 - x0 + 1, h = y1 - y0 + 1, rgba = new Uint8ClampedArray(w * h * 4), emissive = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = s.c[(y0 + y) * s.w + x0 + x]; if (!c) continue;
        const i = (y * w + x) * 4;
        rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255; emissive[y * w + x] = s.e[(y0 + y) * s.w + x0 + x];
      }
      b = { id: e.id, w, h, ox: a[0] - s.ax + x0, oy: a[1] - s.ay + y0, rgba, emissive };
      if (s.sh) b.shadow = { cx: a[0] + s.sh.dx, cy: a[1] + s.sh.dy, rx: s.sh.rx, ry: s.sh.ry, k: s.sh.k || 1 };
      if (s.emit) { b.light = Object.assign({}, s.emit, { x: a[0] + s.emit.dx, y: a[1] + s.emit.dy }); delete b.light.dx; delete b.light.dy; }
      if (s.sway) b.sway = s.sway;
    }
    return e.baked = b;
  },
  flat(w, h, id) { return new World(w, h, G[id]); },
  still(s) { return s.sway ? Object.assign(Object.create(Object.getPrototypeOf(s)), s, { sway: 0 }) : s; },
  seasonOf(e, fallback) { const s = e.variant.split('-')[0]; return this.seasons.includes(s) ? s : fallback || 'summer'; },
  skipReason(o) {
    if (this.conceptOf(o)) return 'concept, set aside for later';
    if (o.cat === 'building' && o.src.age === 'runed') return 'runed age, look undecided';
    return '';
  },
  backdrop: { tree: 'tree', plant: 'deep_grass', crop: 'tilled', ore: 'rocky', site: 'grass', building: 'dirt', creature: 'grass', folk: 'tall_grass', item: 'dirt' },
  scene(e, season, ground) {
    season = season || 'summer';
    if (e.view) return this.crop(e.view(season));
    if (e.kind === 'world') return this.crop(this.built(e));
    const s = this.built(e), a = e.at || this.anchor[e.cat] || [16, 23], W = Math.max(2, Math.ceil((s.w + 8) / 32)), H = Math.max(2, Math.ceil((s.h + 10) / 32));
    const w = this.flat(W, H, ground || e.ground || this.backdrop[e.cat] || 'grass');
    w.objs.push({ spr: this.still(s), x: W * 16 + (s.ax - (s.w >> 1)), y: H * 32 - 9 - (23 - a[1]) });
    return this.crop({ world: w, rect: [0, 0, W * 32, H * 32], season });
  },
};
