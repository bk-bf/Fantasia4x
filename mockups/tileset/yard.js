'use strict';
(async () => {
  const sheet = document.getElementById('sheet'), query = () => new URLSearchParams(location.search);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const data = await (await fetch('catalog-data.json')).json();
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

  const drop = (id, quantity, x, y) => SCENES.drop(items.get(id), quantity, x, y), ruled = SCENES.ruled;

  const CLASSES = [['logs', 'oak_log', 'birch_log'], ['planks', 'oak_plank', 'pine_plank'], ['blocks', 'granite_block', 'limestone_block'], ['rubble', 'small_stone', 'hematite'], ['heap', 'sand', 'coal'], ['bars', 'copper_bar', 'iron_bar'], ['sacks', 'wheat', 'flour'], ['fluids', 'water', 'ale'], ['baskets', 'cabbage', 'apple'], ['meat', 'venison', 'boar_meat'], ['hides', 'deer_hide', 'cured_deer_hide'], ['cloth', 'linen_cloth', 'woolcloth'], ['pots', 'small_stew', 'small_stew'], ['bundles', 'hay', 'flax_fiber']];
  function classes(state) {
    const strip = el('div', 'strip');
    for (const [cls, one, two] of CLASSES) {
      const cap = RULES.CAP[cls], amounts = [Math.round(cap * .15), Math.round(cap * .5), cap];
      const made = ruled(8, 2, [...amounts.map((q, i) => drop(one, q, i, 1)), ...amounts.slice().reverse().map((q, i) => drop(two, q, 5 + i, 1))], { zoned: x => x >= 5, pawns: [[3.6, 1]] });
      strip.append(figure(framed(made.img, +state.zoom), RULES.NAMES[cls], items.get(one).name + ', then ' + items.get(two).name + ' joined'));
    }
    return strip;
  }

  const TOOLS = ['bearded_axe', 'iron_axe', 'iron_hoe', 'steel_boar_spear', 'hunting_recurve', 'iron_hammer', 'iron_pick', 'iron_mace', 'saw', 'iron_tongs'];
  const WORN = ['iron_nasal_helm', 'great_helm', 'plate_cuirass', 'mail_hauberk', 'wool_cloak', 'hide_boots', 'steel_gauntlets', 'steel_heater_shield', 'plank_round_shield', 'champions_crown', 'ruby_ring', 'leather_knapsack', 'framed_leather_pack', 'leather_sword_belt', 'leather_back_quiver', 'iron_butchery_kit', 'tailors_kit', 'goblin_net'];
  const LIE_ROWS = [3, 4];
  function loose(state, ids) {
    const all = ids.filter(id => items.get(id)), leaning = all.map((id, i) => drop(id, 1, 1 + i, 1)), lying = all.map((id, i) => drop(id, 1, 1 + i, LIE_ROWS[i % LIE_ROWS.length]));
    const made = ruled(all.length + 3, 6, [...leaning, ...lying], { walled: (x, y) => y === 0, pawns: [[all.length + 1.4, 1], [all.length + 1.4, 4]] });
    return framed(made.img, +state.zoom, state.labels === 'on' ? made.labels : []);
  }

  const ownedAs = (...kinds) => [...items.values()].filter(o => { const own = WORLD_GEAR.of(o); return own && kinds.includes(own.kind); }).map(o => o.id);
  function bundles(state, ids) {
    const drops = ids.flatMap((id, i) => WORLD_GEAR.of(items.get(id)).stages.map((quantity, j) => drop(id, quantity, 1 + i, 1 + j)));
    const made = ruled(ids.length + 3, 6, drops, { pawns: [[ids.length + 1.4, 2]] });
    return framed(made.img, +state.zoom, state.labels === 'on' ? made.labels : []);
  }

  const FAMILIES = [['fastener', 'stock'], ['thread', 'sundry'], ['remedy', 'preserve'], ['herb'], ['gem']], STRIP = 16;
  const chunked = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
  const families = state => FAMILIES.flatMap(kinds => chunked(ownedAs(...kinds), STRIP).map(ids => bundles(state, ids)));

  const SPOILED = ['rotten_food', 'rotten_meat'];
  function spoiled(state) {
    const heaps = SPOILED.filter(id => items.get(id)).flatMap((id, i) => WORLD_GEAR.of(items.get(id)).stages.map((quantity, j) => drop(id, quantity, 1 + i * 2, 1 + j)));
    const made = ruled(10, 5, [...heaps, drop(items.get('carried_pawn') && 'carried_pawn', 1, 6, 2)], { pawns: [[8, 2]] });
    return framed(made.img, +state.zoom, state.labels === 'on' ? made.labels : []);
  }

  const titled = (title, note) => { const h = el('h2', '', title); if (note) h.append(el('small', '', note)); return h; };
  function render(state) {
    document.getElementById('seed').textContent = seedNow();
    sheet.textContent = '';
    sheet.append(...yard(state),
      titled('Props by storage class', 'a drop is drawn as its class, three fill stages by quantity, tinted by the item'), classes(state),
      titled('Weapons, tools and gear', 'top row beside a wall, lower rows in open grass'), loose(state, WORLD_ITEMS.ids()), loose(state, [...TOOLS, ...WORN]),
      loose(state, ownedAs('pack', 'belt', 'quiver')), ...chunked(ownedAs('vessel', 'hauler', 'organ'), STRIP + 2).map(ids => loose(state, ids)), bundles(state, ownedAs('ammo')),
      titled('Small goods by family', 'one, a few and many of each, top to bottom'), ...families(state),
      titled('Bone, horn and feather', 'one, a few and many of each, top to bottom'), ...chunked(ownedAs('bone', 'plucked'), STRIP).map(ids => bundles(state, ids)),
      titled('Spoiled food and the fallen', 'one, a few and many of each, and a downed colonist'), spoiled(state));
  }

  const ui = F4X.bar(state => render(state));
  const reseed = n => { F4X.write({ seed: Math.max(1, n) }, { seed: 1 }); render(ui.state); };
  document.getElementById('prev').onclick = () => reseed(seedNow() - 1);
  document.getElementById('next').onclick = () => reseed(seedNow() + 1);
  document.getElementById('shuffle').onclick = () => reseed(1 + Math.floor(Math.random() * 9999));
  render(ui.state);
})();
