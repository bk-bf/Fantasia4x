'use strict';
(() => {
  const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };

  function artState(o) {
    const sprites = DBX.of(o.cat, o.id);
    o.skip = DBX.skipReason ? DBX.skipReason(o) : '';
    o.state = o.extra ? 'extra' : sprites.length ? 'covered' : o.skip ? 'skip' : 'missing';
    o.fresh = sprites.length > 0 && sprites[0].origin === 'new';
    o.pixel = sprites.length > 0 && !!sprites[0].pixel;
  }

  function normalise(o, ages) {
    o.key = o.cat + '/' + o.id;
    o.d = o.d || {};
    o.raw = o.raw || {};
    o.line = o.line || [o.group];
    o.tab = o.cat === 'item' ? o.kind || 'item' : o.cat;
    o.col = o.cat === 'creature' ? o.raw.tier || 0 : o.age ? ages.indexOf(o.age) : -1;
    o.tier = o.raw.tier === undefined ? null : o.raw.tier;
    o.section = o.cat === 'item' ? o.line.slice(0, 2).join(' · ') : o.group;
    o.rank = (o.col < 0 ? 0 : o.col) * 100 + (o.tier || 0) * 10 + (o.src.step || 0);
    o.hay = [o.name, o.id, o.group, o.sub, o.age, o.line.join(' '), (o.d.classes || []).join(' ')].join(' ').toLowerCase();
    artState(o);
  }

  function extras(objs) {
    const known = new Set(objs.map(o => o.cat + '/' + o.id));
    for (const [k, l] of DBX.byObj) if (!known.has(k)) objs.push({ cat: l[0].cat, group: 'Not in the database', id: l[0].dbId, name: l[0].extra || l[0].dbId, extra: true, src: {} });
  }

  function poolFilter(cat) {
    if (cat === 'plank' || cat === 'log') return o => o.id.endsWith('_' + cat);
    if (cat === 'fastener') return o => /_nail$|_rivet$|_tack$/.test(o.id);
    return o => o.raw.category === cat && !['armor', 'weapon', 'tool'].includes(o.raw.type);
  }

  function relate(data, objs) {
    const rel = { makes: new Map(), station: new Map(), uses: new Map(), poolUses: new Map(), drops: new Map(), yields: new Map(), carcass: new Map(), wields: new Map(), builds: new Map(), poolBuilds: new Map(), dwellers: new Map(), spawns: new Map(), pools: new Map() };
    for (const r of data.recipes) {
      for (const id in r.out || {}) push(rel.makes, id, r);
      push(rel.station, r.station, r);
      const inputs = new Set([...Object.keys(r.in || {}), ...(r.alt || []).flatMap(a => Object.keys(a))]);
      for (const s of r.dyn || []) for (const c of s.cats) inputs.add('category:' + c);
      for (const k of inputs) push(k.startsWith('category:') ? rel.poolUses : rel.uses, k.replace(/^category:/, ''), r);
    }
    for (const o of objs) {
      if (o.cat === 'creature') {
        const pool = data.pools[o.raw.lootPool];
        for (const d of pool ? pool.drops : []) push(rel.drops, d.id, { o, chance: d.chance * (pool.dropChance ?? 1), slot: d.slot });
        if (o.raw.carcassItemId) push(rel.carcass, o.raw.carcassItemId, o);
        for (const w of o.raw.naturalWeapons || []) push(rel.wields, w, o);
        if (o.raw.lair) push(rel.dwellers, o.raw.lair, o);
      } else if (o.cat === 'building') for (const id in o.src.cost || {}) push(id.startsWith('category:') ? rel.poolBuilds : rel.builds, id.replace(/^category:/, ''), o);
      else {
        for (const id of o.src.yields || []) push(rel.yields, id, o);
        for (const id of o.src.spawnsOn || []) push(rel.spawns, id, o);
      }
    }
    const items = objs.filter(o => o.cat === 'item' && !o.extra);
    rel.pool = cat => { if (!rel.pools.has(cat)) rel.pools.set(cat, items.filter(poolFilter(cat))); return rel.pools.get(cat); };
    rel.poolsOf = o => [...new Set([...rel.poolUses.keys(), ...rel.poolBuilds.keys()])].filter(c => rel.pool(c).includes(o));
    return rel;
  }

  UI.load = async () => {
    const data = await (await fetch('catalog-data.json')).json();
    if (DBX.fromData) DBX.fromData(data.objects);
    const objs = data.objects.slice();
    for (const r of FOLK_PIECES) objs.push({ cat: 'folk', group: r.group, id: r.id, name: r.name, src: r.src });
    for (const a of FOLK_PIECES.archetypes) { const o = objs.find(x => x.cat === 'folk' && x.id === a.id); if (o) Object.assign(o.src, a.src); }
    for (const r of CONDITION_ICONS.rows) objs.push({ cat: 'condition', group: r.kind, id: r.id, name: r.name, src: { kind: r.kind, icon: r.icon, grade: r.grade } });
    extras(objs);
    for (const o of objs) normalise(o, data.ages);
    UI.data = data;
    UI.ages = data.ages;
    UI.objs = objs;
    UI.byKey = new Map(objs.map(o => [o.key, o]));
    UI.rel = relate(data, objs);
    UI.item = id => UI.byKey.get('item/' + id);
    UI.building = id => UI.byKey.get('building/' + id);
  };
})();
