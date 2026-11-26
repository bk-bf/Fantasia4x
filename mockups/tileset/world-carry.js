'use strict';
const HAUL = (() => {
  const BULKS = ['light', 'bulky', 'heavy'];
  const AT_LEAST = [['heavy', { kg: 20, litres: 25 }], ['bulky', { kg: 5, litres: 6 }]];
  const PILE_BULK = { logs: 'heavy', planks: 'heavy', blocks: 'heavy', sacks: 'heavy', rubble: 'bulky', heap: 'bulky', bars: 'bulky', crates: 'bulky', baskets: 'bulky', bundles: 'bulky', hides: 'bulky', fluids: 'light', meat: 'light', cloth: 'light', pots: 'light' };
  const WORN_BULK = { torso: 'bulky', cuirass: 'bulky', pack: 'bulky', shield: 'bulky', hauler: 'heavy', body: 'heavy' };
  const BULK_OF_ITEM = {};
  const HOLDS = ['hip', 'chest', 'low', 'shoulder', 'game', 'drape'];
  const HEAVY_HOLD = { logs: 'shoulder', planks: 'shoulder', body: 'drape', meat: 'game' };
  const HOLD_OF_BULK = { light: () => 'hip', bulky: () => 'chest', heavy: storage => HEAVY_HOLD[storage] || 'low' }, IN_HAND = ['hip', 'chest', 'low'], FITS = { wide: 18, tall: 15, slim: 10 }, BY_GRIP = ['shield'], SHOULDERED_MOST = { kg: 45, droops: 16 };
  const LIMP = { pile: ['meat', 'hides'], long: [], worn: [] };
  const SAG = { hip: 0, chest: 2, low: 2, shoulder: 0, game: 4, drape: 0, draped: 0 };
  const ON_SHOULDER = ['shoulder', 'game', 'drape'];
  const FUSED = ['shoulder'];
  const END_SOURCES = [['map-carry-toward', 'map-carry-away'], ['map-carry-end', 'map-carry-end']];
  const WORN_SOURCES = ['map-carry', 'map-ground', 'map-pile-1', 'map', '0'];
  const SEEN_ROWS = { least: 4, most: 14, behind: 2 }, BELLY = { filled: .45, front: [.55, .82], held: 2 };
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
  const LYING = 'map-ground', SLUNG_OVER = 'map-carry-slung';
  const sourceOf = (o, k) => ({ ...sidesOf(o, k), lying: DBX.byId.has('item/' + o.id + '/' + LYING) ? LYING : null });
  function sidesOf(o, k) {
    const has = v => DBX.byId.has('item/' + o.id + '/' + v);
    const [toward, away] = END_SOURCES.find(pair => has(pair[0])) || [];
    if (k.long) return { side: 'map-lie', upright: 'map-lean', headUp: PROPS.headUp(k.long, o.id) };
    if (o.sub === 'Carcass') return { side: has('map-carry-draped') ? 'map-carry-draped' : has(SLUNG_OVER) ? SLUNG_OVER : '0', held: has('map-carry-held') ? 'map-carry-held' : null, toward, away, draped: has('map-carry-draped') };
    if (k.pile && PROPS.TURNED.includes(k.pile)) return { side: 'map-carry-end', toward: 'map-carry', away: 'map-carry', turned: true };
    if (k.pile) return { side: PROPS.CARRIED.includes(k.pile) ? 'map-carry' : 'map-pile-1', toward, away };
    return { side: WORN_SOURCES.find(has), toward, away };
  }
  function stanceOf(o, k) {
    if (o.group !== 'Weapon' || !k.long) return null;
    return k.long === 'bow' ? 'bow' : POLES.includes(k.long) || o.line[3] === 'two-handed' ? 'two' : 'one';
  }
  function of(o) {
    const k = RULES.classify(o), bulk = bulkOf(o), family = familyOf(k), storage = storageOf(k);
    const source = sourceOf(o, k), slungOver = source.side === SLUNG_OVER, hold = slungOver ? 'drape' : HOLD_OF_BULK[bulk](storage), slung = hold === 'game' && source.draped ? DBX.built(DBX.byId.get('item/' + o.id + '/map-carry-draped')) : null;
    const tooLarge = hold === 'game' && ((o.raw.weightKg || 0) > SHOULDERED_MOST.kg || (slung && slung.droops > SHOULDERED_MOST.droops));
    const load = { id: o.id, name: o.name, bulk, hold, tooLarge, storage, family, source, limp: !slungOver && LIMP[family].includes(storage), stance: stanceOf(o, k) };
    if (slungOver && !source.lying) source.lying = '0';
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
    CROPS.set(key, s);
    return s;
  }
  const GRIPS = {
    hip: s => s.h > s.w ? [s.w >> 1, 1] : [s.w >> 1, Math.round(s.h * .6)],
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
  function hiltAt(spr, x) {
    const ys = [];
    for (let y = 0; y < spr.h; y++) if (spr.c[y * spr.w + x]) ys.push(y);
    return [x, ys.length ? ys[ys.length >> 1] : spr.h >> 1];
  }
  const IN_BOTH_ARMS = ['chest', 'low'], HELD_ACROSS = ['hides', 'bundles', 'cloth', 'bone'], ENDS_ON = new Map();
  function endOn(key, spr) {
    if (ENDS_ON.has(key)) return ENDS_ON.get(key);
    const w = Math.min(spr.w, spr.h + 2), x0 = (spr.w - w) >> 1, s = new Spr(w, spr.h, w >> 1, spr.h - 1);
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < w; x++) { const c = spr.c[y * spr.w + x0 + x]; if (c) { s.c[y * w + x] = x === 0 || x === w - 1 ? P.ink : c; s.e[y * w + x] = spr.e[y * spr.w + x0 + x]; } }
    ENDS_ON.set(key, s);
    return s;
  }
  const filledIn = (spr, y) => { let n = 0; for (let x = 0; x < spr.w; x++) if (spr.c[y * spr.w + x]) n++; return n; };
  function slung(spr) {
    let belly = spr.h - 1;
    while (belly > 0 && filledIn(spr, belly) < spr.w * BELLY.filled) belly--;
    for (let x = Math.round(spr.w * BELLY.front[1]); x >= spr.w * BELLY.front[0]; x--) if (spr.c[Math.min(spr.h - 1, belly + BELLY.held) * spr.w + x]) return { grip: [spr.w >> 1, belly], hand: [x, Math.min(spr.h - 1, belly + BELLY.held)] };
    return { grip: [spr.w >> 1, belly], hand: [Math.round(spr.w * BELLY.front[0]), belly] };
  }
  function layer(load, hold, face, resting) {
    const src = load.source;
    if (resting) { const along = (hold === 'shoulder' || src.turned) && face !== 's' && (face === 'f' ? src.toward : src.away), lying = along || src.lying || src.side, spr = cropped(load.id, lying); return { key: load.id + '/' + lying + '/rest', sprite: 'item/' + load.id + '/' + lying, spr, grip: [face === 's' ? REST.edge : spr.w >> 1, along && face === 'f' && !src.turned ? 0 : spr.h - 1], hand: hiltAt(spr, 1), sag: 0 }; }
    const upright = hold === 'hip' && face !== 's' && src.upright, ended = (ON_SHOULDER.includes(hold) || src.turned) && face !== 's' && (face === 'f' ? src.toward : src.away);
    const variant = upright || (IN_HAND.includes(hold) && src.held) || ended || src.side, whole = cropped(load.id, variant), headDown = (face === 'f') === !!src.headUp;
    const across = whole.w > whole.h && (face === 's' ? IN_BOTH_ARMS.includes(hold) && HELD_ACROSS.includes(load.storage) : hold === 'hip' && !!load.slim), spr = across ? endOn(load.id + '/' + variant, whole) : whole;
    const out = { key: load.id + '/' + variant + (across ? '/end' : ''), sprite: 'item/' + load.id + '/' + variant, spr, grip: spr.hold || GRIPS[hold](spr), sag: load.limp && !ended ? SAG[hold] : 0 };
    if (upright) {
      const seen = Math.min(spr.h, SEEN_ROWS.most, Math.max(SEEN_ROWS.least, Math.round(spr.h * SEEN.depth))), rows = face === 'f' ? [spr.h - seen, spr.h] : [0, seen], held = face === 'f' ? rows[0] + SEEN_ROWS.behind : rows[1] - 1 - SEEN_ROWS.behind;
      Object.assign(out, { key: out.key + (headDown ? '/upside' : '') + '/' + rows, upside: headDown, rows, grip: shaftAt(spr, held, headDown) });
    }
    if (FUSED.includes(hold) && face === 's') out.fused = true;
    if (src.draped && hold === 'game') out.draped = true;
    if (hold === 'game' && face === 's' && !spr.hold) Object.assign(out, slung(spr));
    if (spr.grasp) out.hand = spr.grasp;
    if (src.draped && face === 's' && hold === 'game') out.sag = SAG.draped;
    if (hold === 'hip' && face === 's' && load.family === 'long' && !spr.hold) { const x = Math.round(spr.w * (POLES.includes(load.storage) ? HANDLE.pole : HANDLE.haft)); out.grip = hiltAt(spr, x); }
    return out;
  }
  const span = (load, hold, face) => { const lying = layer(load, hold, face, true).spr; return { wide: layer(load, hold, face).spr.w, tall: lying.h }; };
  const flags = l => Object.fromEntries(['sag', 'upside', 'rows', 'fused'].filter(k => l[k]).map(k => [k, l[k]]));
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
