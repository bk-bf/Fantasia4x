'use strict';
(() => {
  const { hash, value, cover, soilShade, grassShade, warp } = TGN;
  const { KINDS, GROUND } = TGK;
  const TILE = 32,
    CHUNK = 256,
    APRON = 4;
  const LIGHT = [1, 0.985, 0.98];
  const BED = 0.5,
    CORE = 0.86,
    RAG = 0.56,
    RIM = 0.035,
    LIP = 3,
    FLECK = 6;
  const AGE = { young: { peak: 0.46, reach: 14 }, mature: { peak: 1.2, reach: 30 }, elder: { peak: 1.3, reach: 58 } };
  const PLANTS = new Set(['fern', 'tuft', 'gtuft', 'cushion', 'flower', 'apple', 'berry', 'sedge', 'puddle', 'bell']);
  const THIRSTY = new Set(['fern', 'tuft', 'cushion', 'flower', 'sedge', 'bell', 'puddle', 'shroom']);
  const SHAPES = {
    leaf: [[[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [-1, 1]]],
    needle: [[[0, 0], [1, -1], [2, -2]], [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 1], [2, 2]], [[0, 0], [1, 0], [2, -1]], [[0, 0], [0, 1], [1, 2]]],
    glint: [[[0, 0]], [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]]
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rgb = (h) => [parseInt(h.slice(1, 3), 16) * LIGHT[0], parseInt(h.slice(3, 5), 16) * LIGHT[1], parseInt(h.slice(5, 7), 16) * LIGHT[2]];
  const dark = (c, k) => [c[0] * k, c[1] * k, Math.min(255, c[2] * (k + 0.1))];
  const lum = (r, g, b) => (r * 0.3 + g * 0.59 + b * 0.11) / 255;

  function create(scene, name, layers) {
    const view = scene.views[name];
    const M = view.margin * TILE,
      TW = view.w + 2 * view.margin,
      TH = view.h + 2 * view.margin,
      W = view.w * TILE,
      H = view.h * TILE;
    const P = Object.fromEntries(Object.entries(scene.palette).map(([k, v]) => [k, v.map(rgb)]));
    const rampOf = (r) => (Array.isArray(r) ? r.map(rgb) : P[r]);
    const C = (ramp, i) => {
      const r = rampOf(ramp);
      return r ? r[clamp(i, 0, r.length - 1)] : null;
    };
    const SPEC = {};
    for (const [kind, k] of Object.entries(KINDS)) {
      SPEC[kind] = {
        ...k,
        gain: k.gain ?? 1,
        bedRamp: rampOf(k.bed),
        coreRamp: k.core ? rampOf(k.core) : null,
        mossRamp: k.moss ? rampOf(k.moss.ramp) : null,
        herbRamp: k.herb ? rampOf(k.herb.ramp) : null,
        tintRamp: k.tint?.ramp ? rampOf(k.tint.ramp) : null,
        fleckCols: k.fleck.cols.map(([r, i]) => C(r, i)),
        fallRamp: k.autumn ? P[k.autumn.fall] : null,
        crackCol: k.crack ? C(k.crack.col[0], k.crack.col[1]) : null,
        hotCol: k.crack?.hot ? C(k.crack.hot[0], k.crack.hot[1]) : null,
        glowCol: k.glow ? rgb(k.glow) : null,
        stainRamp: k.stain ? rampOf(k.stain) : null,
        bark: scene.kinds[kind].bark.length >= 4 ? scene.kinds[kind].bark.map(rgb) : P.wood
      };
    }
    const TUFTS = Object.fromEntries(Object.entries(scene.tufts).map(([k, list]) => [k, list.map((px) => px.map(([x, y, h]) => [x, y, rgb(h)]))]));
    const cls = (tx, ty) => (tx < 0 || ty < 0 || tx >= TW || ty >= TH ? 'x' : view.kinds[ty][tx]);
    const plans = new Map();
    const tmp = [0, 0];

    function plan(season, forced) {
      const key = `${season}|${forced}`;
      if (plans.has(key)) return plans.get(key);
      const magic = new Set(scene.magic);
      const trees = view.trees.map((t, id) => {
        const kind = forced && (t.age !== 'elder' || magic.has(forced)) ? forced : t.kind;
        const sprite = scene.sprites[`${kind}-${t.age}-${t.seed}`] ?? scene.sprites[`${kind}-${t.age}-1`];
        const age = AGE[t.age];
        const fx = (t.x + view.margin + 0.5) * TILE,
          fy = (t.y + view.margin) * TILE + 27;
        const spec = SPEC[kind];
        return { id, kind, age: t.age, sprite, key: `${kind}-${t.age}-${scene.sprites[`${kind}-${t.age}-${t.seed}`] ? t.seed : 1}`, fx, fy, foot: sprite.foot, spec, R: (sprite.foot + age.reach * spec.gain) / 0.583, peak: age.peak };
      });
      const str = new Float32Array(TW * TH),
        best = new Float32Array(TW * TH),
        own = new Int16Array(TW * TH).fill(-1);
      for (const t of trees) {
        const x0 = Math.max(0, Math.floor((t.fx - t.R) / TILE)),
          x1 = Math.min(TW - 1, Math.floor((t.fx + t.R) / TILE)),
          y0 = Math.max(0, Math.floor((t.fy - t.R) / TILE)),
          y1 = Math.min(TH - 1, Math.floor((t.fy + t.R) / TILE));
        for (let ty = y0; ty <= y1; ty++)
          for (let tx = x0; tx <= x1; tx++) {
            if (cls(tx, ty) === 'x') continue;
            const d = Math.hypot((tx + 0.5) * TILE - t.fx, ((ty + 0.5) * TILE - t.fy) * 1.3);
            const s = Math.min(1, t.peak * (1 - d / t.R));
            if (s <= 0) continue;
            const i = ty * TW + tx;
            str[i] = 1 - (1 - str[i]) * (1 - s);
            if (s > best[i]) {
              best[i] = s;
              own[i] = t.id;
            }
          }
      }
      const near = new Uint8Array(TW * TH);
      for (let ty = 0; ty < TH; ty++)
        for (let tx = 0; tx < TW; tx++) {
          let hit = 0;
          for (let dy = -2; dy <= 2 && !hit; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              const x = tx + dx,
                y = ty + dy;
              if (x >= 0 && y >= 0 && x < TW && y < TH && str[y * TW + x] > 0) {
                hit = 1;
                break;
              }
            }
          near[ty * TW + tx] = hit;
        }
      const pl = { season, trees, str, own, near, decor: [] };
      pl.decor = dress(pl);
      plans.set(key, pl);
      return pl;
    }

    function probe(pl, ax, ay, out) {
      warp(ax, ay, tmp);
      const wx = tmp[0],
        wy = tmp[1];
      const tx = clamp(Math.floor(wx / TILE), 0, TW - 1),
        ty = clamp(Math.floor(wy / TILE), 0, TH - 1);
      const c = view.kinds[ty][tx];
      out.cls = c;
      out.level = -1;
      out.tree = -1;
      const ground = GROUND[c];
      if (!ground.gain) return out;
      const gx = wx / TILE - 0.5,
        gy = wy / TILE - 0.5;
      const x0 = clamp(Math.floor(gx), 0, TW - 2),
        y0 = clamp(Math.floor(gy), 0, TH - 2);
      const fx = clamp(gx - x0, 0, 1),
        fy = clamp(gy - y0, 0, 1);
      const i = y0 * TW + x0;
      const a = pl.str[i] * (1 - fx) * (1 - fy),
        b = pl.str[i + 1] * fx * (1 - fy),
        d = pl.str[i + TW] * (1 - fx) * fy,
        e = pl.str[i + TW + 1] * fx * fy;
      const s = a + b + d + e;
      if (s <= 0) return out;
      const top = Math.max(a, b, d, e);
      out.tree = pl.own[top === a ? i : top === b ? i + 1 : top === d ? i + TW : i + TW + 1];
      if (out.tree < 0) return out;
      const cov = cover(ax, ay);
      out.cov = cov;
      const spec = pl.trees[out.tree].spec;
      out.level = s * ground.gain + (cov - 0.5) * (spec.hard ? RAG * 0.72 : RAG);
      return out;
    }

    function dress(pl) {
      const out = [];
      const at = {};
      const winter = pl.season === 'winter',
        autumn = pl.season === 'autumn';
      const mask = layers.keep.data,
        bit = winter ? 2 : 0;
      for (const t of pl.trees) {
        if (t.age === 'young') continue;
        const elder = t.age === 'elder';
        let n = 0;
        const r = () => hash(t.id, ++n, 211);
        const spec = t.spec;
        const rootPx = TGP.roots(r, t, spec.roots, spec.bark, C, elder);
        if (winter && (spec.winter === 'buried' || spec.winter === 'ice')) for (const p of rootPx) if (!p[3] && r() < 0.5 && p[2] !== spec.bark[1]) p[2] = P.snow[4];
        out.push({ y: t.fy - 1, x: t.fx, px: rootPx, root: true, tree: t.id });
        let list = (autumn && spec.autumn?.props ? spec.props.filter((p) => !spec.autumn.props.some((q) => q[0] === p[0])).concat(spec.autumn.props) : spec.props).slice();
        if (winter) list = spec.winterProps ?? (spec.winter === 'buried' ? list.filter((p) => !PLANTS.has(p[0])) : list.filter((p) => p[0] !== 'apple' && p[0] !== 'puddle'));
        const placed = [];
        const put = (type, tone, a, rad) => {
          const px = t.fx + Math.cos(a) * rad,
            py = t.fy + Math.sin(a) * rad * 0.62 + 2;
          const vx = Math.round(px - M),
            vy = Math.round(py - M);
          if (vx < 2 || vy < 2 || vx >= W - 2 || vy >= H - 2) return;
          if (mask[(vy * W + vx) * 4 + bit]) return;
          probe(pl, px, py, at);
          if (at.level < 0.3 || at.tree !== t.id) return;
          if (GROUND[at.cls].dry && THIRSTY.has(type)) return;
          if (placed.some((q) => Math.hypot(q[0] - px, (q[1] - py) * 1.6) < 8)) return;
          placed.push([px, py]);
          out.push({ y: py, x: px, px: type === 'gtuft' ? TUFTS[tone][Math.floor(r() * TUFTS[tone].length)] : TGP.MAKE[type](r, C, tone), tree: t.id });
        };
        const rim = (a) => {
          for (let rad = t.R; rad > t.foot; rad -= 3) {
            probe(pl, t.fx + Math.cos(a) * rad, t.fy + Math.sin(a) * rad * 0.62 + 2, at);
            if (at.level >= BED + 0.02 && at.tree === t.id) return rad - 1 - r() * 5;
          }
          return -1;
        };
        for (const [type, mature, old, r0, r1, tone] of list) {
          const count = elder ? old : mature;
          for (let i = 0; i < count; i++) {
            let a = r() * Math.PI * 2;
            if (r0 === 'rim') {
              const rad = rim(a);
              if (rad > 0) put(type, tone, a, rad);
              continue;
            }
            if (Math.sin(a) < -0.3) a = -a;
            if (r0 === 'foot') put(type, tone, a, t.foot * (0.9 + r() * 0.3) + 3 + r() * 4);
            else put(type, tone, a, t.foot * (elder ? 0.9 : 1) + (r0 + r() * (r1 - r0)) * (elder ? 44 : 22));
          }
        }
        if (spec.ring) {
          const count = spec.ring.n[elder ? 1 : 0],
            rad = t.foot + spec.ring.r[elder ? 1 : 0] * TILE,
            gap = r() * count;
          for (let i = 0; i < count; i++) {
            if (Math.abs(i - gap) < 1.2 || r() < 0.12) continue;
            put(spec.ring.type, spec.ring.palette, (i / count) * Math.PI * 2 + (r() - 0.5) * 0.12, rad + (r() - 0.5) * 5);
          }
        }
      }
      return out.sort((a, b) => a.y - b.y);
    }

    function bed(spec, x, y, level, cls, season, under, r, g, b) {
      const sh = soilShade(x, y, 57);
      let ramp = spec.bedRamp;
      if (spec.remap && r !== undefined && !(spec.coreRamp && level > CORE + 0.05)) {
        if (!GROUND[cls].grassy) return null;
        return ramp[clamp(Math.round(((lum(r, g, b) - 0.16) / 0.36) * (ramp.length - 1)), 1, ramp.length - 1)];
      }
      const n = ramp.length - 1;
      let idx = n - 2 + sh - (spec.bedDrop ?? 0);
      if (level > CORE) idx -= 1;
      if (spec.coreRamp && level > CORE + 0.05) {
        ramp = spec.coreRamp;
        idx = ramp.length - 4 + sh;
      }
      let c = ramp[clamp(idx, 0, ramp.length - 1)];
      if (season === 'autumn' && spec.fallRamp && sh >= 1 && hash(x >> 1, y >> 1, 91) < spec.autumn.carpet + 0.3) c = spec.fallRamp[sh >= 2 ? 3 : 2];
      if (spec.herbRamp) {
        const ground = GROUND[cls];
        const amount = spec.herb.amount * (ground.dry ? 0.5 : ground.grassy ? 1 : 0.82) * clamp((CORE + 0.06 - level) / (CORE - BED), 0, 1) * (season === 'autumn' && spec.fallRamp ? 0.5 : 1);
        const cov = cover(x + 613, y + 271);
        const span = (cov - 0.2) / 0.6;
        if (span < amount) {
          const hr = spec.herbRamp,
            hn = hr.length - 1;
          const g = hr[clamp(hn - 3 - (spec.herb.low ?? 0) + grassShade(x, y, 77), 0, hn)];
          return span > amount - 0.03 ? dark(g, 0.7) : g;
        }
        if ((cover(x + 613, y + 271 - LIP) - 0.2) / 0.6 < amount) c = dark(c, 0.68);
      }
      if (spec.mossRamp && spec.moss.stain) {
        const m = value(x * 0.085, y * 0.11, 131) * 0.62 + value(x * 0.29, y * 0.29, 137) * 0.38;
        const thr = 0.74 - spec.moss.amount * 0.16 - (level - BED) * 0.26;
        if (level > BED + 0.1 && m > thr) {
          const below = value(x * 0.085, (y + 2) * 0.11, 131) * 0.62 + value(x * 0.29, (y + 2) * 0.29, 137) * 0.38;
          let mi = (spec.moss.base ?? 2) + (m > thr + 0.07 ? 1 : 0) + (sh > 0 ? 1 : 0);
          if (below <= thr) mi -= 2;
          c = spec.mossRamp[clamp(mi, 0, spec.mossRamp.length - 1)];
        }
      }
      if (spec.crackCol) {
        const cr = Math.abs(value(x * 0.06, y * 0.06, 141) - 0.5) + (value(x * 0.3, y * 0.3, 143) - 0.5) * 0.06;
        if (cr < 0.013) c = spec.hotCol && hash(x >> 2, y >> 2, 145) < 0.4 ? spec.hotCol : spec.crackCol;
      }
      if (under && GROUND[cls].grassy) c = dark(c, 0.68);
      return c;
    }

    function tint(spec, r, g, b, cls) {
      const mode = spec.tint.mode;
      if (mode === 'wet') return [r * 0.72, g * 0.78, b * 0.82];
      if (mode === 'hex') return [r * 0.7, g * 0.6, b * 0.84];
      const l = lum(r, g, b);
      if (mode === 'rime') return l > 0.4 ? P.frost[5] : l > 0.3 ? P.frost[4] : [r * 0.7, g * 0.9, Math.min(255, b * 1.05 + 26)];
      if (!GROUND[cls].grassy) return [r * 0.86, g * 0.84, b * 0.82];
      const ramp = spec.tintRamp;
      return ramp[clamp(Math.round(((l - 0.14) / 0.4) * (ramp.length - 1)), 0, ramp.length - 1)];
    }

    function paint(cx, cy, season, forced, on) {
      const pl = plan(season, forced);
      const x0 = cx * CHUNK,
        y0 = cy * CHUNK,
        w = Math.min(CHUNK, W - x0),
        h = Math.min(CHUNK, H - y0);
      const out = new ImageData(w, h);
      const o = out.data;
      const winter = season === 'winter',
        autumn = season === 'autumn';
      const base = (winter ? layers.winter : layers.summer).data,
        summer = layers.summer.data,
        mask = layers.keep.data,
        bit = winter ? 2 : 0;
      const aw = w + 2 * APRON,
        ah = h + 2 * APRON;
      const level = new Float32Array(aw * ah).fill(-1),
        who = new Int16Array(aw * ah).fill(-1),
        kind = new Uint8Array(aw * ah);
      const at = {};
      if (on)
        for (let j = 0; j < ah; j++)
          for (let i = 0; i < aw; i++) {
            const ax = x0 + i - APRON + M,
              ay = y0 + j - APRON + M;
            const tx = Math.floor(ax / TILE),
              ty = Math.floor(ay / TILE);
            if (tx < 0 || ty < 0 || tx >= TW || ty >= TH || !pl.near[ty * TW + tx]) continue;
            probe(pl, ax, ay, at);
            const q = j * aw + i;
            level[q] = at.level;
            who[q] = at.tree;
            kind[q] = at.cls.charCodeAt(0);
          }
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const vi = ((y0 + y) * W + x0 + x) * 4,
            oi = (y * w + x) * 4,
            q = (y + APRON) * aw + x + APRON;
          let r = base[vi],
            g = base[vi + 1],
            b = base[vi + 2];
          const L = level[q];
          if (L > 0 && !mask[vi + bit]) {
            const t = pl.trees[who[q]],
              spec = t.spec,
              c = String.fromCharCode(kind[q]),
              ax = x0 + x + M,
              ay = y0 + y + M;
            let col = null;
            const under = level[q - LIP * aw] < BED;
            if (!winter) {
              if (L >= BED) col = bed(spec, ax, ay, L, c, season, under, r, g, b);
              else if (L >= BED - RIM && GROUND[c].grassy) col = [r * 0.72, g * 0.72, b * 0.76];
              else if (spec.tint && L >= BED - spec.tint.reach) col = tint(spec, r, g, b, c);
            } else col = frozen(spec, ax, ay, L, c, vi, summer, r, g, b, under);
            if (col) {
              r = col[0];
              g = col[1];
              b = col[2];
            }
          }
          o[oi] = r;
          o[oi + 1] = g;
          o[oi + 2] = b;
          o[oi + 3] = 255;
        }
      const set = (vx, vy, c) => {
        const x = vx - x0,
          y = vy - y0;
        if (x < 0 || y < 0 || x >= w || y >= h || mask[(vy * W + vx) * 4 + bit]) return;
        const i = (y * w + x) * 4;
        o[i] = c[0];
        o[i + 1] = c[1];
        o[i + 2] = c[2];
      };
      if (on) {
        flecks(pl, x0, y0, w, h, aw, level, who, kind, season, set);
        for (const d of pl.decor) {
          if (d.y < y0 + M - 100 || d.y > y0 + M + h + 100 || d.x < x0 + M - 140 || d.x > x0 + M + w + 140) continue;
          const bx = Math.round(d.x - M),
            by = Math.round(d.y - M);
          for (const p of d.px) {
            const vx = bx + p[0],
              vy = by + p[1];
            if (d.root) {
              const x = vx - x0 + APRON,
                y = vy - y0 + APRON;
              if (x < 0 || y < 0 || x >= aw || y >= ah) continue;
              const k = kind[y * aw + x];
              if (k === 119 || k === 120 || k === 0) continue;
            }
            set(vx, vy, p[2]);
          }
        }
      }
      shade(pl, x0, y0, w, h, o);
      return out;
    }

    function frozen(spec, ax, ay, L, c, vi, summer, r, g, b, under) {
      const mode = spec.winter;
      const snow = P.snow;
      if (mode === 'well' || mode === 'melt') {
        const edge = mode === 'melt' ? BED - 0.16 : BED;
        if (L >= BED + 0.03) {
          const col = bed(spec, ax, ay, L, c, 'summer', false);
          if (mode === 'well' && L < CORE - 0.1 && cover(ax + 37, ay + 11) < 0.4) return snow[cover(ax + 37, ay + 8) < 0.4 ? 4 : 2];
          return under && mode === 'well' ? dark(col, 0.8) : col;
        }
        if (L >= edge) {
          if (mode === 'melt') return P.mud[clamp(1 + soilShade(ax, ay, 57), 0, 3)];
          return spec.stainRamp && value(ax * 0.12, ay * 0.12, 151) > 0.5 ? [226, 196, 172] : snow[1];
        }
        if (L >= edge - 0.05) return snow[mode === 'melt' ? 1 : 2];
        return null;
      }
      if (mode === 'ice') {
        if (L >= BED) {
          const ice = P.ice ?? spec.bedRamp;
          const cr = Math.abs(value(ax * 0.09, ay * 0.09, 93) - 0.5) + (value(ax * 0.4, ay * 0.4, 94) - 0.5) * 0.04;
          if (cr < 0.012) return snow[4];
          const t = value(ax * 0.07, ay * 0.1, 161);
          return L > CORE ? P.frost[3] : t > 0.62 ? ice[Math.min(2, ice.length - 1)] : t > 0.38 ? ice[1] : P.frost[4];
        }
        if (L >= BED - 0.05) return snow[1];
        return null;
      }
      if (L >= CORE + 0.03) return dark(bed(spec, ax, ay, L, c, 'summer', false), 0.9);
      if (L >= CORE - 0.02) return snow[1];
      if (L >= BED) {
        const m = value(ax * 0.085, ay * 0.11, 131) * 0.62 + value(ax * 0.29, ay * 0.29, 137) * 0.38;
        if (spec.glowCol && m > 0.5) return m > 0.6 ? spec.glowCol : [spec.glowCol[0] * 0.5 + 118, spec.glowCol[1] * 0.5 + 121, spec.glowCol[2] * 0.5 + 124];
        if (spec.stainRamp && m > 0.52) return spec.stainRamp[m > 0.6 ? 3 : 4];
        if (cover(ax + 19, ay + 5) > 0.56) return snow[2];
        return snow[3];
      }
      if (L >= BED - 0.04) return snow[2];
      return null;
    }

    function flecks(pl, x0, y0, w, h, aw, level, who, kind, season, set) {
      const winter = season === 'winter',
        autumn = season === 'autumn';
      const c0 = Math.floor((x0 + M - 4) / FLECK),
        c1 = Math.floor((x0 + M + w + 4) / FLECK),
        r0 = Math.floor((y0 + M - 4) / FLECK),
        r1 = Math.floor((y0 + M + h + 4) / FLECK);
      for (let cy = r0; cy <= r1; cy++)
        for (let cx = c0; cx <= c1; cx++) {
          const ax = cx * FLECK + Math.floor(hash(cx, cy, 171) * FLECK),
            ay = cy * FLECK + Math.floor(hash(cx, cy, 173) * FLECK);
          const i = ax - M - x0 + APRON,
            j = ay - M - y0 + APRON;
          if (i < 0 || j < 0 || i >= aw || j >= h + 2 * APRON) continue;
          const q = j * aw + i,
            L = level[q];
          if (L < 0.12) continue;
          const spec = pl.trees[who[q]].spec,
            f = spec.fleck;
          const fall = autumn && spec.fallRamp;
          const carpet = fall ? spec.autumn.carpet : 0;
          let dens = L >= BED ? f.bed * (1 + carpet * 3.2) : L >= BED - (fall ? 0.34 : 0.14) ? f.out + carpet * 0.42 : 0;
          if (winter) dens = spec.winter === 'buried' ? (L >= BED ? f.bed * 0.3 : 0) : L >= BED + 0.03 ? f.bed : 0;
          if (spec.winter === 'ice' && winter) dens = L >= BED ? f.bed : 0;
          if (hash(cx, cy, 175) >= dens) continue;
          const shapes = SHAPES[f.shape],
            shape = shapes[Math.floor(hash(cx, cy, 177) * shapes.length)];
          const pick = Math.floor(hash(cx, cy, 179) * 3);
          const col = fall ? spec.fallRamp[[4, 3, 2][pick]] : spec.fleckCols[pick % spec.fleckCols.length];
          const k = String.fromCharCode(kind[q]);
          if (k === 'w' || k === 'x') continue;
          shape.forEach(([dx, dy], n) => set(ax - M + dx, ay - M + dy, n === 0 || f.shape !== 'leaf' ? col : dark(col, 0.72)));
        }
    }

    function shade(pl, x0, y0, w, h, o) {
      const dim = new Uint8Array(w * h);
      for (const t of pl.trees) {
        const sh = t.sprite.sh;
        if (!sh) continue;
        const sx = t.fx - M + sh.dx,
          sy = t.fy - M;
        const rx = sh.rx,
          ry = sh.ry;
        if (sx + rx * 1.2 < x0 || sx - rx * 1.2 > x0 + w || sy + ry * 1.2 < y0 || sy - ry * 1.2 > y0 + h) continue;
        const ya = Math.max(y0, Math.floor(sy - ry * 1.2)),
          yb = Math.min(y0 + h - 1, Math.ceil(sy + ry * 1.2)),
          xa = Math.max(x0, Math.floor(sx - rx * 1.2)),
          xb = Math.min(x0 + w - 1, Math.ceil(sx + rx * 1.2));
        for (let y = ya; y <= yb; y++)
          for (let x = xa; x <= xb; x++) {
            const q = Math.hypot((x - sx) / rx, (y - sy) / ry) + (value(x / 6, y / 4, 77) - 0.5) * 0.32;
            if (q >= 1) continue;
            const i = (y - y0) * w + x - x0;
            dim[i] = Math.max(dim[i], q > 0.82 ? 1 : 2);
          }
      }
      for (let i = 0; i < w * h; i++) {
        if (!dim[i]) continue;
        const k = dim[i] === 1 ? 0.88 : 0.76;
        o[i * 4] *= k;
        o[i * 4 + 1] *= k;
        o[i * 4 + 2] *= k;
      }
    }

    return { W, H, M, CHUNK, view, plan, paint };
  }

  window.TG = { create, TILE, CHUNK };
})();
