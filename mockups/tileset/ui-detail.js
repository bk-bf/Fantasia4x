'use strict';
(() => {
  const { el, st, $, STAT, pct } = UI;
  const CAP = 60;

  function chip(o, note) {
    const b = el('button', 'chip');
    b.dataset.go = o.key;
    b.append(UI.thumb(o, 20, 'detail'), el('b', '', o.name));
    if (note) b.append(el('i', '', note));
    b.title = o.id;
    return b;
  }
  function poolChip(cat, note) {
    const members = UI.rel.pool(cat), s = el('span', 'chip pool');
    s.append(UI.thumb(members[0], 20, 'detail'), el('b', '', 'any ' + cat.replace(/_/g, ' ')));
    if (note) s.append(el('i', '', note));
    s.title = members.map(m => m.name).join(', ');
    return s;
  }
  const ingredient = (id, n) => {
    if (id.startsWith('category:')) return poolChip(id.slice(9), '×' + n);
    const o = UI.item(id);
    return o ? chip(o, '×' + n) : el('span', 'chip pool', id + ' ×' + n);
  };
  const chipRow = nodes => { const row = el('div', 'chips'); for (const n of nodes.slice(0, CAP)) row.append(n); if (nodes.length > CAP) row.append(el('span', 'more', '+' + (nodes.length - CAP))); return row; };
  const block = (d, title, node) => { if (!node || !node.childNodes.length) return; d.append(el('h4', '', title), node); };
  const unique = list => [...new Set(list)];
  const items = ids => unique(ids).map(UI.item).filter(Boolean);

  function recipeBlock(r) {
    const box = el('div', 'recipe'), station = UI.building(r.station), meta = [], research = UI.data.research[r.research];
    if (r.work) meta.push('work ' + r.work);
    if (r.tool) meta.push('tool T' + r.tool);
    if (r.passive) meta.push('passive');
    if (r.discipline) meta.push(r.discipline);
    if (research) meta.push(research.name);
    const top = el('div', 'chips');
    top.append(station ? chip(station) : el('span', 'chip pool', r.station), el('span', 'meta', meta.join(' · ')));
    const ins = Object.entries(r.in || {}).map(([k, n]) => ingredient(k, n));
    for (const s of r.dyn || []) ins.push(el('span', 'chip pool', 'any ' + s.cats.join(' / ') + ' ×' + s.n));
    box.append(top, chipRow(ins));
    for (const a of r.alt || []) { const alt = chipRow(Object.entries(a).map(([k, n]) => ingredient(k, n))); alt.prepend(el('span', 'meta', 'or')); box.append(alt); }
    const outs = Object.entries(r.out || {});
    if (outs.length > 1 || (outs[0] && outs[0][1] !== 1)) { const row = chipRow(outs.map(([k, n]) => ingredient(k, n))); row.prepend(el('span', 'meta', 'gives')); box.append(row); }
    return box;
  }

  function madeBy(o) {
    const box = el('div');
    for (const r of UI.rel.makes.get(o.id) || []) box.append(recipeBlock(r));
    return box;
  }

  function obtained(o) {
    const nodes = [];
    for (const s of UI.rel.yields.get(o.id) || []) nodes.push(chip(s));
    for (const c of UI.rel.carcass.get(o.id) || []) nodes.push(chip(c, 'carcass'));
    for (const d of (UI.rel.drops.get(o.id) || []).sort((a, b) => b.chance - a.chance)) nodes.push(chip(d.o, pct(d.chance)));
    for (const c of UI.rel.wields.get(o.id) || []) nodes.push(chip(c));
    return chipRow(nodes);
  }

  function consumers(o) {
    const pools = UI.rel.poolsOf(o);
    const recipes = [...(UI.rel.uses.get(o.id) || []), ...pools.flatMap(c => UI.rel.poolUses.get(c) || [])];
    const built = [...(UI.rel.builds.get(o.id) || []), ...pools.flatMap(c => UI.rel.poolBuilds.get(c) || [])];
    return { made: items(recipes.flatMap(r => Object.keys(r.out || {}))).filter(x => x !== o), built: unique(built), pools };
  }

  function statGrid(o) {
    const tab = UI.tab(o.tab), grid = el('div', 'stats'), ids = unique([...tab.table, ...(tab.detail || [])]).filter(id => id !== 'kind' && id !== 'line');
    for (const id of ids) {
      const text = UI.shown(STAT[id], o);
      if (!text) continue;
      const cell = el('div', (STAT[id].num ? 'n' : 't') + (text.length > 14 ? ' wide' : ''));
      cell.append(el('i', '', STAT[id].name), el('b', '', text));
      grid.append(cell);
    }
    return grid;
  }

  function views(o, key, d) {
    const all = DBX.of(o.cat, o.id);
    if (!all.length) return null;
    const e = all.find(v => v.variant === st.variant) || DBX.pick(o.cat, o.id, st.season), b = DBX.bake(e);
    const big = el('div', 'view'), cv = el('canvas'), im = o.cat === 'item' || e.icon ? b : DBX.scene(e, DBX.seasonOf(e, st.season));
    UI.paint(cv, im, Math.max(1, Math.min(4, Math.floor(340 / im.w)))); big.append(cv); d.append(big);
    const facings = ['s', 'e', 'n', 'w'].map(f => all.find(v => v.variant === f)).filter(Boolean);
    if (facings.length > 1) {
      const row = el('div', 'faces');
      for (const v of facings) { const c = el('canvas'), fb = DBX.bake(v); UI.paint(c, fb, fb.w > 70 || fb.h > 90 ? 1 : 2); c.title = v.variant; if (v === e) c.className = 'on'; c.onclick = () => UI.select(key, v.variant); row.append(c); }
      d.append(row);
    }
    if (e.kind !== 'world' && o.cat !== 'condition') d.append(inScene(o, e, b));
    return { all, e, b };
  }

  const TILE = SCENES.TILE;
  const framed = (cv, tilePx) => { const sc = el('div', 'view'), wrap = el('div', 'gridded'); wrap.style.setProperty('--t', tilePx + 'px'); wrap.append(cv); sc.append(wrap); return sc; };

  function standing(o, e, b) {
    const tw = Math.max(3, Math.ceil(b.w / TILE) + 2), th = Math.max(2, Math.ceil(b.h / TILE) + 1), tx = Math.max(0, Math.ceil(-b.ox / TILE)), ty = th - 1;
    const w = DBX.flat(tw, th, e.ground || 'tall_grass'), a = e.at || DBX.anchor[o.cat] || [16, 23];
    w.objs.push({ spr: DBX.still(DBX.built(e)), x: tx * TILE + a[0], y: ty * TILE + a[1] });
    w.objs.push({ spr: mkPawn(PAWNS.woodcutter.o), x: (tw - 1) * TILE + 16, y: ty * TILE + 27 });
    const z = Math.max(1, Math.min(3, Math.floor(340 / (tw * TILE)))), cv = el('canvas');
    UI.paint(cv, DBX.crop({ world: w, rect: [0, 0, tw * TILE, th * TILE], season: DBX.seasonOf(e, st.season) }), z);
    return framed(cv, TILE * z);
  }

  function inWorld(o, e) {
    const made = SCENES.ofItem(o, DBX.seasonOf(e, st.season)), z = Math.max(1, Math.min(3, Math.floor(340 / made.img.w))), cv = el('canvas');
    UI.paint(cv, made.img, z);
    return framed(cv, TILE * z);
  }

  const inScene = (o, e, b) => o.cat === 'item' ? inWorld(o, e) : standing(o, e, b);

  function registry(key, shown) {
    const t = el('table', 'reg'), head = el('tr');
    for (const c of ['id', 'w × h', 'ox, oy']) head.append(el('th', '', c));
    t.append(head);
    for (const v of shown.all) {
      const on = v === shown.e, r = el('tr', 'v' + (on ? ' on' : ''));
      r.append(el('td', '', v.id), el('td', '', on ? shown.b.w + ' × ' + shown.b.h : ''), el('td', '', on ? shown.b.ox + ', ' + shown.b.oy : ''));
      r.onclick = ev => { if (ev.detail > 1) UI.copy(v.id); else UI.select(key, v.variant); };
      t.append(r);
    }
    return t;
  }

  const plain = v => (v === undefined || v === null ? '' : Array.isArray(v) ? v.map(x => (typeof x === 'object' ? JSON.stringify(x) : x)).join(', ') : typeof v === 'object' ? Object.entries(v).map(([k, x]) => k + ' ' + (typeof x === 'object' ? JSON.stringify(x) : x)).join(', ') : String(v));
  function rawTable(o) {
    const kv = el('table', 'kv'), fields = { ...o.src, ...o.raw };
    if (o.color) { const r = el('tr'), c = el('td'), sw = el('span', 'swatch'); sw.style.background = o.color; c.append(sw, o.color); r.append(el('td', '', 'colour'), c); kv.append(r); }
    for (const [k, v] of Object.entries(fields)) { const s = plain(v); if (!s) continue; const r = el('tr'); r.append(el('td', '', k), el('td', '', s)); kv.append(r); }
    return kv;
  }

  function creatureLinks(o, d) {
    block(d, 'Natural weapons', chipRow(items(o.raw.naturalWeapons || []).map(w => chip(w, UI.shown(STAT.dmg, w)))));
    const pool = UI.data.pools[o.raw.lootPool], carcass = UI.item(o.raw.carcassItemId || ''), drops = [];
    if (carcass) drops.push(chip(carcass, 'carcass'));
    for (const x of pool ? pool.drops : []) { const it = UI.item(x.id); if (it) drops.push(chip(it, pct(x.chance * (pool.dropChance ?? 1)))); }
    block(d, 'Drops', chipRow(drops));
    const lair = UI.byKey.get('site/' + o.raw.lair);
    block(d, 'Kin and lair', chipRow([...(lair ? [chip(lair, 'lair')] : []), ...UI.objs.filter(x => x.cat === 'creature' && x.group === o.group && x !== o).sort((a, b) => a.rank - b.rank).map(x => chip(x, x.tier ? 'T' + x.tier : ''))]));
  }

  function worldLinks(o, d) {
    for (const h of o.harvest || []) block(d, [UI.title(h.action), h.work ? 'work ' + h.work : '', h.tool ? 'tool T' + h.tool : ''].filter(Boolean).join(' · '), chipRow(h.yields.map(y => ingredient(y.id, y.n))));
    block(d, 'Lives here', chipRow((UI.rel.dwellers.get(o.id) || []).map(c => chip(c))));
    block(d, 'Grows on it', chipRow((UI.rel.spawns.get(o.id) || []).map(c => chip(c))));
    block(d, 'Spawns on', chipRow((o.src.spawnsOn || []).map(id => UI.byKey.get('ground/' + id)).filter(Boolean).map(g => chip(g))));
  }

  function buildingLinks(o, d) {
    block(d, 'Costs', chipRow(Object.entries(o.src.cost || {}).map(([k, n]) => ingredient(k, n))));
    const made = items((UI.rel.station.get(o.id) || []).flatMap(r => Object.keys(r.out || {})));
    block(d, 'Makes · ' + made.length, chipRow(made.sort((a, b) => a.rank - b.rank).map(x => chip(x))));
    if ((o.d.inherited || []).length) d.append(el('h4', '', 'Also runs'), el('p', '', o.d.inherited.join(', ')));
  }

  function itemLinks(o, d) {
    if ((o.d.classes || []).length) { const row = el('div', 'chips'); for (const c of o.d.classes) row.append(el('span', 'chip pool', c)); block(d, 'Builds', row); }
    block(d, 'Made at', madeBy(o));
    block(d, 'Comes from', obtained(o));
    const use = consumers(o);
    block(d, 'Used in · ' + use.made.length, chipRow(use.made.sort((a, b) => a.rank - b.rank).map(x => chip(x))));
    block(d, 'Builds into', chipRow(use.built.map(x => chip(x))));
    if (use.pools.length) d.append(el('p', 'dimmed', 'counts as ' + use.pools.join(', ')));
  }

  function header(o, d) {
    const path = el('div', 'path', [UI.tabName(o.tab), ...o.line.slice(o.cat === 'item' ? 1 : 0), o.age].filter(Boolean).join(' · '));
    path.append(el('span', 'st ' + o.state, o.state === 'skip' ? 'skipped: ' + o.skip : o.state === 'covered' ? (o.pixel ? 'pixel art' : o.fresh ? 'new art' : 'mockup art') : o.state));
    const idrow = el('div', 'idrow'), code = el('code', '', o.id), find = el('button', 'find', 'Show in ' + UI.tabName(o.tab));
    code.onclick = () => UI.copy(o.id);
    find.onclick = () => UI.locate(o);
    idrow.append(code, find);
    d.append(el('h3', '', o.name), path, idrow);
  }

  UI.renderDetail = key => {
    const d = $('detail'), o = UI.byKey.get(key), concept = key.startsWith('concept/') && CONCEPTS.list.find(q => 'concept/' + q.id === key);
    UI.forget('detail');
    d.hidden = !o && !concept; d.textContent = '';
    if (d.hidden) return;
    const x = el('button', 'x', '×');
    x.onclick = () => UI.select('');
    d.append(x);
    if (concept) return UI.conceptDetail(concept, d);
    header(o, d);
    const shown = views(o, key, d);
    if (o.desc) d.append(el('p', 'desc', o.desc));
    block(d, 'Stats', statGrid(o));
    if (o.cat === 'item') itemLinks(o, d);
    else if (o.cat === 'building') buildingLinks(o, d);
    else if (o.cat === 'creature') creatureLinks(o, d);
    else worldLinks(o, d);
    if (shown) { d.append(el('h4', '', 'Sprites · ' + shown.all.length), registry(key, shown)); }
    const more = el('details'), kv = rawTable(o);
    if (kv.children.length) { more.append(el('summary', '', 'Database fields'), kv); d.append(more); }
    d.scrollTop = 0;
  };
})();
