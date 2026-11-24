'use strict';
(() => {
  const X = DBX;
  const trimmed = s => {
    let x0 = s.w, y0 = s.h, x1 = 0, y1 = 0;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.c[y * s.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < x0) return s;
    x0 = Math.min(x0, s.ax - 8); x1 = Math.max(x1, s.ax + 8); y1 = Math.max(y1, s.ay + 2); y0 = Math.max(0, y0 - 1);
    const t = new Spr(x1 - x0 + 1, y1 - y0 + 1, s.ax - x0, s.ay - y0);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y - y0) * t.w + x - x0; t.c[i] = s.c[y * s.w + x]; t.e[i] = s.e[y * s.w + x]; }
    t.sh = s.sh;
    return t;
  };
  for (const r of FOLK_PIECES) [].concat(r.make).forEach((make, i) => X.reg('folk', r.id, String(i), () => trimmed(make())));
})();
