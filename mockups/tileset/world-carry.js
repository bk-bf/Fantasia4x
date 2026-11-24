'use strict';
const HAUL = (() => {
  const BULKS = ['light', 'bulky', 'heavy'];
  const AT_LEAST = [['heavy', { kg: 20, litres: 25 }], ['bulky', { kg: 5, litres: 6 }]];
  const PILE_BULK = { logs: 'heavy', planks: 'heavy', blocks: 'heavy', sacks: 'heavy', rubble: 'bulky', heap: 'bulky', bars: 'bulky', crates: 'bulky', baskets: 'bulky', bundles: 'bulky', hides: 'bulky', fluids: 'light', meat: 'light', cloth: 'light', pots: 'light' };
  const WORN_BULK = { torso: 'bulky', cuirass: 'bulky', pack: 'bulky', shield: 'bulky', hauler: 'heavy', body: 'heavy' };
  const BULK_OF_ITEM = {};
  const HOLDS = ['hip', 'chest', 'low', 'shoulder', 'game', 'drape'];
  const HEAVY_HOLD = { logs: 'shoulder', planks: 'shoulder', body: 'drape', meat: 'game' };
  const HOLD_OF_BULK = { light: () => 'hip', bulky: () => 'chest', heavy: storage => HEAVY_HOLD[storage] || 'low' };
  const LIMP = { pile: ['meat', 'hides'], long: [], worn: [] };
  const SAG = { hip: 0, chest: 2, low: 2, shoulder: 0, game: 4, drape: 0 };
  const ON_SHOULDER = ['shoulder', 'game', 'drape'];
  const FUSED = ['shoulder'];
  const END_SOURCES = [['map-carry-toward', 'map-carry-away'], ['map-carry-end', 'map-carry-end']];
  const WORN_SOURCES = ['map-carry', 'map-ground', 'map-pile-1', 'map', '0'];
  const UPRIGHT_FOOT = 9;
  const STANCES = { one: { carry: 'tuck', draw: 'ready', ready: 'guard', stow: 'stow' }, two: { carry: 'tuck', draw: 'readyTwo', ready: 'guardTwo', stow: 'stowTwo' }, bow: { carry: 'tuck', draw: 'readyBow', ready: 'guardBow', stow: 'stowBow' } };
  const POLES = ['spear', 'staff'];
  const NAMES = {
    helm: 'helmets', jewel: 'jewellery', gem: 'gems', greaves: 'leg armour', sword: 'swords', axe: 'axes', bracers: 'arm guards', boots: 'boots', gloves: 'gloves', spear: 'spears', ammo: 'arrows and shot',
    staff: 'staves', vessel: 'pots and crucibles', bow: 'bows', mace: 'maces', hammer: 'hammers', herb: 'herbs', dagger: 'knives', bone: 'bone and horn', remedy: 'remedies', stock: 'bar stock', preserve: 'preserves',
    belt: 'belts', plucked: 'feathers and down', thread: 'thread', fastener: 'fasteners', kit: 'tool kits', hoe: 'hoes and spades', pick: 'picks', organ: 'organs', quiver: 'quivers', tongs: 'tongs', spoiled: 'spoiled food',
    sundry: 'sundries', saw: 'saws', torso: 'body armour', pack: 'packs', shield: 'shields', hauler: 'barrows and carts', body: 'the downed'
  };

  const storageOf = k => k.pile || k.long || k.worn;
  const familyOf = k => k.pile ? 'pile' : k.long ? 'long' : 'worn';
  const nameOf = storage => RULES.NAMES[storage] || NAMES[storage];
  function bulkOf(o) {
    if (BULK_OF_ITEM[o.id]) return BULK_OF_ITEM[o.id];
    const k = RULES.classify(o), base = k.pile ? PILE_BULK[k.pile] : k.long ? 'light' : WORN_BULK[k.worn] || 'light';
    const kg = o.raw.weightKg || 0, litres = o.raw.volumeL || 0;
    const forced = (AT_LEAST.find(([, min]) => kg >= min.kg || litres >= min.litres) || ['light'])[0];
    return BULKS[Math.max(BULKS.indexOf(base), BULKS.indexOf(forced))];
  }
  function sourceOf(o, k) {
    const has = v => DBX.byId.has('item/' + o.id + '/' + v);
    const [toward, away] = END_SOURCES.find(pair => has(pair[0])) || [];
    if (k.long) return { side: 'map-lie', upright: 'map-lean', headUp: PROPS.headUp(k.long, o.id) };
    if (o.sub === 'Carcass') return { side: '0', toward, away };
    if (k.pile) return { side: PROPS.CARRIED.includes(k.pile) ? 'map-carry' : 'map-pile-1', toward, away };
    return { side: WORN_SOURCES.find(has), toward, away };
  }
  function stanceOf(o, k) {
    if (o.group !== 'Weapon' || !k.long) return null;
    return k.long === 'bow' ? 'bow' : POLES.includes(k.long) || o.line[3] === 'two-handed' ? 'two' : 'one';
  }
  function of(o) {
    const k = RULES.classify(o), bulk = bulkOf(o), family = familyOf(k), storage = storageOf(k);
    return { id: o.id, name: o.name, bulk, hold: HOLD_OF_BULK[bulk](storage), storage, family, source: sourceOf(o, k), limp: LIMP[family].includes(storage), stance: stanceOf(o, k) };
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
    if (src.hold) s.hold = [src.hold[0] - x0, src.hold[1] - y0];
    CROPS.set(key, s);
    return s;
  }
  const GRIPS = {
    hip: s => [s.w >> 1, Math.round(s.h * .6)],
    chest: s => [s.w >> 1, s.h - 1 - Math.round(s.h / 3)],
    low: s => [s.w >> 1, s.h - 1 - Math.round(s.h / 3)],
    shoulder: s => [s.w >> 1, s.h - 1],
    game: s => [s.w >> 1, s.h - 1],
    drape: s => [s.w >> 1, s.h - 1]
  };
  function shaftAt(spr, row, upside) {
    const from = upside ? spr.h - 1 - row : row, xs = [];
    for (let x = 0; x < spr.w; x++) if (spr.c[from * spr.w + x]) xs.push(x);
    return [xs[xs.length >> 1], row];
  }
  function layer(load, hold, face) {
    const src = load.source, upright = hold === 'hip' && face !== 's' && src.upright, ended = ON_SHOULDER.includes(hold) && face !== 's' && (face === 'f' ? src.toward : src.away);
    const variant = upright || ended || src.side, spr = cropped(load.id, variant);
    const upside = !!upright && (face === 'f') === src.headUp, grip = upright ? shaftAt(spr, Math.max(spr.h >> 1, spr.h - 1 - UPRIGHT_FOOT), upside) : spr.hold || GRIPS[hold](spr);
    const out = { key: load.id + '/' + variant + (upside ? '/upside' : ''), sprite: 'item/' + load.id + '/' + variant, spr, grip, sag: load.limp && !ended ? SAG[hold] : 0 };
    if (upright) Object.assign(out, { upside, clip: true });
    if (FUSED.includes(hold) && face === 's') out.fused = true;
    return out;
  }
  const flags = l => Object.fromEntries(['sag', 'upside', 'clip', 'fused'].filter(k => l[k]).map(k => [k, l[k]]));
  function ported(load) {
    const side = layer(load, load.hold, 's'), row = { bulk: load.bulk, hold: load.hold, sprite: side.sprite, grip: side.grip, ...flags(side) };
    for (const [face, name] of [['f', 'toward'], ['b', 'away']]) { const l = layer(load, load.hold, face); if (l.key !== side.key) row[name] = { sprite: l.sprite, grip: l.grip, ...flags(l) }; }
    if (load.stance) row.stance = load.stance;
    return row;
  }
  function tally(loads) {
    const out = Object.fromEntries(BULKS.map(b => [b, { count: 0, storage: {}, holds: {} }]));
    for (const l of loads) { const t = out[l.bulk]; t.count++; t.storage[l.storage] = (t.storage[l.storage] || 0) + 1; t.holds[l.hold] = (t.holds[l.hold] || 0) + 1; }
    return out;
  }
  return { BULKS, HOLDS, STANCES, bulkOf, of, layer, ported, tally, nameOf };
})();
