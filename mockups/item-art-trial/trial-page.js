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

  function row(it, zoom) {
    const cells = [], now = asNow(it), name = el('div', 'name');
    name.append(el('b', '', it.label), el('i', '', names.get(it.id) || it.id), el('i', '', it.id));
    if (it.stacks) name.append(el('span', 'tag', 'stackable'));
    cells.push(name, boxed(now, zoom, 64));
    cells.push(it.mapOnly ? el('div', 'none', '-') : boxed(TK.image(TK.restyle(now), true), zoom, 64));
    cells.push(it.mapOnly ? el('div', 'none', '-') : boxed(TK.image(TRIAL.icon(it)), zoom, 32));
    const lying = [{ spr: pawn(), tx: 1, ty: 1 }, { spr: grounded(TRIAL.onMap(it), 5), tx: 2, ty: 1, dy: 28 }];
    if (!it.mapOnly) lying.push({ spr: grounded(TRIAL.onMapRestyled(now), 5), tx: 0, ty: 1, dy: 28 });
    cells.push(scene(3, 2, lying, zoom, [it.mapOnly ? '' : 'B', '', 'C']));
    cells.push(it.stacks ? scene(3, 2, TRIAL.STAGES.map((n, i) => ({ spr: grounded(TRIAL.heap(it, n), 4 + n * 1.4), tx: i, ty: 1, dy: 31 })), zoom, ['one', 'a few', 'full pile']) : el('div', 'none', 'single'));
    return cells;
  }

  function grid(zoom) {
    const g = el('div', 'grid');
    for (const [b, note] of [['Item', ''], ['A', 'as now'], ['B', 'same shape, restyled'], ['C', 'redrawn at 32 px, seen from above'], ['On the map', '16 x 16 px, a quarter of the tile'], ['Stack', 'grows with the count']]) { const h = el('div', 'head'); h.append(el('b', '', b), note); g.append(h); }
    for (const it of TRIAL.ITEMS) g.append(...row(it, zoom));
    return g;
  }

  const SPOTS = [[1, 1], [3, 1], [5, 1], [7, 1], [9, 1], [11, 1], [0, 2], [2, 2], [4, 2], [8, 2], [10, 2], [12, 2], [1, 3], [3, 3]];
  function colony(zoom) {
    const things = TRIAL.ITEMS.map((it, i) => ({ spr: grounded(it.stacks ? TRIAL.heap(it, TRIAL.STAGES[i % 3]) : TRIAL.onMap(it), 5), tx: SPOTS[i][0], ty: SPOTS[i][1], dy: it.stacks ? 31 : 28 }));
    things.push({ spr: pawn(), tx: 6, ty: 2 }, { spr: pawn(), tx: 9, ty: 3 });
    for (const [it, n, tx, ty] of [[TRIAL.ITEMS[12], 7, 5, 3], [TRIAL.ITEMS[13], 7, 7, 3], [TRIAL.ITEMS[10], 7, 11, 3]]) things.push({ spr: grounded(TRIAL.heap(it, n), 12), tx, ty, dy: 31 });
    return figure(scene(13, 4, things, zoom), 'tile = ' + TILE * zoom + ' screen px');
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
    const quality = el('h2', '', 'Quality bar'), rows = el('h2', '', 'Twelve items, three ways'), map = el('h2', '', 'On the map at the two game zooms');
    rows.append(el('small', '', 'stackable is a proposed flag, the database has none yet'));
    const strip = el('div', 'strip'); strip.append(colony(1), colony(2));
    sheet.append(quality, reference(zoom), rows, grid(zoom), map, strip);
  }

  const ui = F4X.bar(state => render(state));
  render(ui.state);
})();
