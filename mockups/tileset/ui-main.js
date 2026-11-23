'use strict';
(async () => {
  const { $, el, st } = UI;
  await UI.load();
  const list = $('list'), search = $('q'), tabs = $('tabs');
  const BREAKS = new Set(['item', 'building', 'ground', 'concept']);
  let cursor = -1, typing = 0;

  const cover = tab => { const l = UI.objs.filter(o => tab.has(o) && !o.extra); return { total: l.length, done: l.filter(o => o.state === 'covered').length, skip: l.filter(o => o.state === 'skip').length }; };

  function buildTabs() {
    for (const tab of UI.TABS) {
      const c = cover(tab), b = el('button', BREAKS.has(tab.id) ? 'brk' : '');
      b.dataset.v = tab.id;
      b.append(el('span', '', tab.name), el('i', '', tab.id === 'concept' ? CONCEPTS.list.length + ' later' : c.done + ' / ' + c.total), el('u'));
      b.querySelector('u').style.setProperty('--p', (c.total ? c.done / c.total * 100 : 0) + '%');
      b.onclick = () => openTab(tab.id);
      tabs.append(b);
    }
  }

  function stamp() {
    const d = UI.data, c = cover(UI.tab('all')), total = $('total');
    $('stamp').textContent = d.branch + ' ' + d.commit + (d.dirty ? ' + local edits' : '') + ' · ' + d.commitDate;
    total.append(el('b', '', c.done), ' of ' + c.total + ' drawn, ' + (c.total - c.done - c.skip) + ' missing, ' + c.skip + ' skipped');
  }

  function openTab(id) {
    st.cat = id; st.by = ''; st.sort = ''; st.dir = '';
    st.groups.clear();
    list.scrollTo(0, 0);
    UI.render();
  }

  function syncGroupings(tab, lens) {
    const box = $('by');
    box.textContent = '';
    box.hidden = lens !== 'matrix' || (tab.by || []).length < 2;
    if (box.hidden) return;
    box.append(el('span', 'lab', 'Rows'));
    const active = UI.grouping();
    for (const g of tab.by) {
      const b = el('button', g === active ? 'on' : '', g.label);
      b.onclick = () => { st.by = g.id; UI.render(); };
      box.append(b);
    }
  }

  function syncControls(tab, lens) {
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.v === tab.id);
    for (const g of document.querySelectorAll('#ctl .grp[data-s]')) {
      const value = g.dataset.s === 'view' ? lens : st[g.dataset.s];
      for (const b of g.querySelectorAll('button')) {
        b.classList.toggle('on', b.dataset.v === value);
        if (g.dataset.s === 'view') b.hidden = !tab.lenses.includes(b.dataset.v);
      }
      if (g.classList.contains('scenic')) g.hidden = lens !== 'sprites';
    }
    $('viewgrp').hidden = tab.lenses.length < 2;
    syncGroupings(tab, lens);
  }

  const matcher = tab => {
    const words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
    return o => tab.has(o) && (st.state === 'new' ? o.fresh : st.state === 'pixel' ? o.pixel : st.state === 'all' || o.state === st.state) && words.every(w => o.hay.includes(w));
  };

  UI.render = () => {
    const tab = UI.tab(st.cat), lens = UI.lens();
    st.cat = tab.id;
    syncControls(tab, lens);
    UI.forget('list');
    list.textContent = ''; $('chips').textContent = '';
    list.className = 'lens-' + lens;
    UI.order.length = 0;
    const pool = tab.id === 'concept' ? [] : UI.objs.filter(matcher(tab));
    const n = tab.id === 'concept' ? UI.renderConcepts(list) : lens === 'matrix' ? UI.renderMatrix(pool, list) : lens === 'table' ? UI.renderTable(pool, list) : UI.renderSprites(pool, list);
    if (!n) list.append(el('div', 'empty', 'Nothing matches.'));
    $('shown').textContent = n + ' shown';
    cursor = UI.order.indexOf(st.sel);
    UI.push();
  };

  const reveal = (index, block) => { const n = list.querySelector('[data-i="' + index + '"]'); if (n) n.scrollIntoView({ block: block || 'nearest', inline: 'nearest' }); };

  UI.select = (key, variant, index) => {
    st.sel = key; st.variant = variant || '';
    for (const n of list.querySelectorAll('[data-k]')) n.classList.toggle('sel', n.dataset.k === key);
    cursor = index === undefined ? UI.order.indexOf(key) : index;
    UI.renderDetail(key);
    if (key) reveal(cursor);
    UI.push();
  };

  UI.locate = o => {
    st.cat = o.tab; st.q = ''; st.state = 'all'; st.by = '';
    st.groups.clear();
    search.value = '';
    UI.render();
    reveal(UI.order.indexOf(o.key), 'center');
  };

  function step(dir) {
    if (!UI.order.length) return;
    let i = UI.order[cursor] === st.sel ? cursor : UI.order.indexOf(st.sel);
    i = i < 0 ? (dir > 0 ? 0 : UI.order.length - 1) : i + dir;
    while (UI.order[i] === st.sel) i += dir;
    if (i < 0 || i >= UI.order.length) return;
    UI.select(UI.order[i], '', i);
    reveal(i);
  }

  function onKey(e) {
    const typingNow = document.activeElement === search;
    if (e.key === '/' && !typingNow) { e.preventDefault(); search.focus(); search.select(); }
    else if (e.key === 'Escape') { if (typingNow && search.value) { search.value = st.q = ''; UI.render(); } else if (typingNow) search.blur(); else UI.select(''); }
    else if (typingNow || e.ctrlKey || e.metaKey || e.altKey) return;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  }

  function wire() {
    for (const g of document.querySelectorAll('#ctl .grp[data-s]')) for (const b of g.querySelectorAll('button')) b.onclick = () => { st[g.dataset.s] = b.dataset.v; UI.render(); };
    search.value = st.q;
    search.oninput = () => { clearTimeout(typing); typing = setTimeout(() => { st.q = search.value; UI.render(); }, 120); };
    list.addEventListener('click', e => { const n = e.target.closest('[data-k]'); if (n) UI.select(n.dataset.k, '', +n.dataset.i); });
    $('detail').addEventListener('click', e => { const n = e.target.closest('[data-go]'); if (n) UI.select(n.dataset.go); });
    addEventListener('keydown', onKey);
  }

  buildTabs();
  stamp();
  wire();
  UI.render();
  if (st.sel) { UI.renderDetail(st.sel); reveal(UI.order.indexOf(st.sel), 'center'); }
})();
