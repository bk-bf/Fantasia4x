'use strict';
(() => {
  const { el, st, STAT } = UI;

  const natural = (a, b) => a.rank - b.rank || a.line.join().localeCompare(b.line.join()) || a.name.localeCompare(b.name);
  function byColumn(stat, dir) {
    return (a, b) => {
      const x = UI.sortKey(stat, a), y = UI.sortKey(stat, b);
      if (x === null || x === undefined || x === '') return y === null || y === undefined || y === '' ? natural(a, b) : 1;
      if (y === null || y === undefined || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir || natural(a, b);
    };
  }
  const direction = stat => (st.dir ? (st.dir === 'asc' ? 1 : -1) : stat.num ? -1 : 1);
  const sorter = () => { const s = STAT[st.sort]; return s ? byColumn(s, direction(s)) : st.sort === 'name' ? (a, b) => a.name.localeCompare(b.name) * (st.dir === 'desc' ? -1 : 1) : natural; };

  function resort(id, numeric) {
    const first = numeric ? 'desc' : 'asc', other = numeric ? 'asc' : 'desc';
    if (st.sort !== id) { st.sort = id; st.dir = ''; }
    else if ((st.dir || first) === first) st.dir = other;
    else { st.sort = ''; st.dir = ''; }
    UI.render();
  }

  function header(stats) {
    const tr = el('tr'), mark = (th, id, numeric) => { if (st.sort === id) th.classList.add((st.dir || (numeric ? 'desc' : 'asc')) === 'asc' ? 'up' : 'down'); th.onclick = () => resort(id, numeric); };
    const name = el('th', 'nm', 'Name');
    mark(name, 'name', false);
    tr.append(el('th', 'sp'), name);
    for (const s of stats) { const th = el('th', s.num ? 'n' : '', s.label); th.title = s.name; mark(th, s.id, s.num); tr.append(th); }
    return tr;
  }

  function cell(stat, o, peak) {
    const v = UI.value(stat, o), td = el('td', stat.num ? 'n' : 't');
    if (v === null) return td;
    if (stat.age) { td.append(el('span', 'pill age-' + String(v).toLowerCase(), v)); return td; }
    td.textContent = UI.shown(stat, o);
    if (stat.num && peak && !stat.plain) { td.style.setProperty('--p', Math.abs(v) / peak * 100 + '%'); td.classList.add(stat.low ? 'low' : 'high'); }
    else if (!stat.num) td.title = td.textContent;
    return td;
  }

  function row(o, stats, peaks) {
    const tr = el('tr', o.state), name = el('td', 'nm');
    tr.dataset.k = o.key;
    if (o.key === st.sel) tr.classList.add('sel');
    name.append(el('b', '', o.name), el('i', '', o.id));
    const sp = el('td', 'sp');
    sp.append(UI.thumb(o, 32, 'list'));
    tr.append(sp, name);
    stats.forEach((s, i) => tr.append(cell(s, o, peaks[i])));
    return tr;
  }

  UI.renderTable = (pool, list) => {
    const tab = UI.tab(st.cat), stats = tab.table.map(id => STAT[id]), table = el('table', 'tb'), thead = el('thead'), tbody = el('tbody');
    const peaks = stats.map(s => (s.num ? Math.max(0, ...pool.map(o => Math.abs(UI.value(s, o) || 0))) : 0));
    thead.append(header(stats));
    for (const o of pool.slice().sort(sorter())) { const tr = row(o, stats, peaks); tr.dataset.i = UI.order.push(o.key) - 1; tbody.append(tr); }
    table.append(thead, tbody);
    list.append(table);
    return pool.length;
  };
})();
