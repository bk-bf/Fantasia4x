'use strict';
const HAUL = (() => {
  const BULKS = ['light', 'bulky', 'heavy'];
  const AT_LEAST = [['heavy', { kg: 20, litres: 25 }], ['bulky', { kg: 5, litres: 6 }]];
  const PILE_BULK = { logs: 'heavy', planks: 'heavy', blocks: 'heavy', sacks: 'heavy', rubble: 'bulky', heap: 'bulky', bars: 'bulky', crates: 'bulky', baskets: 'bulky', bundles: 'bulky', hides: 'bulky', fluids: 'light', meat: 'light', cloth: 'light', pots: 'light' };
  const WORN_BULK = { torso: 'bulky', cuirass: 'bulky', pack: 'bulky', shield: 'bulky', hauler: 'heavy', body: 'heavy' };
  const BULK_OF_ITEM = {};
  const HOLDS = ['hip', 'chest', 'low', 'shoulder', 'game', 'cradle'];
  const HEAVY_HOLD = { logs: 'shoulder', planks: 'shoulder', body: 'cradle', meat: 'game' };
  const HOLD_OF_BULK = { light: () => 'hip', bulky: () => 'chest', heavy: storage => HEAVY_HOLD[storage] || 'low' }, IN_HAND = ['hip', 'chest', 'low'], FITS = { wide: 18, tall: 15, slim: 10 }, BY_GRIP = ['shield'], SHOULDERED_MOST = { kg: 45, droops: 16, tall: 30 };
  const LIMP = { pile: ['meat', 'hides'], long: [], worn: [] };
  const SAG = { hip: 0, chest: 2, low: 2, shoulder: 0, game: 4, cradle: 0, bent: 0, yoked: 3 };
  const ON_SHOULDER = ['shoulder', 'game'];
  const FUSED = ['shoulder'];
  const END_SOURCES = [['map-carry-end', 'map-carry-end']];
  const WORN_SOURCES = ['map-carry', 'map-ground', 'map-pile-1', 'map', '0'];
  const UPHELD = { pole: 26, butt: 10, hilt: 3, haft: 5 }, BELLY = { filled: .45, front: [.55, .82], held: 2 };
  const STANCES = { one: { carry: 'tuck', draw: 'ready', ready: 'guard', stow: 'stow' }, two: { carry: 'tuck', draw: 'readyTwo', ready: 'guardTwo', stow: 'stowTwo' }, bow: { carry: 'tuck', draw: 'readyBow', ready: 'guardBow', stow: 'stowBow' } };
  const POLES = ['spear', 'staff'], HANDLE = { pole: .45, haft: .16 };
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
  const LYING = 'map-ground', FLAT = 'map-carry-flat', CRADLED = 'map-carry-cradled', FOLDED = 'map-carry-folded';
  const sourceOf = (o, k) => ({ ...sidesOf(o, k), lying: DBX.byId.has('item/' + o.id + '/' + LYING) ? LYING : null });
  function sidesOf(o, k) {
    const has = v => DBX.byId.has('item/' + o.id + '/' + v);
    const [toward, away] = END_SOURCES.find(pair => has(pair[0])) || [];
    if (has(CRADLED)) return { side: CRADLED, held: CRADLED, flat: has(FLAT) ? FLAT : WORN_SOURCES.find(has) };
    if (k.long) return { side: 'map-lie', upright: 'map-lean', headUp: PROPS.headUp(k.long, o.id) };
    if (o.sub === 'Carcass') return { side: 'map-carry-draped', held: has('map-carry-held') ? 'map-carry-held' : 'map-carry-draped' };
    if (k.pile) return { side: PROPS.CARRIED.includes(k.pile) ? 'map-carry' : 'map-pile-1', toward, away };
    return { side: WORN_SOURCES.find(has), toward, away, folded: has(FOLDED) ? FOLDED : null };
  }
  function stanceOf(o, k) {
    if (o.group !== 'Weapon' || !k.long) return null;
    return k.long === 'bow' ? 'bow' : POLES.includes(k.long) || o.line[3] === 'two-handed' ? 'two' : 'one';
  }
  function of(o) {
    const k = RULES.classify(o), bulk = bulkOf(o), family = familyOf(k), storage = storageOf(k);
    const source = sourceOf(o, k), cradled = source.side === CRADLED, hold = cradled ? 'cradle' : HOLD_OF_BULK[bulk](storage), figure = o.sub === 'Carcass' || storage === 'body', slung = hold === 'game' ? DBX.built(DBX.byId.get('item/' + o.id + '/' + source.side)) : null;
    const tooLarge = hold === 'game' && ((o.raw.weightKg || 0) > SHOULDERED_MOST.kg || (slung.droops || 0) > SHOULDERED_MOST.droops || slung.h > SHOULDERED_MOST.tall);
    const load = { id: o.id, name: o.name, bulk, hold, tooLarge, storage, family, source, figure, limp: figure || LIMP[family].includes(storage), stance: stanceOf(o, k) };
    if (IN_HAND.includes(hold) && family !== 'long' && !BY_GRIP.includes(storage)) {
      const shown = ['s', 'f', 'b'].map(face => layer(load, hold, face).spr);
      load.slim = hold === 'hip' && shown.every(spr => Math.min(spr.w, spr.h) <= FITS.slim);
      load.tooLarge = !load.slim && shown.some(spr => spr.w > FITS.wide || spr.h > FITS.tall);
    }
    return load;
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
    if (src.grasp) s.grasp = [src.grasp[0] - x0, src.grasp[1] - y0];
    if (src.head) s.head = [src.head[0] - x0, src.head[1] - y0, src.head[2]];
    if (src.droops) s.droops = src.droops;
    if (src.along) s.along = true;
    CROPS.set(key, s);
    return s;
  }
  const GRIPS = {
    hip: (s, storage) => FROM_BELOW.includes(storage) ? [s.w >> 1, s.h - 2] : s.h > s.w ? [s.w >> 1, 1] : [s.w >> 1, Math.round(s.h * .6)],
    chest: s => [s.w >> 1, s.h - 1 - Math.round(s.h / 3)],
    low: s => [s.w >> 1, s.h - 1 - Math.round(s.h / 3)],
    shoulder: s => [s.w >> 1, s.h - 1],
    game: s => [s.w >> 1, s.h - 1],
    cradle: s => [s.w >> 1, s.h - 1]
  };
  const haftOf = spr => { const rows = []; for (let y = 0; y < spr.h; y++) { let n = 0; for (let x = 0; x < spr.w; x++) if (spr.c[y * spr.w + x]) n++; if (n) rows.push(n); } rows.sort((a, b) => a - b); return rows[rows.length >> 1] || 0; };
  function shaftAt(spr, row, upside) {
    const from = upside ? spr.h - 1 - row : row, xs = [];
    for (let x = 0; x < spr.w; x++) if (spr.c[from * spr.w + x]) xs.push(x);
    return [xs[xs.length >> 1], row];
  }
  function hiltAt(spr, x) {
    const ys = [];
    for (let y = 0; y < spr.h; y++) if (spr.c[y * spr.w + x]) ys.push(y);
    return [x, ys.length ? ys[ys.length >> 1] : spr.h >> 1];
  }
  const FROM_BELOW = ['gem'];
  const IN_BOTH_ARMS = ['chest', 'low', 'cradle'], LENGTHWISE = ['bundles'], HELD_ACROSS = ['hides', 'bundles', 'cloth', 'bone'], ENDS_ON = new Map();
  const RESHAPED = new Map();
  function reshaped(key, spr, to, w, h, marked) {
    if (RESHAPED.has(key)) return RESHAPED.get(key);
    const s = new Spr(w, h, 0, 0);
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) { const c = spr.c[y * spr.w + x]; if (!c) continue; const [X, Y] = to(x, y); s.c[Y * w + X] = c; s.e[Y * w + X] = spr.e[y * spr.w + x]; }
    if (marked) { for (const k of ['hold', 'grasp']) if (spr[k]) s[k] = to(...spr[k]); if (spr.head) s.head = [...to(spr.head[0], spr.head[1]), spr.head[2]]; }
    RESHAPED.set(key, s);
    return s;
  }
  function endOn(key, spr) {
    if (ENDS_ON.has(key)) return ENDS_ON.get(key);
    const w = Math.min(spr.w, spr.h + 2), x0 = (spr.w - w) >> 1, s = new Spr(w, spr.h, w >> 1, spr.h - 1);
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < w; x++) { const c = spr.c[y * spr.w + x0 + x]; if (c) { s.c[y * w + x] = x === 0 || x === w - 1 ? P.ink : c; s.e[y * w + x] = spr.e[y * spr.w + x0 + x]; } }
    ENDS_ON.set(key, s);
    return s;
  }
  const DRAWN_ALONE = ['branch'], LAID_ALONG = new Map(), UNDER = [.25, .6];
  function laidAlong(key, spr) {
    if (LAID_ALONG.has(key)) return LAID_ALONG.get(key);
    const fill = [];
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) { const c = spr.c[y * spr.w + x]; if (c && c !== P.ink) fill.push([x, y]); }
    const mx = fill.reduce((a, q) => a + q[0], 0) / fill.length, my = fill.reduce((a, q) => a + q[1], 0) / fill.length;
    let xx = 0, yy = 0, xy = 0;
    for (const [x, y] of fill) { xx += (x - mx) ** 2; yy += (y - my) ** 2; xy += (x - mx) * (y - my); }
    const a = Math.atan2(2 * xy, xx - yy) / 2, cs = Math.cos(a), sn = Math.sin(a), R = Math.ceil(Math.hypot(spr.w, spr.h) / 2) + 1, t = new Spr(R * 2 + 1, R * 2 + 1, R, R);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const sx = Math.round(mx + x * cs - y * sn), sy = Math.round(my + x * sn + y * cs), c = spr.get(sx, sy);
      if (c && c !== P.ink) { t.c[(y + R) * t.w + x + R] = c; t.e[(y + R) * t.w + x + R] = spr.e[sy * spr.w + sx]; }
    }
    t.outline();
    let x0 = t.w, y0 = t.h, x1 = -1, y1 = -1;
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (t.c[y * t.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const s = new Spr(x1 - x0 + 1, y1 - y0 + 1, 0, 0);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { s.c[y * s.w + x] = t.c[(y0 + y) * t.w + x0 + x]; s.e[y * s.w + x] = t.e[(y0 + y) * t.w + x0 + x]; }
    s.along = true;
    LAID_ALONG.set(key, s);
    return s;
  }
  function underside(spr) {
    let best = null;
    for (let x = Math.round(spr.w * UNDER[0]); x <= Math.round(spr.w * UNDER[1]); x++) {
      let y = spr.h - 1;
      while (y > 0 && !spr.c[y * spr.w + x]) y--;
      if (!best || y < best[1] - 1) best = [x, y + 1];
    }
    return best;
  }
  const filledIn = (spr, y) => { let n = 0; for (let x = 0; x < spr.w; x++) if (spr.c[y * spr.w + x]) n++; return n; };
  function slung(spr) {
    let belly = spr.h - 1;
    while (belly > 0 && filledIn(spr, belly) < spr.w * BELLY.filled) belly--;
    for (let x = Math.round(spr.w * BELLY.front[1]); x >= spr.w * BELLY.front[0]; x--) if (spr.c[Math.min(spr.h - 1, belly + BELLY.held) * spr.w + x]) return { grip: [spr.w >> 1, belly], hand: [x, Math.min(spr.h - 1, belly + BELLY.held)] };
    return { grip: [spr.w >> 1, belly], hand: [Math.round(spr.w * BELLY.front[0]), belly] };
  }
  const handPlaced = () => typeof LOOK_STYLE !== 'undefined' && LOOK_STYLE.pieces;
  function layer(load, hold, face, resting) {
    const src = load.source, folk = handPlaced();
    if (resting) { const along = hold === 'shoulder' && face !== 's' && (face === 'f' ? src.toward : src.away), lying = along || (load.figure ? src.flat : src.lying) || src.side, flat = cropped(load.id, lying), turned = hold === 'hip' && face === 'b', spr = turned ? reshaped(load.id + '/' + lying + '/rest/mirrored', flat, (x, y) => [flat.w - 1 - x, y], flat.w, flat.h, true) : flat, out = { key: load.id + '/' + lying + '/rest' + (turned ? '/mirrored' : ''), sprite: 'item/' + load.id + '/' + lying, spr, grip: [face === 's' ? REST.edge : spr.w >> 1, along && face === 'f' && !src.turned ? 0 : spr.h - 1], hand: hiltAt(spr, turned ? spr.w - 2 : 1), sag: 0 }; if (turned) out.mirrored = true; return out; }
    const upright = hold === 'hip' && face !== 's' && src.upright, ended = ON_SHOULDER.includes(hold) && face !== 's' && (face === 'f' ? src.toward : src.away);
    const folded = IN_BOTH_ARMS.includes(hold) && face !== 's' && src.folded;
    const variant = upright || (IN_HAND.includes(hold) && src.held) || ended || folded || (folk && src.folded) || (folk && DRAWN_ALONE.includes(load.id) && '0') || src.side, whole = folk && variant === '0' && DRAWN_ALONE.includes(load.id) ? laidAlong(load.id, cropped(load.id, variant)) : cropped(load.id, variant);
    const across = whole.w > whole.h && face === 's' && IN_BOTH_ARMS.includes(hold) && HELD_ACROSS.includes(load.storage) && !whole.along && !(folk && LENGTHWISE.includes(load.storage)), stood = !upright && whole.w > whole.h && face !== 's' && hold === 'hip' && !!load.slim, flipped = !!upright && !src.headUp, turned = hold === 'cradle' && face === 'b', mirrored = turned || (!!upright && (face === 'f') === flipped);
    const spr = across ? endOn(load.id + '/' + variant, whole) : stood ? reshaped(load.id + '/' + variant + '/stood', whole, (x, y) => [y, whole.w - 1 - x], whole.h, whole.w) : mirrored ? reshaped(load.id + '/' + variant + '/mirrored', whole, (x, y) => [whole.w - 1 - x, y], whole.w, whole.h, turned) : whole;
    const yoked = !!load.figure && ON_SHOULDER.includes(hold) && face !== 's', bent = !!spr.droops;
    const out = { key: load.id + '/' + variant + (across ? '/end' : '') + (stood ? '/stood' : '') + (mirrored ? '/mirrored' : '') + (yoked ? '/yoked' : ''), sprite: 'item/' + load.id + '/' + variant, spr, grip: spr.hold || GRIPS[hold](spr, load.storage), sag: load.limp && !ended ? SAG[bent ? 'bent' : yoked ? 'yoked' : hold] : 0 };
    if (upright || stood) {
      const held = spr.h - 1 - (spr.h > UPHELD.pole ? UPHELD.butt : UPHELD.hilt);
      Object.assign(out, { key: out.key + (flipped ? '/upside' : '') + '/whole', upside: flipped, rows: [0, spr.h], hafted: haftOf(spr) <= UPHELD.haft, grip: shaftAt(spr, held, flipped) });
      if (stood) out.stood = true;
    }
    if (mirrored) out.mirrored = true;
    if (FUSED.includes(hold) && face === 's') out.fused = true;
    if (bent && hold === 'game') out.draped = true;
    if (yoked) out.yoked = true;
    if (hold === 'game' && face === 's' && !spr.hold) Object.assign(out, slung(spr));
    if (spr.grasp) out.hand = spr.grasp;
    if (folk && face === 's' && IN_BOTH_ARMS.includes(hold) && hold !== 'cradle' && load.family !== 'long' && !spr.hold && !ended) out.grip = [out.grip[0], spr.h];
    if (folk && IN_BOTH_ARMS.includes(hold) && hold !== 'cradle' && load.family !== 'long' && !spr.hold && !ended && variant === src.held) Object.assign(out, { hand: underside(spr), under: true });
    if (hold === 'hip' && face === 's' && load.family === 'long' && !spr.hold) { const x = Math.round(spr.w * (POLES.includes(load.storage) ? HANDLE.pole : HANDLE.haft)); out.grip = hiltAt(spr, x); }
    return out;
  }
  const span = (load, hold, face) => { const lying = layer(load, hold, face, true).spr, held = layer(load, hold, face); return { wide: held.spr.w, tall: lying.h, across: !!held.yoked }; };
  const flags = l => Object.fromEntries(['sag', 'upside', 'rows', 'hafted', 'fused', 'yoked', 'stood', 'mirrored'].filter(k => l[k]).map(k => [k, l[k]]));
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
  return { BULKS, HOLDS, STANCES, bulkOf, of, layer, span, ported, tally, nameOf };
})();
