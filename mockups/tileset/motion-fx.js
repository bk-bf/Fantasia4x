'use strict';
const MOTION_FX = (() => {
  const BURST = {
    chips: { n: 8, cols: [P.plank[5], P.plank[4], P.wood[4], P.plank[3]], vx: [-55, 12], vy: 9, vz: [35, 95], g: 300, life: 1.15, at: [23, -15] },
    stone: { n: 10, cols: [P.rock[6], P.rock[5], P.rock[4], P.rock[3]], vx: [-70, 10], vy: 10, vz: [40, 110], g: 330, life: 1.1, at: [23, -19], puff: P.rock[5] },
    soil: { n: 7, cols: [P.tilled[4], P.tilled[3], P.soil[3], P.tilled[2]], vx: [-30, 14], vy: 6, vz: [25, 60], g: 300, life: 1, at: [21, -1] },
    spark: { n: 11, cols: [P.fire[4], P.fire[3], P.fire[3], P.fire[2]], vx: [-70, 70], vy: 8, vz: [30, 130], g: 320, life: .34, at: [19, -13], em: 255, flash: P.fire[4], air: 1 },
    blow: { n: 5, cols: [P.cloth[5], P.cloth[4], P.sand[5]], vx: [-40, 40], vy: 6, vz: [20, 70], g: 260, life: .3, at: [19, -17], flash: P.cloth[5], air: 1 },
    drops: { n: 14, cols: [P.foam[2], P.foam[1], P.shallow[5]], vx: [-60, 60], vy: 14, vz: [30, 90], g: 300, life: .5, at: [0, -12], air: 1 },
    dustfall: { n: 12, cols: [P.soil[5], P.soil[4], P.sand[4]], vx: [-40, 40], vy: 8, vz: [8, 40], g: 90, life: .7, at: [0, 0], air: 1 },
    leaves: { n: 16, cols: [P.oak[4], P.oak[5], P.fallOrange[4], P.oak[3]], vx: [-26, 26], vy: 10, vz: [-20, 10], g: 40, life: 1.6, at: [0, -50], air: 1, wob: 1 },
  };
  const GLYPH = {
    talk: ['.....', '.....', '#.#.#', '.....', '.....'],
    alert: ['..#..', '..#..', '..#..', '.....', '..#..'],
    z: ['####.', '..#..', '.#...', '####.', '.....'],
    tear: ['..#..', '.###.', '#####', '#####', '.###.'],
    heart: ['.#.#.', '#####', '#####', '.###.', '..#..'],
    food: ['.###.', '#####', '#####', '.###.', '.....'],
    note: ['..##.', '..#.#', '..#..', '###..', '###..'],
  };
  const GCOL = { talk: P.ink, alert: P.red[3], z: P.blue[3], tear: P.blue[4], heart: P.red[3], food: P.thatch[3], note: P.purple[3] };

  function burst(pen, kind, x, y, age, seed, dir, o) {
    const B = { ...BURST[kind], ...(o || {}) }, ox = x + B.at[0] * dir, oy = y;
    if (B.flash && age < .09) { const fy = oy + B.at[1]; for (let k = -3; k <= 3; k++) { pen.put(ox + k, fy, B.flash, 255); pen.put(ox, fy + k, B.flash, 255); } pen.put(ox - 1, fy - 1, B.flash, 255); pen.put(ox + 1, fy + 1, B.flash, 255); pen.put(ox + 1, fy - 1, B.flash, 255); pen.put(ox - 1, fy + 1, B.flash, 255); if (pen.glint) pen.glint(ox, fy, 60, [1, .7, .3]); }
    if (age > B.life) return;
    for (let i = 0; i < B.n; i++) {
      const h1 = hash(seed, i, 11), h2 = hash(seed, i, 12), h3 = hash(seed, i, 13), h4 = hash(seed, i, 14);
      const vx = mix(B.vx[0], B.vx[1], h1) * dir, vy = (h2 - .5) * 2 * B.vy, vz = mix(B.vz[0], B.vz[1], h3), z0 = -B.at[1];
      let z = z0 + vz * age - B.g * age * age / 2, tt = age;
      if (z < 0) { if (B.air) continue; const d = vz * vz + 2 * B.g * z0; tt = (vz + Math.sqrt(Math.max(0, d))) / B.g; z = 0; if (age - tt > B.life * .45 && dith(i, seed & 3) > (B.life - age) / (B.life * .55)) continue; }
      else if (B.air && age > B.life * (.5 + h4 * .5)) continue;
      const px = ox + vx * tt + (B.wob ? Math.sin(age * 7 + i) * 3 : 0), py = oy + vy * tt - z, c = B.cols[i % B.cols.length];
      pen.put(px, py, c, B.em); if (h4 > .6 && !B.em) pen.put(px + 1, py, dark(c, .78));
    }
    if (B.puff && age < .5) for (let i = 0; i < 6; i++) { const a = age / .5; if (dith(i, i * 3) < a) continue; pen.put(ox + (hash(seed, i, 21) - .5) * 9 * (1 + a), oy + B.at[1] - a * 6 - hash(seed, i, 22) * 5, B.puff); }
  }
  function arrow(pen, e, dir) {
    const x0 = e.x + dir * 12, y0 = e.y - 22, to = e.to || [e.x + dir * 150, e.y], x1 = to[0], y1 = to[1] - (e.stick ? 0 : 12), d = Math.hypot(x1 - x0, y1 - y0), T = d / 300;
    if (e.age < T) { const k = e.age / T, x = mix(x0, x1, k), y = mix(y0, y1, k) - Math.sin(k * Math.PI) * 5, ux = (x1 - x0) / d, uy = (y1 - y0) / d - Math.cos(k * Math.PI) * .12; for (let i = 0; i < 7; i++) pen.put(x - ux * i, y - uy * i, i === 0 ? P.iron[6] : i > 5 ? P.cloth[5] : P.wood[5]); return; }
    if (e.stick && e.age < T + 5) { if (dith(3, 1) > (T + 5 - e.age)) return; for (let i = 0; i < 6; i++) pen.put(x1 - dir * i * .6, y1 - i, i > 4 ? P.cloth[5] : P.wood[5]); }
  }
  function steps(pen, falls, lvl, rig) {
    for (const f of falls) {
      const g = pen.ground(f.x, f.y), fast = f.anim === 'run' || f.anim === 'panic' || f.anim === 'bolt', small = rig !== 'pawn' && rig !== 'quad';
      if (g === 'water') {
        if (f.age < .6) { const r = 2 + f.age * 11, a = 1 - f.age / .6; for (let k = 0; k < 14; k++) { if (dith(k, f.n) > a) continue; const an = k / 14 * TAU; pen.put(f.x + Math.cos(an) * r, f.y + Math.sin(an) * r * .45, P.foam[k & 1 ? 2 : 1]); } if (f.age < .25) for (let k = 0; k < 4; k++) pen.put(f.x + (k - 1.5) * 2, f.y - 2 - Math.sin(f.age / .25 * Math.PI) * (4 + k % 2 * 2), P.foam[2]); }
      } else if (g === 'soft' || g === 'snow') {
        const a = 1 - f.age / 9, u = pen.under ? pen.under(f.x, f.y) : P.soil[2], core = g === 'snow' ? P.moon[2] : dark(u, .38), rim = g === 'snow' ? P.snow[0] : dark(u, .62), hi = g === 'snow' ? P.snow[4] : lit(u, 1.35);
        if (a > 0 && !small) for (const [dx, dy, c] of [[0, 0, core], [1, 0, core], [2, 0, core], [0, 1, core], [1, 1, core], [2, 1, rim], [3, 0, rim], [-1, 1, rim], [0, -1, hi], [1, -1, hi]]) if (dith(rnd(f.x) + dx, rnd(f.y) + dy) < a * 1.6 - (c === core ? 0 : .35)) pen.put(f.x + dx, f.y + dy, c, 0, 1);
        if (g === 'soft' && f.age < .4 && !small) { const a2 = f.age / .4, n = fast ? 6 : 3; for (let k = 0; k < n; k++) { if (dith(k, f.n) < a2 * .8) continue; pen.put(f.x - f.dx * (2 + a2 * 6) + (hash(f.n, k, 5) - .5) * 5, f.y - 1 - a2 * (3 + k % 3) - hash(f.n, k, 6) * 2, P.sand[4 + (k & 1)]); } }
      } else if (g === 'grass' && f.age < .3 && !small) {
        for (const sd of [-1, 1]) { pen.put(f.x + sd * 3, f.y - 1, P.grass[4]); pen.put(f.x + sd * 4, f.y - 2, P.grass[5]); }
      }
    }
  }
  function bubble(pen, x, y, kind, t) {
    const g = GLYPH[kind], bx = rnd(x) - 4, by = rnd(y) - 9 + (Math.sin(t * 3) > .6 ? -1 : 0);
    for (let j = -1; j < 8; j++) for (let i = -1; i < 10; i++) {
      const edge = j < 0 || j > 6 || i < 0 || i > 8, corner = (j < 0 || j > 6) && (i < 0 || i > 8);
      if (corner) continue;
      pen.put(bx + i, by + j, edge ? P.ink : P.cloth[5], 200);
    }
    pen.put(bx + 3, by + 8, P.ink, 200); pen.put(bx + 4, by + 8, P.cloth[5], 200); pen.put(bx + 5, by + 8, P.ink, 200); pen.put(bx + 4, by + 9, P.ink, 200);
    const sh = kind === 'talk' ? Math.floor(t * 4) % 3 : -1;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (g[j][i] === '#' && (sh < 0 || i <= sh * 2)) pen.put(bx + 2 + i, by + 1 + j, GCOL[kind], 200);
  }
  function zzz(pen, x, y, t) {
    for (let k = 0; k < 2; k++) { const a = ((t / 2.2 + k * .5) % 1), zx = rnd(x + 4 + a * 7 + Math.sin(a * 6) * 1.5), zy = rnd(y - a * 13), big = a > .5 ? 1 : 0; if (a > .9) continue; for (let i = 0; i < 3 + big; i++) { pen.put(zx + i, zy, P.cloth[5], 180); pen.put(zx + i, zy + 2 + big, P.cloth[5], 180); pen.put(zx + 2 + big - i, zy + i, P.cloth[5], 180); } }
  }
  const STAR_ARMS = [[1, 0], [-1, 0], [0, 1], [0, -1]], STAR_TURN = 3.4, STAR_GLOW = 220;
  function star(pen, x, y, reach) {
    for (let r = reach; r > 0; r--) for (const [dx, dy] of STAR_ARMS) pen.put(x + dx * r, y + dy * r, P.fire[r === reach ? 2 : 3], STAR_GLOW);
    pen.put(x, y, P.fire[reach > 1 ? 4 : 3], STAR_GLOW);
  }
  function stars(pen, x, y, t) {
    const ring = [0, 1, 2].map(k => { const a = (t / STAR_TURN + k / 3) * Math.PI * 2, near = Math.sin(a), dim = Math.floor(t * 2.5 + k * 1.3) % 5 === 0 ? 1 : 0; return { x: rnd(x + Math.cos(a) * 7), y: rnd(y + near * 2.6), near, reach: Math.max(0, (near > .3 ? 2 : 1) - dim) }; });
    for (const s of ring.sort((a, b) => a.near - b.near)) star(pen, s.x, s.y, s.reach);
  }
  function breath(pen, x, y, dir, t, seed) {
    const a = (t / 2.6 + seed) % 1;
    if (a > .42) return;
    const k = a / .42;
    for (let i = 0; i < 7; i++) { if (dith(i, rnd(k * 4)) < k * .9) continue; pen.put(x + dir * (1 + k * 6 + hash(i, 1, 31) * 3), y - k * 4 - hash(i, 2, 31) * (2 + k * 3), i & 1 ? P.snow[4] : P.ice[2]); }
  }
  function flame(pen, x, y, t, seed) {
    const f = Math.floor(t * 9 + seed * 7);
    for (let dx = -2; dx <= 2; dx++) { const hh = Math.max(1, 7 - Math.abs(dx) * 2.2 + (hash(dx, f, 3) - .5) * 3); for (let j = 0; j < hh; j++) { const fr = j / hh, wob = rnd(Math.sin(j * .7 + f * 2.1 + dx) * fr * 1.4); pen.put(x + dx + wob, y - j, P.fire[fr < .3 && Math.abs(dx) < 1 ? 4 : fr < .55 ? 3 : fr < .8 ? 2 : 1], 255); } }
    for (let i = 0; i < 3; i++) { const a = (t * .9 + i / 3 + seed) % 1; if (dith(i, rnd(a * 4)) < a) continue; pen.put(x + Math.sin(a * 5 + i) * 2, y - 8 - a * 12, P.furGrey[3 + (i & 1)]); }
  }
  function smoke(pen, x, y, t) {
    for (let i = 0; i < 9; i++) { const a = (t * .42 + i / 9) % 1, sx = x + Math.sin(a * 4 + i * 2.1) * (2 + a * 5) + a * 6, sy = y - a * 34; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0]]) { if (dith(rnd(sx) + dx, rnd(sy) + dy) < a * 1.1) continue; pen.put(sx + dx, sy + dy, P.furGrey[a < .4 ? 3 : 4]); } }
  }
  return { burst, arrow, steps, bubble, zzz, stars, breath, flame, smoke };
})();
