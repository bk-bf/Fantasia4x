'use strict';
(() => {
  const { el, st, $ } = UI;

  const image = (e, o) => (st.back === 'bare' || o.cat === 'item' || e.icon ? DBX.bake(e) : DBX.scene(e, st.season));
  function drawCard(card) {
    const o = card.o, e = DBX.pick(o.cat, o.id, st.season);
    try { const img = image(e, o); UI.paint(card.cv, img, Math.max(1, Math.min(+st.zoom, Math.floor(144 * st.zoom / img.w)))); }
    catch (err) { card.classList.add('missing'); card.title = String(err); console.error(o.key, err); }
  }

  function sections(pool) {
    const secs = new Map(), mixed = st.cat === 'all';
    for (const o of pool) {
      const k = (mixed ? UI.tabName(o.cat === 'item' ? 'item' : o.cat) + ' · ' : '') + o.section;
      if (!secs.has(k)) secs.set(k, []);
      secs.get(k).push(o);
    }
    return secs;
  }

  function chips(secs) {
    const box = $('chips');
    box.textContent = '';
    if (secs.size < 2 || st.cat === 'all') return;
    for (const [k, l] of secs) {
      const b = el('button', st.groups.has(k) ? 'on' : '', k);
      b.append(el('i', '', l.filter(o => o.state === 'covered').length + '/' + l.length));
      b.onclick = () => { st.groups.has(k) ? st.groups.delete(k) : st.groups.add(k); UI.render(); };
      box.append(b);
    }
  }

  function tagOf(o) {
    if (o.cat === 'building') return o.sub + (o.skip ? ' · skipped' : '');
    if (o.cat === 'item') return [o.age, o.tier === null ? '' : 'T' + o.tier].filter(Boolean).join(' · ');
    return o.skip ? 'skipped' : '';
  }

  function card(o) {
    const c = el('button', 'card ' + o.state + (o.fresh ? ' new' : ''));
    c.o = o; c.dataset.k = o.key;
    if (o.state === 'covered' || o.state === 'extra') {
      c.cv = el('canvas'); c.cv.width = c.cv.height = 32; c.cv.style.width = c.cv.style.height = 32 * st.zoom + 'px';
      c.append(c.cv);
      UI.lazy(c, 'list', () => drawCard(c));
    } else { const ph = el('div', 'ph'), sw = el('s'); sw.style.background = o.color || 'transparent'; ph.append(sw); c.append(ph); }
    c.append(el('b', '', o.name), el('i', '', o.id));
    const tag = tagOf(o);
    if (tag) c.append(el('span', 'tag', tag));
    if (o.key === st.sel) c.classList.add('sel');
    return c;
  }

  UI.renderSprites = (pool, list) => {
    const secs = sections(pool);
    let n = 0;
    chips(secs);
    for (const [k, l] of secs) {
      if (st.groups.size && st.cat !== 'all' && !st.groups.has(k)) continue;
      l.sort((a, b) => a.rank - b.rank);
      const sec = el('section'), h = el('h2', '', k), cards = el('div', 'cards'), done = l.filter(o => o.state === 'covered').length, miss = l.filter(o => o.state === 'missing').length;
      h.append(el('small', '', done + ' / ' + l.length));
      if (miss) h.append(el('small', 'm', miss + ' missing'));
      h.onclick = () => sec.classList.toggle('shut');
      for (const o of l) { const c = card(o); c.dataset.i = UI.order.push(o.key) - 1; cards.append(c); n++; }
      sec.append(h, cards); list.append(sec);
    }
    return n;
  };

  UI.renderConcepts = list => {
    const sec = el('section'), h = el('h2', '', 'Concept animations'), cards = el('div', 'cards');
    $('chips').textContent = '';
    h.append(el('small', '', 'set aside for later'));
    for (const c of CONCEPTS.list) {
      const key = 'concept/' + c.id, b = el('button', 'card concept' + (key === st.sel ? ' sel' : '')), cv = el('canvas');
      b.dataset.k = key; b.dataset.i = UI.order.push(key) - 1;
      CONCEPTS.play(cv, c, +st.zoom);
      b.append(cv, el('b', '', c.name), el('i', '', c.id), el('span', 'tag', c.note));
      cards.append(b);
    }
    sec.append(h, cards); list.append(sec);
    return CONCEPTS.list.length;
  };

  UI.conceptDetail = (c, d) => {
    const big = el('div', 'view'), cv = el('canvas'), strip = el('div', 'faces'), path = el('div', 'path', 'Concept animations');
    path.append(el('span', 'st skip', c.note));
    CONCEPTS.play(cv, c, 4); big.append(cv);
    c.frames().forEach((f, i) => { const s = el('canvas'); CONCEPTS.draw(s, f, 2, [18, 18, 28, 42]); s.title = 'frame ' + (i + 1); strip.append(s); });
    d.append(el('h3', '', c.name), path, big, el('h4', '', c.frames().length + ' frames, ' + c.step + ' s each'), strip, el('p', '', c.about));
  };
})();
