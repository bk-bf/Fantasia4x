'use strict';
(() => {
  const BT = (window.BT = window.BT || {});
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const C = {
    snow: rgb('#e6eef0'),
    snowDim: rgb('#a4b6c8'),
    glint: rgb('#ffffff'),
    glintArm: rgb('#cfe6f2'),
    apple: [rgb('#de6a52'), rgb('#9a2a2a')],
    mote: ['#f6c2d6', '#d84a78', '#8e1f4a', '#5a2a8a'].map(rgb),
    orb: rgb('#fff6c8'),
    orbHalo: rgb('#e6d98f'),
    wisp: ['#d0f8ec', '#94dcc8', '#56b0a4'].map(rgb),
    spore: ['#c493de', '#a066c4', '#7d43a2'].map(rgb),
    bone: rgb('#e0dac4'),
    dust: rgb('#c4bca0'),
    iron: rgb('#d0d8d6')
  };

  BT.fx = () => {
    let parts = [];
    let dt = 0;
    const clocks = new Map();
    const pick = (sp) => {
      const n = sp.leaves.length / 2;
      if (!n) return null;
      const i = Math.floor(Math.random() * n) * 2;
      return [sp.leaves[i], sp.leaves[i + 1]];
    };
    const every = (it, name, rate) => {
      const key = it;
      let c = clocks.get(key);
      if (!c) clocks.set(key, (c = {}));
      c[name] = (c[name] ?? Math.random()) + rate * dt;
      let n = 0;
      while (c[name] >= 1) {
        c[name] -= 1;
        n++;
      }
      return n;
    };

    function spawn(it, sp, ctx, visible) {
      const a = sp.a;
      if (!a || !visible || !dt) return;
      const W = ctx.W,
        f = ctx.forward,
        elder = a.age === 'elder',
        mature = a.age !== 'young';
      const leafy = !a.ever && a.shape !== 'pine' && a.shape !== 'dead';
      const leafCols = a.leaf ? a.leaf.slice(2, 5).map(rgb) : null;
      if (leafy && leafCols) {
        const rate = W.level === 3 ? (elder ? 2.2 : mature ? 1.3 : 0.45) : mature ? 1 / 14 : 0;
        for (let n = every(it, 'leaf', rate); n > 0; n--) {
          const p = pick(sp);
          if (!p) break;
          const [x, y] = f(p[0], p[1]);
          parts.push({ k: 'leaf', x, y, vx: W.scale * 26 + (Math.random() - 0.5) * 8, vy: 7 + Math.random() * 6, age: 0, life: 7, floor: it.b + 2 + Math.random() * 18, col: leafCols[Math.floor(Math.random() * leafCols.length)], ph: Math.random() * 6 });
        }
      }
      if (a.apple)
        for (let n = every(it, 'apple', 1 / 8); n > 0; n--) {
          const p = pick(sp);
          if (!p || p[1] < a.box[1] + (a.box[3] - a.box[1]) * 0.45) continue;
          const [x, y] = f(p[0], p[1]);
          parts.push({ k: 'apple', x, y, vx: 0, vy: 0, g: 170, age: 0, life: 9, floor: it.b - 2 + Math.random() * 12, bounced: false });
        }
      if (a.frost) {
        for (let n = every(it, 'glint', mature ? 1.6 : 0.6); n > 0; n--) {
          const b = sp.bright;
          if (!b.length) break;
          const i = Math.floor((Math.random() * b.length) / 2) * 2;
          const [x, y] = f(b[i], b[i + 1]);
          parts.push({ k: 'glint', x, y, age: 0, life: 0.45 });
        }
        for (let n = every(it, 'puff', [0.15, 0.25, 0.7, 1.6][W.level] * (mature ? 1 : 0.4)); n > 0; n--) {
          const b = sp.bright;
          if (!b.length) break;
          const i = Math.floor((Math.random() * b.length) / 2) * 2;
          const [x, y] = f(b[i], b[i + 1]);
          parts.push({ k: 'puff', x, y, vx: W.scale * 18 + 2, vy: 6, age: 0, life: 1.6 });
        }
        if (elder)
          for (let n = every(it, 'flake', 3); n > 0; n--) {
            const x = it.x - sp.ax + a.box[0] + Math.random() * (a.box[2] - a.box[0]);
            const y = it.b - sp.ay + a.box[1] + Math.random() * 20;
            parts.push({ k: 'flake', x, y, vx: W.scale * 10, vy: 9 + Math.random() * 5, age: 0, life: 6, floor: it.b + Math.random() * 10, ph: Math.random() * 6 });
          }
      }
      if (a.moon && elder)
        for (let n = every(it, 'rise', 0.3); n > 0; n--) {
          const o = a.orbs[Math.floor(Math.random() * a.orbs.length)];
          if (!o) break;
          const [x, y] = f(o[0], o[1]);
          parts.push({ k: 'orb', x, y, vx: 0, vy: -4, age: 0, life: 6, ph: Math.random() * 6 });
        }
      if (a.ember && sp.edges.length)
        for (let n = every(it, 'mote', elder ? 7 : 3.5); n > 0; n--) {
          const i = Math.floor((Math.random() * sp.edges.length) / 2) * 2;
          const [x, y] = f(sp.edges[i], sp.edges[i + 1]);
          parts.push({ k: 'mote', x, y: y - 2, vx: W.scale * 5, vy: -(7 + Math.random() * 6), age: 0, life: 3 + Math.random() * 1.5, ph: Math.random() * 6 });
        }
      if (a.soul && elder)
        for (let n = every(it, 'wisp', 0.9); n > 0; n--)
          parts.push({ k: 'wisp', x: it.x + (Math.random() - 0.5) * 12, y: it.b - sp.h * 0.12, vx: 0, vy: -5 - Math.random() * 3, age: 0, life: 5, ph: Math.random() * 6 });
      if (a.witch && mature)
        for (let n = every(it, 'spore', elder ? 1.4 : 0.6); n > 0; n--) {
          const p = pick(sp);
          if (!p) break;
          const [x, y] = f(p[0], p[1]);
          parts.push({ k: 'spore', x, y, vx: W.scale * 8 + 1, vy: 3 + Math.random() * 3, age: 0, life: 4.5, ph: Math.random() * 6, floor: it.b + 10 });
        }
      if (a.bone && mature) {
        for (let n = every(it, 'flake', 0.35); n > 0; n--)
          parts.push({ k: 'bone', x: it.x + (Math.random() - 0.5) * sp.w * 0.12, y: it.b - sp.h * (0.3 + Math.random() * 0.4), vx: W.scale * 6, vy: 14, age: 0, life: 6, floor: it.b + Math.random() * 6 });
        if (elder)
          for (let n = every(it, 'dust', 0.8); n > 0; n--)
            parts.push({ k: 'dust', x: it.x + (Math.random() - 0.5) * 10, y: it.b - sp.h * 0.1, vx: 0, vy: -4, age: 0, life: 4, ph: Math.random() * 6 });
      }
      if (a.iron && mature && W.level > 0 && W.gust(it.x, it.b, ctx.t) > 0.45)
        for (let n = every(it, 'iron', elder ? 9 : 5); n > 0; n--) {
          const b = sp.bright.length ? sp.bright : sp.leaves;
          const i = Math.floor((Math.random() * b.length) / 2) * 2;
          if (!b.length) break;
          const [x, y] = f(b[i], b[i + 1]);
          parts.push({ k: 'iron', x, y, age: 0, life: 0.3 });
        }
    }

    function draw(ctx) {
      const put = ctx.put,
        t = ctx.t;
      for (const p of parts) {
        const u = p.age / p.life,
          x = Math.round(p.x),
          y = Math.round(p.y),
          fade = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
        if (p.k === 'leaf') {
          const flat = Math.floor(p.age * 6 + p.ph) % 2 === 0;
          put(x, y, ...p.col, 0, fade);
          put(flat ? x + 1 : x, flat ? y : y + 1, ...p.col.map((v) => v * 0.75), 0, fade);
        } else if (p.k === 'apple') {
          put(x, y, ...C.apple[0], 0, fade);
          put(x + 1, y, ...C.apple[0], 0, fade);
          put(x, y + 1, ...C.apple[1], 0, fade);
          put(x + 1, y + 1, ...C.apple[1], 0, fade);
        } else if (p.k === 'glint') {
          put(x, y, ...C.glint, 1, 1);
          if (u > 0.25 && u < 0.75) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + dx, y + dy, ...C.glintArm, 0.8, 0.8);
        } else if (p.k === 'iron') {
          put(x, y, ...C.iron, 0.3, 1);
        } else if (p.k === 'puff') {
          const r = u < 0.4 ? 1 : 2;
          for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [-1, 0], [r, -1], [-r, 1]]) put(x + dx, y + dy, ...(u > 0.5 ? C.snowDim : C.snow), 0.2, 0.75 * fade);
        } else if (p.k === 'flake') {
          put(x, y, ...C.snow, 0.3, 0.85 * fade);
        } else if (p.k === 'mote') {
          const c = C.mote[Math.min(3, Math.floor(u * 4))];
          put(x, y, ...c, 1, u > 0.6 ? 0.55 : 1);
        } else if (p.k === 'orb') {
          const pulse = 0.6 + 0.4 * Math.sin(t * 2 + p.ph);
          put(x, y, ...C.orb, 1, fade);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + dx, y + dy, ...C.orbHalo, 0.6, 0.45 * pulse * fade);
        } else if (p.k === 'wisp') {
          const c = C.wisp[Math.min(2, Math.floor(u * 3))];
          put(x, y, ...c, 1, fade);
          if (u < 0.5) put(x, y + 1, ...C.wisp[2], 0.8, 0.6 * fade);
        } else if (p.k === 'spore') {
          put(x, y, ...C.spore[Math.min(2, Math.floor(u * 3))], 0.5, fade);
        } else if (p.k === 'bone') {
          put(x, y, ...C.bone, 0, fade);
        } else if (p.k === 'dust') {
          put(x, y, ...C.dust, 0.2, 0.7 * fade);
        }
      }
    }

    function step(seconds, W) {
      dt = seconds;
      for (const p of parts) {
        p.age += seconds;
        if (p.k === 'apple') {
          if (p.y < p.floor) {
            p.vy += p.g * seconds;
            p.y = Math.min(p.floor, p.y + p.vy * seconds);
            if (p.y >= p.floor && !p.bounced) {
              p.bounced = true;
              p.y = p.floor - 1;
              p.vy = -p.vy * 0.25;
            }
          }
          continue;
        }
        if (p.floor !== undefined && p.y >= p.floor) continue;
        const sway = p.ph !== undefined ? Math.sin(p.age * 2.2 + p.ph) * (p.k === 'leaf' ? 14 : 4) : 0;
        p.x += (p.vx + sway) * seconds;
        p.y += p.vy * seconds;
        if (p.k === 'leaf') p.vx += (W.scale * 26 - p.vx) * 0.5 * seconds;
      }
      parts = parts.filter((p) => p.age < p.life);
    }

    return { spawn, draw, step, attached: () => {}, clear: () => (parts = []) };
  };
})();
