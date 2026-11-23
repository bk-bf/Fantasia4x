'use strict';
TK.restyle = (() => {
  const { peek, each, luma, key } = TK;
  const NEAR = [[-1, 0], [1, 0], [0, -1], [0, 1]], AROUND = [...NEAR, [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const INK = 62, LINE = 52;

  function peel(s) {
    const gone = [];
    each(s, (x, y, c) => { if (c && luma(c) < INK && NEAR.some(([dx, dy]) => !peek(s, x + dx, y + dy))) gone.push(y * s.w + x); });
    for (const i of gone) s.c[i] = null;
  }

  function soften(s) {
    const next = [];
    each(s, (x, y, c) => {
      if (!c || luma(c) >= LINE) return;
      const lighter = AROUND.map(([dx, dy]) => peek(s, x + dx, y + dy)).filter(q => q && luma(q) > luma(c) * 1.8);
      if (lighter.length < 2) return;
      const avg = [0, 1, 2].map(k => lighter.reduce((a, q) => a + q[k], 0) / lighter.length);
      next.push([y * s.w + x, TK.cool(avg, .6)]);
    });
    for (const [i, c] of next) s.c[i] = c;
  }

  function cluster(s) {
    const next = [];
    each(s, (x, y, c) => {
      if (!c) return;
      const around = AROUND.map(([dx, dy]) => peek(s, x + dx, y + dy)).filter(Boolean);
      if (around.length < 5 || around.some(q => key(q) === key(c))) return;
      const tally = new Map();
      for (const q of around) tally.set(key(q), { c: q, n: (tally.get(key(q)) || { n: 0 }).n + 1 });
      next.push([y * s.w + x, [...tally.values()].sort((a, b) => b.n - a.n)[0].c]);
    });
    for (const [i, c] of next) s.c[i] = c;
  }

  function hueShift(s) {
    const made = new Map();
    const shifted = c => { const t = luma(c) / 255 - .45; return [clamp(c[0] + t * 30, 0, 255), clamp(c[1] + t * 8, 0, 255), clamp(c[2] - t * 34, 0, 255)].map(Math.round); };
    each(s, (x, y, c) => {
      if (!c) return;
      if (!made.has(key(c))) made.set(key(c), shifted(c));
      s.c[y * s.w + x] = made.get(key(c));
    });
  }

  const bare = img => {
    const s = TK.fromImage(img, 1);
    peel(s); soften(s); cluster(s); cluster(s); hueShift(s);
    return s;
  };
  const restyle = img => TK.outline(bare(img));
  restyle.bare = bare;
  return restyle;
})();
