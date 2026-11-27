'use strict';
(() => {
  const { el, st, STAT } = UI;

  function columns(tab, pool) {
    if (tab.axis === 'tier') return [...new Set(pool.map(o => o.col))].sort((a, b) => (a || 99) - (b || 99)).map(v => ({ v, label: v ? 'Tier ' + v : 'Untiered', cls: 'tier' }));
    const boss = UI.ages.indexOf('Boss');
    return UI.ages.map((label, v) => ({ v, label, cls: 'age-' + label.toLowerCase() })).filter(c => c.v !== boss || pool.some(o => o.col === boss));
  }

  function bucket(pool, grouping, cols) {
    const rows = new Map(), at = new Map(cols.map((c, i) => [c.v, i]));
    for (const o of pool) {
      if (!at.has(o.col)) continue;
      for (const label of grouping.of(o)) {
        if (!rows.has(label)) rows.set(label, cols.map(() => []));
        rows.get(label)[at.get(o.col)].push(o);
      }
    }
    const rank = grouping.rank || (() => 0);
    return [...rows].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  }

  const strongest = (stat, pool) => (stat ? Math.max(0, ...pool.map(o => Math.abs(UI.value(stat, o) || 0))) : 0);

  function tile(o, tab, stats, main, peak) {
    const b = el('button', 'tile ' + o.state), nums = el('span', 'nums');
    b.dataset.k = o.key;
    if (o.key === st.sel) b.classList.add('sel');
    for (const s of stats) nums.append(el('u', UI.value(s, o) === null ? 'nil' : '', UI.brief(s, o) || '·'));
    if (tab.note) { const t = UI.shown(STAT[tab.note], o); if (t) nums.append(el('span', 'note', t)); }
    const name = el('b', 'nm', o.name), tag = tab.tag ? tab.tag(o) : '';
    if (tag) name.append(el('em', 'tag', tag));
    b.append(UI.thumb(o, 32, 'list'), name, nums);
    if (main && peak) { const m = el('s', 'meter'); m.style.setProperty('--p', Math.abs(UI.value(main, o) || 0) / peak * 100 + '%'); b.append(m); }
    b.title = o.name + ' · ' + o.id;
    return b;
  }

  function head(grouping, cols, stats, rows) {
    const tr = el('tr'), corner = el('th', 'corner');
    corner.append(el('b', '', grouping.label), el('i', '', rows.length + ' rows'));
    tr.append(corner);
    cols.forEach((c, i) => {
      const th = el('th', 'colh ' + c.cls), legend = el('span', 'legend');
      for (const s of stats) { const u = el('u', '', s.label); u.title = s.name; legend.append(u); }
      th.append(el('b', '', c.label), el('i', '', new Set(rows.flatMap(r => r[1][i])).size), legend);
      tr.append(th);
    });
    return tr;
  }

  const byStrength = main => (a, b) => (a.tier || 0) - (b.tier || 0) || (main ? (UI.value(main, a) || 0) - (UI.value(main, b) || 0) : 0) || a.name.localeCompare(b.name);

  UI.renderMatrix = (pool, list) => {
    const tab = UI.tab(st.cat), grouping = UI.grouping(), cols = columns(tab, pool), stats = tab.tile.map(id => STAT[id]), main = STAT[tab.main], peak = strongest(main, pool);
    const rows = bucket(pool, grouping, cols), table = el('table', 'mx'), thead = el('thead'), tbody = el('tbody');
    table.style.setProperty('--slots', stats.length);
    if (tab.note && stats.length < 2) table.classList.add('wordy');
    thead.append(head(grouping, cols, stats, rows));
    for (const [label, cells] of rows) {
      const tr = el('tr'), th = el('th', 'rowh');
      th.append(el('b', '', label), el('i', '', new Set(cells.flat()).size));
      if (grouping.note) th.title = grouping.note(label);
      tr.append(th);
      for (const cell of cells) {
        const td = el('td', cell.length ? '' : 'gap');
        for (const o of cell.sort(byStrength(main))) { const t = tile(o, tab, stats, main, peak); t.dataset.i = UI.order.push(o.key) - 1; td.append(t); }
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    list.append(table);
    return new Set(rows.flatMap(r => r[1].flat())).size;
  };
})();
