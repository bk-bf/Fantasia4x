'use strict';
const WORLD_RASTER = (() => {
  function tube(pts, r0, r1) {
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])), total = lens.reduce((x, y) => x + y, 0) || 1;
    return (x, y) => {
      let best = -1, gap = Infinity, done = 0;
      lens.forEach((L, i) => {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1], u = L ? clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (L * L), 0, 1) : 0;
        const t = (done + u * L) / total, d = Math.hypot(x - ax - u * (bx - ax), y - ay - u * (by - ay)) - (r0 + (r1 - r0) * t);
        if (d <= 0 && d < gap) { gap = d; best = t; }
        done += L;
      });
      return best;
    };
  }
  const disc = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) <= r ? 0 : -1;
  const union = (...fs) => (x, y) => { for (const f of fs) { const t = f(x, y); if (t >= 0) return t; } return -1; };
  function raster(w, h, f, glyph) {
    const on = (x, y) => f(x + .5, y + .5) >= 0, rows = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        if (!on(x, y)) { row += ' '; continue; }
        const tone = !on(x, y - 1) || !on(x - 1, y) ? 'l' : !on(x, y + 1) || !on(x + 1, y) ? 'd' : !on(x, y - 2) ? 'l' : 'm';
        row += glyph ? glyph(f(x + .5, y + .5), tone, x, y) : tone;
      }
      rows.push(row);
    }
    return rows;
  }
  const curved = (w, h, pts, r0, r1, glyph) => raster(w, h, tube(pts, r0, r1), glyph);
  return { tube, disc, union, raster, curved };
})();
