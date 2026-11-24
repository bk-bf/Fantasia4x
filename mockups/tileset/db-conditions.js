'use strict';
(() => {
  const X = DBX;
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const spr = ({ w, h, px }) => { const s = new Spr(w, h); px.forEach((c, i) => c && s.set(i % w, (i / w) | 0, rgb(c), 0)); return s; };
  for (const r of CONDITION_ICONS.rows) X.reg('condition', r.id, '0', () => spr(r.sprite), { icon: true });
})();
