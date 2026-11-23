'use strict';
(() => {
  const root = document.documentElement, q = new URLSearchParams(location.search);
  const theme = t => { if (t && t !== 'auto') root.dataset.theme = t; else delete root.dataset.theme; };
  if (q.get('theme')) theme(q.get('theme'));

  function write(vals, defs = {}) {
    const p = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(vals)) {
      if (v === undefined || v === null || v === '' || String(v) === String(defs[k])) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString().replace(/%2C/g, ',');
    history.replaceState(null, '', (s ? '?' + s : location.pathname) + location.hash);
  }

  function bar(onChange = () => {}) {
    const mock = document.getElementById('mock'), pill = !mock.classList.contains('bar'), hide = document.getElementById('mockhide');
    const groups = [...mock.querySelectorAll('.grp[data-k]')], defs = {}, state = {};
    for (const g of groups) {
      const k = g.dataset.k, vals = [...g.querySelectorAll('button[data-v]')].map(b => b.dataset.v);
      defs[k] = g.dataset.def ?? vals[0];
      state[k] = vals.includes(q.get(k)) ? q.get(k) : defs[k];
    }
    if (pill) { defs.strip = '1'; state.strip = q.get('strip') === '0' ? '0' : '1'; }
    const sync = () => {
      for (const g of groups) for (const b of g.querySelectorAll('button[data-v]')) b.classList.toggle('on', b.dataset.v === state[g.dataset.k]);
      if ('theme' in state) theme(state.theme);
      if (pill) {
        document.body.classList.toggle('nostrip', state.strip === '0');
        if (hide) hide.textContent = state.strip === '0' ? 'Show · `' : 'Hide · `';
      }
      write(state, defs);
    };
    const set = (k, v) => { state[k] = String(v); sync(); onChange(state, k); };
    const flip = () => set('strip', state.strip === '0' ? '1' : '0');
    mock.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b === hide) { flip(); return; }
      const g = b.closest('.grp[data-k]');
      if (g && b.dataset.v !== undefined) set(g.dataset.k, b.dataset.v);
    });
    if (pill) addEventListener('keydown', ev => {
      if (ev.key !== '`' || ev.ctrlKey || ev.metaKey || ev.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
      flip();
    });
    sync();
    return F4X.ui = { state, set, write };
  }

  const F4X = window.F4X = { bar, write, ui: null };
  document.addEventListener('DOMContentLoaded', () => { if (!F4X.ui && document.getElementById('mock')) bar(); });
})();
