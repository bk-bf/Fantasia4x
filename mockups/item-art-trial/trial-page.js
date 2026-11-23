'use strict';
(async () => {
  const TILE = 32, sheet = document.getElementById('sheet');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const data = await (await fetch('../fantasia4x-tileset/catalog-data.json')).json();
  DBX.fromData(data.objects);
  const names = new Map(data.objects.filter(o => o.cat === 'item').map(o => [o.id, o.name]));

  const canvasOf = (img, zoom) => {
    const cv = el('canvas');
    cv.width = img.w; cv.height = img.h;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.w, img.h), 0, 0);
    cv.style.width = img.w * zoom + 'px'; cv.style.height = img.h * zoom + 'px';
    return cv;
  };
  const figure = (node, caption, cls) => { const f = el('figure'), w = el('div', 'well ' + (cls || '')); w.append(node); f.append(w); if (caption) f.append(el('figcaption', '', caption)); return f; };
  const boxed = (img, zoom, side) => { const w = el('div', 'well icon'); w.style.width = w.style.height = side * zoom + 14 + 'px'; w.append(canvasOf(img, zoom)); return w; };
  const grounded = (s, shadow) => { s.ax = s.w >> 1; s.ay = s.h - 1; s.sh = { rx: shadow, ry: shadow * .32, dx: 0, dy: 0, k: .5 }; return s; };
  const pawn = () => mkPawn(PAWNS.woodcutter.o);

  function scene(tiles, high, things, zoom, marks) {
    const w = DBX.flat(tiles, high, 'tall_grass');
    for (const t of things) w.objs.push({ spr: t.spr, x: t.tx * TILE + 16, y: t.ty * TILE + (t.dy === undefined ? 27 : t.dy) });
    const wrap = el('div', 'scene');
    wrap.append(canvasOf(DBX.crop({ world: w, rect: [0, 0, tiles * TILE, high * TILE], season: 'summer' }), zoom));
    if (marks) { const m = el('div', 'marks'); for (const t of marks) m.append(el('span', '', t)); wrap.append(m); }
    return wrap;
  }

  function reference(zoom) {
    const strip = el('div', 'strip');
    strip.append(figure(canvasOf(DBX.bake(DBX.pick('creature', 'bear', 'summer')), zoom), 'bear', 'icon'));
    strip.append(figure(canvasOf(TK.image(pawn(), true), zoom), 'pawn', 'icon'));
    strip.append(figure(scene(2, 2, [], zoom), 'ground, 2 x 2 tiles'));
    return strip;
  }

  const asNow = it => DBX.bake(DBX.pick('item', it.id, 'summer'));
  const none = text => el('div', 'none', text || '-');
  const SHADOW = [5, 8, 13];
  const stages = (it, tx, ty) => TRIAL.STAGE_NAMES.map((n, i) => ({ spr: grounded(TRIAL.stage(it, i), SHADOW[i]), tx: tx + i, ty, dy: i ? 31 : 28 }));
  const upright = (it, tx, ty) => ({ spr: grounded(TRIAL.tall(it), 4), tx, ty, dy: 30 });
  const halved = (it, tx, ty) => ({ spr: grounded(TRIAL.tallHalf(it), 3), tx, ty, dy: 30 });
  function tree(tx, ty) {
    const e = DBX.pick('tree', 'pine_tree', 'summer'), a = e.at || DBX.anchor.tree;
    return { spr: DBX.still(DBX.built(e)), tx, ty, dy: a[1] };
  }

  function row(it, zoom) {
    const now = asNow(it), name = el('div', 'name'), drawn = !it.mapOnly && !it.tallOnly;
    name.append(el('b', '', it.label), el('i', '', names.get(it.id) || it.id), el('i', '', it.id));
    if (it.stacks) name.append(el('span', 'tag', 'stackable'));
    const cells = [name, boxed(now, zoom, 64)];
    cells.push(drawn ? boxed(TK.image(TK.restyle(now), true), zoom, 64) : none());
    cells.push(drawn ? boxed(TK.image(TRIAL.icon(it)), zoom, 32) : none());
    cells.push(drawn ? boxed(TK.image(TRIAL.crispIcon(it)), zoom, 32) : none());
    cells.push(it.tall ? boxed(TK.image(TRIAL.tall(it)), zoom, 64) : none());
    cells.push(it.tallOnly ? none() : lying(it, now, drawn, zoom));
    cells.push(it.stacks ? scene(3, 2, stages(it, 0, 1), zoom, TRIAL.STAGE_NAMES) : none(it.tall ? 'stands, below' : 'single'));
    return cells;
  }
  function lying(it, now, drawn, zoom) {
    const things = [{ spr: pawn(), tx: 1, ty: 1 }, { spr: grounded(TRIAL.onMap(it), 5), tx: 2, ty: 1, dy: 28 }];
    if (drawn) things.push({ spr: grounded(TRIAL.onMapRestyled(now), 5), tx: 0, ty: 1, dy: 28 });
    return scene(3, 2, things, zoom, [drawn ? 'B' : '', '', 'C crisp']);
  }

  const HEADS = [['Item', ''], ['A', 'as now'], ['B', 'same shape, restyled'], ['C', 'redrawn at 32 px'], ['C crisp', 'hard tones, one outline'], ['Tall', '32 x 64 px, upright'], ['On the map', '16 x 16 px, a quarter of the tile'], ['Stack', 'its own drawing per stage']];
  function grid(zoom) {
    const g = el('div', 'grid');
    for (const [b, note] of HEADS) { const h = el('div', 'head'); h.append(el('b', '', b), note); g.append(h); }
    for (const it of TRIAL.ITEMS) g.append(...row(it, zoom));
    return g;
  }

  function standing(zoom) {
    const strip = el('div', 'strip');
    for (const it of TRIAL.ITEMS.filter(q => q.tall)) strip.append(figure(scene(6, 4, [tree(1, 3), upright(it, 3, 3), { spr: pawn(), tx: 4, ty: 3 }, halved(it, 5, 3)], zoom, ['', '', '', 'two tiles', '', 'half']), it.label));
    return strip;
  }

  function colony(zoom) {
    const single = TRIAL.ITEMS.filter(it => !it.stacks && !it.tallOnly), stacked = TRIAL.ITEMS.filter(it => it.stacks), tall = TRIAL.ITEMS.filter(it => it.tall);
    const things = single.map((it, i) => ({ spr: grounded(TRIAL.onMap(it), 5), tx: 1 + i, ty: 1, dy: 28 }));
    stacked.forEach((it, i) => things.push(...stages(it, (i % 4) * 3, i < 4 ? 3 : 5)));
    tall.forEach((it, i) => things.push(upright(it, 13 + i, 3), halved(it, 13 + i, 5)));
    things.push({ spr: pawn(), tx: 12, ty: 1 }, { spr: pawn(), tx: 12, ty: 3 }, { spr: pawn(), tx: 12, ty: 5 }, tree(18, 5));
    return figure(scene(20, 6, things, zoom), 'tile = ' + TILE * zoom + ' screen px');
  }

  function ground(zoom) {
    const w = DBX.flat(2, 2, 'tall_grass'), cv = canvasOf(DBX.crop({ world: w, rect: [0, 0, 64, 64], season: 'summer' }), 1);
    sheet.style.setProperty('--ground', 'url(' + cv.toDataURL() + ')');
    sheet.style.setProperty('--ground-size', 64 * zoom + 'px');
  }

  function render(state) {
    const zoom = +state.zoom;
    sheet.textContent = '';
    sheet.classList.toggle('ground', state.back === 'ground');
    ground(zoom);
    const quality = el('h2', '', 'Quality bar'), rows = el('h2', '', 'Twelve items, three ways'), up = el('h2', '', 'Standing two tiles tall'), map = el('h2', '', 'On the map at the two game zooms');
    rows.append(el('small', '', 'stackable is a proposed flag, the database has none yet'));
    up.append(el('small', '', 'beside a pine and a pawn, at full and at half size'));
    const strip = el('div', 'strip'); strip.append(colony(1), colony(2));
    sheet.append(quality, reference(zoom), rows, grid(zoom), up, standing(zoom), map, strip);
  }

  const ui = F4X.bar(state => render(state));
  render(ui.state);
})();
