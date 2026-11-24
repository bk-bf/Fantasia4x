'use strict';
const HAUL = (() => {
  const BULKS = ['light', 'bulky', 'heavy'];
  const AT_LEAST = [['heavy', { kg: 20, litres: 25 }], ['bulky', { kg: 5, litres: 6 }]];
  const PILE_BULK = { logs: 'heavy', planks: 'heavy', blocks: 'heavy', rubble: 'bulky', heap: 'bulky', bars: 'bulky', sacks: 'bulky', crates: 'bulky', baskets: 'bulky', bundles: 'bulky', hides: 'bulky', fluids: 'light', meat: 'light', cloth: 'light', pots: 'light' };
  const WORN_BULK = { torso: 'bulky', cuirass: 'bulky', pack: 'bulky', shield: 'bulky', hauler: 'heavy', body: 'heavy' };
  const BULK_OF_ITEM = {};
  const LIMP = { pile: ['meat', 'hides'], worn: ['body'] };
  const SAG = { light: 0, bulky: 2, heavy: 4 };
  const WORN_SOURCES = ['map-carry', 'map-ground', 'map-pile-1', 'map', '0'];
  const UPRIGHT_FOOT = 10;

  const storageOf = k => k.pile || k.long || k.worn;
  const familyOf = k => k.pile ? 'pile' : k.long ? 'long' : 'worn';
  function bulkOf(o) {
    if (BULK_OF_ITEM[o.id]) return BULK_OF_ITEM[o.id];
    const k = RULES.classify(o), base = k.pile ? PILE_BULK[k.pile] : k.long ? 'light' : WORN_BULK[k.worn] || 'light';
    const kg = o.raw.weightKg || 0, litres = o.raw.volumeL || 0;
    const forced = (AT_LEAST.find(([, min]) => kg >= min.kg || litres >= min.litres) || ['light'])[0];
    return BULKS[Math.max(BULKS.indexOf(base), BULKS.indexOf(forced))];
  }
  function sourceOf(o) {
    const k = RULES.classify(o), has = v => DBX.byId.has('item/' + o.id + '/' + v);
    if (k.long) return { side: 'map-lie', upright: 'map-lean' };
    if (o.sub === 'Carcass') return { side: '0' };
    if (k.pile) return { side: PROPS.CARRIED.includes(k.pile) ? 'map-carry' : 'map-pile-1' };
    return { side: WORN_SOURCES.find(has) };
  }
  function of(o) {
    const k = RULES.classify(o), bulk = bulkOf(o), family = familyOf(k);
    return { id: o.id, name: o.name, bulk, storage: storageOf(k), family, source: sourceOf(o), limp: (LIMP[family] || []).includes(storageOf(k)) };
  }

  const CROPS = new Map();
  function cropped(id, variant) {
    const key = 'item/' + id + '/' + variant;
    if (CROPS.has(key)) return CROPS.get(key);
    const src = DBX.built(DBX.byId.get(key));
    let x0 = src.w, y0 = src.h, x1 = -1, y1 = -1;
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.c[y * src.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const s = new Spr(x1 - x0 + 1, y1 - y0 + 1, 0, 0);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const i = (y0 + y) * src.w + x0 + x; s.c[y * s.w + x] = src.c[i]; s.e[y * s.w + x] = src.e[i]; }
    CROPS.set(key, s);
    return s;
  }
  const GRIPS = {
    tuck: s => [s.w >> 1, Math.round(s.h * .6)],
    upright: s => [s.w >> 1, Math.max(s.h >> 1, s.h - UPRIGHT_FOOT)],
    rest: s => [s.w >> 1, s.h - 1]
  };
  function layer(load, hold, face) {
    const upright = hold === 'light' && face !== 's' && load.source.upright, variant = upright || load.source.side, spr = cropped(load.id, variant);
    const grip = GRIPS[upright ? 'upright' : hold === 'light' ? 'tuck' : 'rest'](spr);
    return { key: load.id + '/' + variant, sprite: 'item/' + load.id + '/' + variant, spr, grip, sag: load.limp ? SAG[hold] : 0 };
  }
  function ported(load) {
    const side = layer(load, load.bulk, 's'), front = layer(load, load.bulk, 'f'), row = { bulk: load.bulk, sprite: side.sprite, grip: side.grip };
    if (side.sag) row.sag = side.sag;
    if (front.sprite !== side.sprite) row.upright = { sprite: front.sprite, grip: front.grip };
    return row;
  }
  function tally(loads) {
    const out = Object.fromEntries(BULKS.map(b => [b, { count: 0, storage: {} }]));
    for (const l of loads) { const t = out[l.bulk]; t.count++; t.storage[l.storage] = (t.storage[l.storage] || 0) + 1; }
    return out;
  }
  return { BULKS, bulkOf, of, layer, ported, tally };
})();
