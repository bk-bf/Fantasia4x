'use strict';
(async () => {
  const TILE = 32, sheet = document.getElementById('sheet'), query = () => new URLSearchParams(location.search);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const data = await (await fetch('../fantasia4x-tileset/catalog-data.json')).json();
  DBX.fromData(data.objects);
  const items = new Map(data.objects.filter(o => o.cat === 'item').map(o => [o.id, o]));
  const seedNow = () => Math.max(1, +query().get('seed') || 1);

  function canvasOf(img, zoom) {
    const cv = el('canvas');
    cv.width = img.w; cv.height = img.h;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.w, img.h), 0, 0);
    cv.style.width = img.w * zoom + 'px'; cv.style.height = img.h * zoom + 'px';
    return cv;
  }
  function framed(img, zoom, labels) {
    const wrap = el('div', 'scene');
    wrap.append(canvasOf(img, zoom));
    for (const l of labels || []) { const t = el('span', 'tag', l.text); t.style.left = l.x * zoom + 'px'; t.style.top = l.y * zoom + 'px'; wrap.append(t); }
    return wrap;
  }
  const figure = (node, title, note) => { const f = el('figure'), c = el('figcaption'); c.append(el('b', '', title), note || ''); f.append(node, c); return f; };

  function yard(state) {
    const zoom = +state.zoom, seed = seedNow(), made = YARD.compose(items, seed, state.mode), head = el('h2', '', 'Generated yard'), rules = el('p', 'rules');
    head.append(el('small', '', made.drops.length + ' drops, seed ' + seed + ', ' + (state.mode === 'today' ? 'one flat sprite per tile' : 'placed by rule')));
    for (const [rule, n] of Object.entries(made.rules).sort((a, b) => b[1] - a[1])) { const s = el('span'); s.append(el('b', '', n), rule); rules.append(s); }
    return [head, framed(made.img, zoom, state.labels === 'on' ? made.labels : []), rules];
  }

  const drop = (id, quantity, x, y) => ({ item: items.get(id), quantity, x, y });
  function ruled(wide, high, drops, o) {
    const w = DBX.flat(wide, high, 'tall_grass'), walled = (o && o.walled) || (() => false), zoned = (o && o.zoned) || (() => false);
    for (let y = 0; y < high; y++) for (let x = 0; x < wide; x++) if (walled(x, y)) w.wall[y * wide + x] = WL.stone;
    const env = { stations: [], wall: (x, y) => x >= 0 && y >= 0 && x < wide && y < high && walled(x, y), floor: () => false, zone: zoned, field: () => false, grass: () => P.grassLoam };
    const placed = RULES.plan(env, drops.filter(d => d.item), 3);
    for (const p of placed) w.objs.push({ spr: p.spr, x: p.x, y: p.y });
    for (const [x, y] of (o && o.pawns) || []) w.objs.push({ spr: mkPawn(PAWNS.woodcutter.o), x: Math.round(x * TILE) + 16, y: y * TILE + 27 });
    return { img: DBX.crop({ world: w, rect: [0, 0, wide * TILE, high * TILE], season: 'summer' }), labels: placed.flatMap(p => p.labels) };
  }

  const CLASSES = [['logs', 'oak_log', 'birch_log'], ['planks', 'oak_plank', 'pine_plank'], ['blocks', 'granite_block', 'limestone_block'], ['rubble', 'small_stone', 'hematite'], ['heap', 'sand', 'coal'], ['bars', 'copper_bar', 'iron_bar'], ['sacks', 'wheat', 'flour'], ['crates', 'iron_nail', 'iron_nail'], ['fluids', 'water', 'ale'], ['baskets', 'cabbage', 'apple'], ['meat', 'venison', 'boar_meat'], ['hides', 'deer_hide', 'cured_deer_hide'], ['cloth', 'linen_cloth', 'woolcloth'], ['pots', 'small_stew', 'small_stew'], ['bundles', 'hay', 'flax_fiber']];
  function classes(state) {
    const strip = el('div', 'strip');
    for (const [cls, one, two] of CLASSES) {
      const cap = RULES.CAP[cls], amounts = [Math.round(cap * .15), Math.round(cap * .5), cap];
      const made = ruled(8, 2, [...amounts.map((q, i) => drop(one, q, i, 1)), ...amounts.slice().reverse().map((q, i) => drop(two, q, 5 + i, 1))], { zoned: x => x >= 5, pawns: [[3.6, 1]] });
      strip.append(figure(framed(made.img, +state.zoom), RULES.NAMES[cls], items.get(one).name + ', then ' + items.get(two).name + ' joined'));
    }
    return strip;
  }

  const LONGS = ['steel_longsword', 'iron_rondel_dagger', 'short_seax', 'bearded_axe', 'iron_axe', 'iron_hoe', 'steel_boar_spear', 'hunting_recurve', 'iron_hammer', 'iron_pick', 'iron_mace', 'saw', 'iron_tongs'].filter(id => items.get(id));
  const WORN = ['iron_nasal_helm', 'plate_cuirass', 'hide_boots', 'framed_leather_pack', 'leather_sword_belt', 'plank_round_shield'];
  function loose(state) {
    const all = [...LONGS, ...WORN], drops = [...all.map((id, i) => drop(id, 1, 1 + i, 1)), ...all.map((id, i) => drop(id, 1, 1 + i, 3))];
    const made = ruled(all.length + 3, 4, drops, { walled: (x, y) => y === 0, pawns: [[all.length + 1.4, 1], [all.length + 1.4, 3]] });
    return framed(made.img, +state.zoom, state.labels === 'on' ? made.labels : []);
  }

  function icons() {
    const strip = el('div', 'strip');
    for (const it of TRIAL.ITEMS) {
      const pair = el('div', 'well');
      pair.style.gridAutoFlow = 'column'; pair.style.gap = '8px';
      pair.append(canvasOf(DBX.bake(DBX.pick('item', it.id, 'summer')), 1), canvasOf(TK.image(TRIAL.crispIcon(it)), 2));
      strip.append(figure(pair, it.label));
    }
    return strip;
  }

  const titled = (title, note) => { const h = el('h2', '', title); if (note) h.append(el('small', '', note)); return h; };
  function render(state) {
    document.getElementById('seed').textContent = seedNow();
    sheet.textContent = '';
    sheet.append(...yard(state),
      titled('Props by storage class', 'a drop is drawn as its class, three fill stages by quantity, tinted by the item'), classes(state),
      titled('Weapons, tools and gear', 'top row beside a wall, bottom row in open grass'), loose(state),
      titled('Window icons', 'as now, beside the 32 px redraw'), icons());
  }

  const ui = F4X.bar(state => render(state));
  const reseed = n => { F4X.write({ seed: Math.max(1, n) }, { seed: 1 }); render(ui.state); };
  document.getElementById('prev').onclick = () => reseed(seedNow() - 1);
  document.getElementById('next').onclick = () => reseed(seedNow() + 1);
  document.getElementById('shuffle').onclick = () => reseed(1 + Math.floor(Math.random() * 9999));
  render(ui.state);
})();
