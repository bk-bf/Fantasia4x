'use strict';
(() => {
  const BT = (window.BT = window.BT || {});
  const GRADE = [0.26, 0.31, 0.46];
  const LEAFY = new Uint8Array(256);
  for (let v = 0; v < 256; v++) LEAFY[v] = [3, 4, 5, 7].includes(v & 15) ? 1 : 0;
  const FLAME = ['#ffd98a', '#ffb35a', '#f6873a', '#d9582c', '#9c3a3c'].map(rgb);
  const RIM = rgb('#ffc070');
  const ORB = ['#fff6c8', '#e6d98f'].map(rgb);

  function rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  async function pixels(src) {
    const res = await fetch(src);
    const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, d: g.getImageData(0, 0, bmp.width, bmp.height).data };
  }

  function survey(S, sp) {
    const a = sp.a;
    sp.edges = [];
    sp.bright = [];
    sp.leaves = [];
    sp.hollowRgb = a?.hollow ? a.hollow.map(rgb) : null;
    if (!a) {
      const list = [];
      for (let y = 0; y < sp.h; y++)
        for (let x = 0; x < sp.w; x++) {
          const i = ((sp.y + y) * S.aw + sp.x + x) * 4;
          if (S.atlas[i + 3]) list.push(y * sp.w + x);
        }
      list.sort((p, q) => S.parts[((sp.y + Math.floor(p / sp.w)) * S.aw + sp.x + (p % sp.w)) * 4 + 1] - S.parts[((sp.y + Math.floor(q / sp.w)) * S.aw + sp.x + (q % sp.w)) * 4 + 1]);
      sp.list = Int32Array.from(list);
      return;
    }
    const at = (x, y) => ((sp.y + y) * S.aw + sp.x + x) * 4;
    for (let y = 0; y < sp.h; y++)
      for (let x = 0; x < sp.w; x++) {
        const i = at(x, y);
        if (!S.atlas[i + 3] || !LEAFY[S.parts[i]]) continue;
        sp.leaves.push(x, y);
        const up = y > 0 ? at(x, y - 1) : -1;
        if (a.ember && (S.parts[i] & 15) === 3 && (up < 0 || !S.atlas[up + 3])) sp.edges.push(x, y);
        const lum = S.atlas[i] * 0.3 + S.atlas[i + 1] * 0.59 + S.atlas[i + 2] * 0.11;
        if (lum > 175) sp.bright.push(x, y);
      }
  }

  BT.load = async () => {
    const cfg = await (await fetch('scene.json')).json();
    const [atlas, parts] = await Promise.all([pixels('img/atlas.webp'), pixels('img/parts.webp')]);
    const S = { cfg, aw: atlas.w, atlas: atlas.d, parts: parts.d, views: {} };
    for (const sp of cfg.sprites) survey(S, sp);
    S.view = async (name) => {
      if (S.views[name]) return S.views[name];
      const v = cfg.views[name];
      const [ground, light, breath] = await Promise.all([pixels(`img/${name}-ground.webp`), v.lit ? pixels(`img/${name}-light.webp`) : null, v.lit ? pixels(`img/${name}-breath.webp`) : null]);
      S.views[name] = { ...v, name, ground: ground.d, light: light?.d, breath: breath?.d };
      return S.views[name];
    };
    return S;
  };

  function settle(prev, v) {
    return Math.abs(v - prev) > 0.62 ? Math.round(v) : prev;
  }

  function motion(it, sp, W, t, cache, mem) {
    const a = sp.a;
    const h = sp.h;
    if (!a || !W.scale) {
      let m = cache.get(sp);
      if (!m) {
        const zero = new Int16Array(h + 1);
        m = { L: zero, B: zero, T: zero, S: zero, flut: new Int8Array(256), bob: new Int8Array(256), reach: 1 };
        cache.set(sp, m);
      }
      mem.delete(it);
      return m;
    }
    let keep = mem.get(it);
    if (!keep || keep.L.length !== h + 1) {
      keep = { L: new Int16Array(h + 1), B: new Int16Array(h + 1), T: new Int16Array(h + 1), S: new Int16Array(h + 1), veil: new Int8Array(1024) };
      mem.set(it, keep);
    }
    const lean = W.lean(it.x, it.b, a.sway, t);
    const lag = W.lean(it.x, it.b, a.sway, t - 0.45) * 0.85;
    const trunkW = W.level >= 3 ? 0.45 : 0.06;
    const { L, B, T, S } = keep;
    let reach = 2;
    for (let r = 0; r <= h; r++) {
      const rise = Math.max(0, Math.min(1, (h - r + (r % 3)) / h)),
        f = rise * Math.sqrt(rise),
        smooth = Math.max(0, Math.min(1, (h - r) / h));
      L[r] = settle(L[r], lean * f);
      B[r] = settle(B[r], lag * f);
      T[r] = settle(T[r], lean * trunkW * f);
      S[r] = settle(S[r], lean * smooth * Math.sqrt(smooth));
      reach = Math.max(reach, Math.abs(L[r]) + 2);
    }
    const thr = [2, 0.94, 0.74, 0.5][W.level],
      big = W.level >= 3 ? 0.9 : 2,
      flut = new Int8Array(256),
      bob = new Int8Array(256),
      bthr = [2, 0.9, 0.55, 0.2][W.level];
    for (let p = 0; p < 256; p++) {
      const v = Math.sin(t * W.flutterRate * 1.15 + (p / 255) * 6.283 + it.x * 0.013);
      flut[p] = Math.abs(v) > thr ? Math.sign(v) * (Math.abs(v) > big ? 2 : 1) : 0;
      const b = Math.sin(t * 2.3 + (p / 255) * 6.283 + it.x * 0.01);
      bob[p] = b > bthr ? 1 : 0;
    }
    if (sp.veil) {
      const g = W.gust(it.x, it.b, t),
        push = W.scale * (1.1 + 2.2 * g),
        amp = W.scale * 1.1;
      for (let bunch = 0; bunch < 64; bunch++) {
        const phi = bunch * 2.39 + it.x * 0.01;
        for (let hh = 0; hh < 16; hh++) {
          const f = (hh + 0.5) / 16,
            v = push * Math.pow(f, 1.3) + amp * Math.sin((t - f * 0.8) * 1.1 + phi) * Math.pow(f, 1.5);
          keep.veil[bunch * 16 + hh] = settle(keep.veil[bunch * 16 + hh], v);
        }
      }
      reach += Math.ceil(push + amp) + 1;
    }
    return { L, B, T, S, flut, bob, reach, veil: keep.veil };
  }

  BT.renderer = (S) => {
    const cache = new Map();
    const mem = new Map();
    const AW = S.aw,
      AD = S.atlas,
      PD = S.parts;

    function frame(V, st, t, out, vx, vy, vw, vh, fx) {
      const W = st.wind,
        night = st.night,
        breath = 0.72 + 0.28 * Math.sin(t * 1.1);
      const GW = V.w,
        GH = V.h,
        GD = V.ground,
        LD = V.light,
        BD = V.breath,
        X1 = vx + vw,
        Y1 = vy + vh,
        G0 = GRADE[0],
        G1 = GRADE[1],
        G2 = GRADE[2];
      function put(wx, wy, r, g, b, e, alpha) {
        if (wx < vx || wy < vy || wx >= X1 || wy >= Y1 || wx < 0 || wy < 0 || wx >= GW || wy >= GH) return;
        const o = ((wy - vy) * vw + wx - vx) << 2;
        let c0 = r,
          c1 = g,
          c2 = b;
        if (night) {
          let l0 = 0,
            l1 = 0,
            l2 = 0;
          if (LD) {
            const q = (wy * GW + wx) << 2;
            l0 = (LD[q] + BD[q] * breath) / 120;
            l1 = (LD[q + 1] + BD[q + 1] * breath) / 120;
            l2 = (LD[q + 2] + BD[q + 2] * breath) / 120;
          }
          const ne = 1 - e,
            k = 1.12 * e;
          c0 = (r * (G0 + l0 * 0.55) + l0 * 34) * ne + r * k;
          c1 = (g * (G1 + l1 * 0.55) + l1 * 34) * ne + g * k;
          c2 = (b * (G2 + l2 * 0.55) + l2 * 34) * ne + b * k;
        }
        if (alpha >= 1) {
          out[o] = c0;
          out[o + 1] = c1;
          out[o + 2] = c2;
        } else {
          const na = 1 - alpha;
          out[o] = out[o] * na + c0 * alpha;
          out[o + 1] = out[o + 1] * na + c1 * alpha;
          out[o + 2] = out[o + 2] * na + c2 * alpha;
        }
        out[o + 3] = 255;
      }

      for (let y = 0; y < vh; y++) {
        const wy = vy + y;
        for (let x = 0; x < vw; x++) {
          const wx = vx + x,
            o = (y * vw + x) << 2;
          if (wx < 0 || wy < 0 || wx >= GW || wy >= GH) {
            out[o + 3] = 0;
            continue;
          }
          const q = (wy * GW + wx) << 2;
          if (!night) {
            out[o] = GD[q];
            out[o + 1] = GD[q + 1];
            out[o + 2] = GD[q + 2];
            out[o + 3] = 255;
          } else if (!LD) {
            out[o] = GD[q] * G0;
            out[o + 1] = GD[q + 1] * G1;
            out[o + 2] = GD[q + 2] * G2;
            out[o + 3] = 255;
          } else {
            const l0 = (LD[q] + BD[q] * breath) / 120,
              l1 = (LD[q + 1] + BD[q + 1] * breath) / 120,
              l2 = (LD[q + 2] + BD[q + 2] * breath) / 120;
            out[o] = GD[q] * (G0 + l0 * 0.55) + l0 * 34;
            out[o + 1] = GD[q + 1] * (G1 + l1 * 0.55) + l1 * 34;
            out[o + 2] = GD[q + 2] * (G2 + l2 * 0.55) + l2 * 34;
            out[o + 3] = 255;
          }
        }
      }

      const ctx = { put, W, t, night, breath, sprites: S.cfg.sprites, AD, PD, AW, LEAFY, FLAME, ORB, forward: null };
      const embers = [];
      for (const it of V.items) {
        const sp = S.cfg.sprites[st.young === 'today' && it.alt !== undefined ? it.alt : it.s];
        const ox = it.x - sp.ax,
          oy = it.b - sp.ay;
        if (ox + sp.w + 40 < vx || ox - 40 > vx + vw || oy + sp.h < vy - 40 || oy > vy + vh + 4) {
          fx?.spawn(it, sp, ctx, false);
          continue;
        }
        const m = motion(it, sp, W, t, cache, mem);
        if (sp.veil) veil(it, S.cfg.sprites[sp.veil[0]], sp, m, ox, oy, ctx, st);
        drawSprite(it, sp, m, ox, oy, ctx, vx, vy, vw, vh, st);
        if (sp.veil) veil(it, S.cfg.sprites[sp.veil[1]], sp, m, ox, oy, ctx, st);
        const forward = (x, y) => {
          const i = ((sp.y + y) * AW + sp.x + x) * 4;
          const ph = PD[i + 1],
            k = PD[i] & 15;
          return [ox + x + m.L[y] + m.flut[ph], oy + y + (k === 5 ? m.bob[ph] : 0)];
        };
        ctx.forward = forward;
        if (sp.a?.moon) orbs(sp, ctx, forward);
        if (sp.a?.ember) {
          flame(sp, ctx, forward);
          embers.push([it, sp, ox, oy]);
        }
        fx?.spawn(it, sp, ctx, true);
        fx?.attached(it, sp, ctx);
      }
      fx?.draw(ctx);
      for (const [it, sp, ox, oy] of embers) shimmer(sp, ox, oy, out, vx, vy, vw, vh, t);
    }

    function drawSprite(it, sp, m, ox, oy, ctx, vx, vy, vw, vh, st) {
      const a = sp.a;
      const x0 = Math.max(-m.reach, vx - ox),
        x1 = Math.min(sp.w + m.reach, vx + vw - ox),
        y0 = Math.max(0, vy - oy),
        y1 = Math.min(sp.h, vy + vh - oy);
      const at = (x, y) => (x < 0 || y < 0 || x >= sp.w || y >= sp.h ? -1 : ((sp.y + y) * AW + sp.x + x) * 4);
      const cut = st.cut === 'on' && it.cut && it.cut.length ? it.cut : null;
      const t = ctx.t;
      const pulse = a && (a.age === 'elder' || a.heart);
      for (let ly = y0; ly < y1; ly++) {
        const L = m.L[ly],
          Bs = m.B[ly],
          T = m.T[ly];
        for (let lx = x0; lx < x1; lx++) {
          let src = -1;
          const sx = lx - L;
          let i = at(sx, ly);
          if (i >= 0 && AD[i + 3] && LEAFY[PD[i]]) {
            const ph = PD[i + 1];
            const j = at(sx - m.flut[ph], ly - ((PD[i] & 15) === 5 ? m.bob[ph] : 0));
            src = j >= 0 && AD[j + 3] && LEAFY[PD[j]] ? j : i;
          } else {
            i = at(lx - Bs, ly);
            if (i >= 0 && AD[i + 3] && (PD[i] & 15) === 2) src = i;
            else {
              i = at(lx - T, ly);
              if (i >= 0 && AD[i + 3] && !LEAFY[PD[i]] && (PD[i] & 15) !== 2) src = i;
            }
          }
          if (src < 0) continue;
          const wx = ox + lx,
            wy = oy + ly,
            k = PD[src] & 15;
          let r = AD[src],
            g = AD[src + 1],
            b = AD[src + 2],
            e = PD[src + 2] / 255,
            alpha = 1;
          if (e > 0 && a?.heart) {
            const f = 0.86 + 0.24 * ctx.breath;
            r *= f;
            g *= f;
            b *= f;
            e *= ctx.breath;
          }
          if (k === 6 && pulse) {
            const w = Math.max(0, Math.sin(t * 1.6 - PD[src + 1] * 0.07));
            const f = 1 + 0.3 * w * w;
            r *= f;
            g *= f;
            b *= f;
            e = Math.min(1, e * (0.6 + 0.6 * w));
          }
          if (k === 8 && sp.hollowRgb) {
            const HR = sp.hollowRgb,
              depth = PD[src + 1] / 255,
              I = Math.max(0, Math.min(1, depth * (0.74 + 0.16 * Math.sin(t * 0.8 + it.x * 0.01) + 0.06 * Math.sin(t * 2.1 + 1)) + (BT.noise(wx * 0.21, wy * 0.09 - t * 0.35) - 0.5) * 0.4 * depth)),
              c = HR[Math.min(HR.length - 1, Math.floor(I * (HR.length - 1) + 0.35))];
            r = c[0];
            g = c[1];
            b = c[2];
            e = Math.min(1, I * 1.15);
          }
          if (cut && LEAFY[k]) {
            let d = 1e9;
            for (const [px, py] of cut) d = Math.min(d, Math.hypot(wx - px, (wy - py) * 1.1));
            const edge = 34 + (BT.noise(wx / 7, wy / 7) - 0.5) * 12;
            if (d < edge) alpha = d < edge - 6 ? 0.14 : 0.14 + ((d - edge + 6) / 6) * 0.86;
          }
          ctx.put(wx, wy, r, g, b, e, alpha);
        }
      }
    }

    function veil(it, vsp, sp, m, ox, oy, ctx, st) {
      const list = vsp.list,
        t = ctx.t,
        a = sp.a,
        cut = st.cut === 'on' && it.cut && it.cut.length ? it.cut : null;
      for (let n = 0; n < list.length; n++) {
        const p = list[n],
          x = p % vsp.w,
          y = (p - x) / vsp.w,
          i = ((vsp.y + y) * AW + vsp.x + x) * 4,
          code = PD[i],
          k = code & 15,
          hh = code >> 4,
          bunch = PD[i + 1] & 63,
          wx = ox + x + m.S[y] + (m.veil ? m.veil[bunch * 16 + hh] : 0),
          wy = oy + y;
        let r = AD[i],
          g = AD[i + 1],
          b = AD[i + 2],
          e = PD[i + 2] / 255,
          alpha = 1;
        if (k === 7 && a?.soul && Math.sin(t * 0.9 + bunch * 1.7 + x * 0.05) > 0.94) {
          r = r * 0.7 + 215 * 0.3;
          g = g * 0.7 + 250 * 0.3;
          b = b * 0.7 + 236 * 0.3;
          e = Math.max(e, 0.55);
        }
        if (cut) {
          let d = 1e9;
          for (const [px, py] of cut) d = Math.min(d, Math.hypot(wx - px, (wy - py) * 1.1));
          const edge = 34 + (BT.noise(wx / 7, wy / 7) - 0.5) * 12;
          if (d < edge) alpha = d < edge - 6 ? 0.14 : 0.14 + ((d - edge + 6) / 6) * 0.86;
        }
        ctx.put(wx, wy, r, g, b, e, alpha);
      }
    }

    function orbs(sp, ctx, forward) {
      const t = ctx.t;
      for (const [x, y, ph] of sp.a.orbs) {
        const [fx, fy] = forward(x, y);
        const dx = Math.round(Math.sin(t * 0.55 + ph) * 1.4),
          dy = Math.round(Math.cos(t * 0.42 + ph * 1.3) * 1.1);
        const p = 0.5 + 0.5 * Math.sin(t * 1.3 + ph);
        const halo = ORB[1].map((v) => v * (0.7 + 0.3 * p));
        for (const [ax, ay] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) ctx.put(fx + dx + ax, fy + dy + ay, halo[0], halo[1], halo[2], 0.5 + 0.4 * p, 0.55 + 0.45 * p);
        ctx.put(fx + dx, fy + dy, ORB[0][0], ORB[0][1], ORB[0][2], 1, 1);
      }
    }

    function flame(sp, ctx, forward) {
      const t = ctx.t,
        W = ctx.W,
        E = sp.edges;
      for (let n = 0; n < E.length; n += 2) {
        const x = E[n],
          y = E[n + 1];
        const v = BT.noise(x * 0.085 + t * 0.55, y * 0.05 + t * 0.3);
        if (v < 0.46) continue;
        const [fx, fy] = forward(x, y);
        ctx.put(fx, fy, RIM[0], RIM[1], RIM[2], 0.7, Math.min(0.55, (v - 0.46) * 3));
        ctx.put(fx, fy + 1, RIM[0], RIM[1], RIM[2], 0.4, Math.min(0.25, (v - 0.46) * 1.5));
        const hgt = Math.floor(Math.max(0, v - 0.47) * 24 + BT.cell(x, Math.floor(t * 4)) * 1.4);
        if (!hgt) continue;
        const curl = Math.sin(t * 2.2 + x * 0.21);
        for (let j = 0; j < Math.min(hgt, 6); j++) {
          const dx = Math.round(((j * j) / 10) * (W.dir.x * W.scale * 0.7 + curl * 0.6));
          const c = FLAME[j === 0 ? 0 : Math.min(4, 1 + Math.floor(((j - 1) / Math.max(1, hgt - 1)) * 4))];
          ctx.put(fx + dx, fy - 1 - j, c[0], c[1], c[2], j < 3 ? 1 : 0.75, j < hgt - 1 ? 1 : 0.7);
        }
      }
    }

    function shimmer(sp, ox, oy, out, vx, vy, vw, vh, t) {
      const [bx0, by0, bx1] = sp.a.box;
      const top = oy + by0,
        x0 = Math.max(vx, ox + bx0 - 4),
        x1 = Math.min(vx + vw, ox + bx1 + 4);
      if (x1 <= x0) return;
      const row = new Uint8ClampedArray((x1 - x0) * 4);
      for (let wy = top - 30; wy < top + 4; wy++) {
        if (wy < vy || wy >= vy + vh) continue;
        const s = Math.sin(t * 6 + wy * 0.9);
        const off = s > 0.55 ? 1 : s < -0.55 ? -1 : 0;
        if (!off) continue;
        const base = ((wy - vy) * vw + (x0 - vx)) * 4;
        row.set(out.subarray(base, base + row.length));
        const fade = (top + 4 - wy) / 34;
        for (let x = x0 + 1; x < x1 - 1; x++) {
          if (BT.noise(x / 5, wy / 4 - t * 1.5) < 0.35 + fade * 0.4) continue;
          const o = base + (x - x0) * 4,
            s2 = (x - x0 - off) * 4;
          out[o] = row[s2];
          out[o + 1] = row[s2 + 1];
          out[o + 2] = row[s2 + 2];
        }
      }
    }

    return { frame };
  };
})();
