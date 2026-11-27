'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  };
  const DEFAULTS = { cat: 'weapon', view: '', by: '', q: '', state: 'all', season: 'summer', zoom: '2', back: 'ground', sel: '', sort: '', dir: '', groups: '' };
  const query = new URLSearchParams(location.search);
  const st = { variant: '' };
  for (const k in DEFAULTS) st[k] = query.get(k) || DEFAULTS[k];
  st.groups = new Set(st.groups.split('|').filter(Boolean));

  const push = () => F4X.write({ ...st, groups: [...st.groups].join('|'), variant: undefined }, DEFAULTS);
  const toast = text => { const t = el('div', 'toast', text); document.body.append(t); setTimeout(() => t.remove(), 900); };
  const copy = text => { if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Copied ' + text), () => {}); };
  const num = v => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));
  const pct = v => Math.round(v * 100) + '%';
  const title = s => String(s).replace(/_/g, ' ').replace(/^\w/, m => m.toUpperCase());
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return { $, el, st, push, toast, copy, num, pct, title, slug, order: [] };
})();
