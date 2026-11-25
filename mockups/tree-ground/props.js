'use strict';
(() => {
  const dim = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  function blades(px, r, ramp, count, tall, spread, heads) {
    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1,
        lean = u * spread + (r() - 0.5) * 0.3,
        len = Math.round(tall * (1 - Math.abs(u) * 0.35) * (0.8 + r() * 0.3));
      for (let j = 0; j <= len; j++) {
        const f = j / len,
          x = Math.round(u * 1.5 + lean * j * 0.55 + lean * f * f * 2),
          c = ramp[j === len ? 2 : f < 0.35 ? 0 : 1];
        px.push([x, -j, c]);
      }
      if (heads && r() < 0.6) px.push([Math.round(u * 1.5 + lean * len * 0.55 + lean * 2), -len - 1, heads]);
    }
  }

  function rimmed(px, col, around) {
    const seen = new Set(px.map((p) => `${p[0]},${p[1]}`));
    const edge = [];
    const sides = around ? [[0, 1], [-1, 0], [1, 0], [0, -1]] : [[0, 1], [-1, 0], [1, 0]];
    for (const p of px)
      for (const [dx, dy] of sides) {
        const k = `${p[0] + dx},${p[1] + dy}`;
        if (seen.has(k)) continue;
        seen.add(k);
        edge.push([p[0] + dx, p[1] + dy, col]);
      }
    return edge.concat(px);
  }

  function frond(px, r, ramp, angle, len) {
    const dx = Math.cos(angle),
      dy = Math.sin(angle);
    for (let j = 0; j <= len; j++) {
      const f = j / len,
        x = Math.round(dx * j),
        y = Math.round(dy * j + f * f * len * 0.34);
      px.push([x, y, ramp[f > 0.7 ? 2 : 1]]);
      if (j > 0 && j < len - 1) {
        px.push([x, y - 1, ramp[j % 2 ? 2 : 1]]);
        if (j % 2 === 0) px.push([x, y + 1, ramp[0]]);
      }
    }
  }

  const TONES = {
    moss: (C) => [C('moss', 0), C('moss', 2), C('moss', 3), C('moss', 5)],
    olive: (C) => [C('mossSwamp', 0), C('mossSwamp', 1), C('mossSwamp', 2), C('mossSwamp', 4)],
    heart: (C) => [C('heart', 0), C('heart', 2), C('heart', 3), C('heart', 5)],
    moon: () => [[39, 51, 94], [95, 114, 160], [140, 156, 192], [230, 236, 242]],
    soul: (C) => [C('soul', 0), C('soul', 2), C('soul', 3), C('soul', 5)],
    witch: (C) => [C('witch', 0), C('witch', 2), C('witch', 3), C('witch', 5)]
  };

  const MAKE = {
    fern(r, C, tone) {
      const ramp = tone === 'heartFern' ? [C('heart', 1), C('heart', 2), C('heart', 4)] : [C('grass', 1), C('grass', 3), C('grass', 5)];
      const px = [],
        n = 6 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) frond(px, r, ramp, -Math.PI * (0.06 + (0.88 * i) / (n - 1)) + (r() - 0.5) * 0.16, 6 + Math.floor(r() * 4));
      return rimmed(px, [ramp[0][0] * 0.42, ramp[0][1] * 0.42, ramp[0][2] * 0.5], false);
    },
    cushion(r, C, tone) {
      const ramp = (TONES[tone] ?? TONES.moss)(C);
      const px = [],
        n = 1 + Math.floor(r() * 2.5);
      for (let k = 0; k < n; k++) {
        const ox = Math.round((k - (n - 1) / 2) * 5 + (r() - 0.5) * 2),
          oy = Math.round((r() - 0.5) * 3),
          rx = 3 + Math.floor(r() * 3),
          ry = 2 + Math.floor(r() * 1.6);
        for (let y = -ry; y <= ry; y++)
          for (let x = -rx; x <= rx; x++) {
            const q = (x * x) / ((rx + 0.4) * (rx + 0.4)) + (y * y) / ((ry + 0.4) * (ry + 0.4));
            if (q > 1) continue;
            const lit = -x / rx - (y / ry) * 1.3;
            px.push([ox + x, oy + y - ry, ramp[lit > 0.9 ? 3 : lit > -0.2 ? 2 : 1]]);
          }
      }
      return rimmed(px, [ramp[0][0] * 0.6, ramp[0][1] * 0.6, ramp[0][2] * 0.66], false);
    },
    tuft(r, C, tone) {
      const R = tone ?? 'grassLoam';
      const px = [];
      blades(px, r, [C(R, 1), C(R, 3), C(R, 4)], 5 + Math.floor(r() * 2), 6, 0.5, null);
      return px;
    },
    sedge(r, C, tone) {
      const ramp = tone === 'soulSedge' ? [C('soul', 1), C('soul', 3), C('soul', 4)] : tone === 'savanna' ? [C('savanna', 1), C('savanna', 3), C('savanna', 5)] : [C('mossSwamp', 0), C('mossSwamp', 2), C('mossSwamp', 4)];
      const px = [];
      blades(px, r, ramp, 6 + Math.floor(r() * 3), 10, 0.42, tone === 'soulSedge' ? C('soul', 5) : C('wood', 3));
      return px;
    },
    shroom(r, C, tone) {
      const cap = tone === 'red' ? [C('red', 2), C('red', 3), C('red', 4)] : tone === 'moon' ? [C('moon', 3) ?? [106, 127, 168], [200, 212, 232], [244, 248, 252]] : tone === 'witch' ? [C('witch', 3), C('purple', 3) ?? C('witch', 5), C('witch', 5)] : [C('litter', 2), C('litter', 4), C('plank', 4)];
      const stem = tone === 'witch' ? [214, 204, 222] : [222, 214, 190];
      const big = r() < 0.5;
      const px = [];
      const w = big ? 2 : 1;
      for (let x = -w; x <= w; x++) px.push([x, big ? -3 : -2, cap[x === -w ? 2 : x === w ? 0 : 1]]);
      if (big) for (let x = -1; x <= 1; x++) px.push([x, -4, cap[x < 0 ? 2 : 1]]);
      px.push([0, big ? -2 : -1, stem], [0, big ? -1 : 0, dim(stem, 0.8)]);
      if (big) px.push([0, 0, dim(stem, 0.7)]);
      if (tone === 'red' && big) px.push([0, -4, [240, 236, 226]]);
      return rimmed(px, [24, 18, 16], false);
    },
    twig(r, C) {
      const c = [C('wood', 1), C('wood', 3)];
      const px = [],
        len = 6 + Math.floor(r() * 5),
        slope = (r() - 0.5) * 0.7,
        dir = r() < 0.5 ? -1 : 1;
      for (let j = 0; j < len; j++) px.push([dir * j, Math.round(slope * j), c[1]], [dir * j, Math.round(slope * j) + 1, dim(c[0], 0.8)]);
      const k = 2 + Math.floor(r() * (len - 4));
      px.push([dir * (k + 1), Math.round(slope * k) - 1, c[1]], [dir * (k + 2), Math.round(slope * k) - 2, c[1]]);
      return px;
    },
    branch(r, C, tone) {
      const R = tone ?? 'woodGrey';
      const c = [C(R, 1), C(R, 3), C(R, 4) ?? C(R, 3)];
      const px = [],
        len = 11 + Math.floor(r() * 7),
        slope = (r() - 0.5) * 0.5,
        dir = r() < 0.5 ? -1 : 1;
      for (let j = 0; j < len; j++) {
        const y = Math.round(slope * j);
        px.push([dir * j, y - 1, c[2]], [dir * j, y, c[1]], [dir * j, y + 1, dim(c[0], 0.75)]);
      }
      for (const k of [Math.floor(len * 0.35), Math.floor(len * 0.7)]) {
        const y = Math.round(slope * k);
        for (let j = 1; j <= 3; j++) px.push([dir * (k + j), y - 1 - j, c[1]]);
      }
      return px;
    },
    cone(r, C) {
      const c = [C('wood', 1), C('wood', 3), C('wood', 5)];
      const lie = r() < 0.5;
      return rimmed(
        lie
          ? [[-2, -2, c[2]], [-1, -2, c[2]], [0, -2, c[1]], [1, -2, c[1]], [-2, -1, c[2]], [-1, -1, c[1]], [0, -1, c[2]], [1, -1, c[1]], [2, -1, c[0]], [-1, 0, c[1]], [0, 0, c[0]], [1, 0, c[0]]]
          : [[0, -4, c[2]], [-1, -3, c[2]], [0, -3, c[1]], [1, -3, c[0]], [-1, -2, c[1]], [0, -2, c[2]], [1, -2, c[0]], [-1, -1, c[2]], [0, -1, c[1]], [1, -1, c[0]], [0, 0, c[0]]],
        [22, 14, 10],
        false
      );
    },
    apple(r, C) {
      const pick = r();
      const c = pick < 0.55 ? [C('red', 1), C('red', 3), C('red', 4)] : pick < 0.8 ? [C('fallYellow', 2), C('fallYellow', 4), C('fallYellow', 5)] : [C('grassLoam', 2), C('grassLoam', 4), C('birchLeaf', 5)];
      return rimmed([[-1, -2, c[2]], [0, -2, c[1]], [-1, -1, c[1]], [0, -1, c[1]], [1, -1, c[0]], [-1, 0, c[0]], [0, 0, c[0]], [1, -2, c[1]], [1, 0, c[0]]], [30, 20, 18], true);
    },
    berry(r, C) {
      const c = [C('red', 2), C('red', 4)];
      const px = [];
      for (let i = 0; i < 3; i++) {
        const x = Math.round((r() - 0.5) * 7),
          y = Math.round((r() - 0.5) * 4);
        px.push([x, y, c[1]], [x + 1, y, c[0]]);
      }
      return px;
    },
    flower(r, C, tone) {
      const petal = tone === 'heart' ? C('heart', 5) : tone === 'moon' ? [244, 238, 188] : [240, 236, 224];
      const eye = tone === 'heart' ? [255, 236, 248] : tone === 'moon' ? [255, 252, 226] : C('gold', 3);
      const stem = tone === 'heart' ? C('heart', 2) : tone === 'moon' ? [68, 86, 136] : C('grass', 3);
      const h = 2 + Math.floor(r() * 2);
      const px = [];
      for (let j = 0; j < h; j++) px.push([0, -j, stem]);
      px.push([0, -h - 1, eye], [-1, -h - 1, petal], [1, -h - 1, petal], [0, -h - 2, petal], [0, -h, petal]);
      return px;
    },
    bell(r, C) {
      const stem = C('soul', 2),
        glow = C('soul', 5),
        mid = C('soul', 4);
      const h = 4 + Math.floor(r() * 3),
        side = r() < 0.5 ? -1 : 1;
      const px = [];
      for (let j = 0; j < h; j++) px.push([0, -j, stem]);
      px.push([side, -h, stem], [side * 2, -h + 1, glow], [side * 2, -h + 2, mid], [side, -h + 1, mid]);
      return px;
    },
    crystal(r, C) {
      const c = [C('frost', 2), C('frost', 4), C('frost', 5), C('snow', 4)];
      const px = [];
      const shards = 1 + Math.floor(r() * 2.4);
      for (let s = 0; s < shards; s++) {
        const x0 = (s - (shards - 1) / 2) * 3,
          h = 4 + Math.floor(r() * 5),
          lean = r() < 0.5 ? -1 : 1;
        for (let j = 0; j < h; j++) {
          const x = Math.round(x0 + (lean * j) / 4);
          px.push([x, -j, c[2]], [x + 1, -j, c[j > h - 3 ? 1 : 0]]);
        }
        px.push([Math.round(x0 + (lean * h) / 4), -h, c[3]]);
      }
      return px;
    },
    stone(r, C, tone) {
      const R = tone ?? 'rock';
      const c = [C(R, 1), C(R, 3), C(R, 5)];
      const w = 2 + Math.floor(r() * 2);
      const px = [];
      for (let x = -w; x <= w; x++) {
        if (Math.abs(x) < w) px.push([x, -2, c[x < 0 ? 2 : 1]]);
        px.push([x, -1, c[x < 0 ? 1 : 0]], [x, 0, dim(c[0], 0.7)]);
      }
      return px;
    },
    shard(r, C) {
      const c = [C('iron', 1), C('iron', 3), C('iron', 6)];
      const h = 4 + Math.floor(r() * 3),
        lean = r() < 0.5 ? -1 : 1;
      const px = [];
      for (let j = 0; j < h; j++) {
        const x = Math.round((lean * j) / 2);
        px.push([x, -j, c[2]], [x + 1, -j, c[1]]);
        if (j < h - 2) px.push([x + 2, -j, c[0]]);
      }
      return px;
    },
    coal(r, C) {
      const hot = [C('ember', 4), C('fire', 3)];
      const dark = [[14, 10, 10], [34, 24, 22]];
      const w = 1 + Math.floor(r() * 2);
      const px = [];
      for (let x = -w; x <= w; x++) px.push([x, -1, dark[1]], [x, 0, dark[0]]);
      px.push([0, -1, hot[r() < 0.5 ? 0 : 1]]);
      if (w > 1) px.push([-1, 0, hot[0]]);
      return px;
    },
    bone(r, C) {
      const c = [C('bone', 2), C('bone', 4), C('bone', 5)];
      const len = 5 + Math.floor(r() * 4),
        slope = (r() - 0.5) * 0.8,
        dir = r() < 0.5 ? -1 : 1;
      const px = [];
      for (let j = 0; j < len; j++) px.push([dir * j, Math.round(slope * j), c[1]], [dir * j, Math.round(slope * j) + 1, dim(c[0], 0.75)]);
      px.push([0, -1, c[2]], [dir * (len - 1), Math.round(slope * (len - 1)) - 1, c[2]], [-dir, 0, c[2]], [dir * len, Math.round(slope * (len - 1)), c[2]]);
      return px;
    },
    skull(r, C) {
      const c = [C('bone', 2), C('bone', 4), C('bone', 5)];
      const dark = [30, 26, 24];
      return [[-2, -4, c[2]], [-1, -4, c[2]], [0, -4, c[2]], [1, -4, c[1]], [-3, -3, c[2]], [-2, -3, c[2]], [-1, -3, c[2]], [0, -3, c[1]], [1, -3, c[1]], [2, -3, c[0]], [-3, -2, c[2]], [-2, -2, dark], [-1, -2, c[1]], [0, -2, dark], [1, -2, c[1]], [2, -2, c[0]], [-2, -1, c[1]], [-1, -1, c[1]], [0, -1, c[1]], [1, -1, c[0]], [-2, 0, c[0]], [-1, 0, dark], [0, 0, c[0]], [1, 0, dark]];
    },
    puddle(r, C) {
      const c = [C('shallow', 1), C('shallow', 3), C('shallow', 5)];
      const px = [],
        rx = 6 + Math.floor(r() * 4),
        ry = 2 + Math.floor(r() * 2);
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++) {
          const q = (x * x) / (rx * rx) + (y * y) / (ry * ry) + (r() - 0.5) * 0.18;
          if (q > 1) continue;
          px.push([x, y, q > 0.72 ? dim(c[0], 0.75) : y < 0 && x < 0 && q < 0.3 ? c[2] : c[1]]);
        }
      return px;
    },
    ice(r, C) {
      const c = [C('ice', 1) ?? [148, 180, 198], C('ice', 2) ?? [188, 211, 220], [236, 246, 248]];
      const px = [],
        rx = 6 + Math.floor(r() * 4),
        ry = 2 + Math.floor(r() * 2);
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++) {
          const q = (x * x) / (rx * rx) + (y * y) / (ry * ry) + (r() - 0.5) * 0.18;
          if (q > 1) continue;
          px.push([x, y, q > 0.72 ? c[0] : x === y * 2 ? c[2] : c[1]]);
        }
      return px;
    }
  };

  function roots(r, tree, spec, bark, C, elder) {
    const px = [];
    const n = spec.n[elder ? 1 : 0];
    const foot = tree.foot;
    const body = [bark[1], bark[2], bark[3] ?? bark[2]];
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      const a = Math.PI * (0.5 - u * 0.56) + (r() - 0.5) * 0.24;
      const len = (elder ? 26 + r() * 46 : 9 + r() * 12) * (1 - Math.abs(u) * 0.12);
      let x = Math.cos(a) * foot * 0.86,
        y = Math.sin(a) * foot * 0.22 - 1;
      let dir = a;
      let wide = elder ? 3.4 : 2.2;
      const bend = spec.straight ? 0.04 : 0.3;
      for (let j = 0; j < len; j++) {
        const f = j / len;
        dir += (r() - 0.5) * bend;
        x += Math.cos(dir);
        y += Math.sin(dir) * 0.55;
        const w = Math.max(1, Math.round(wide * (1 - f * 0.85)));
        for (let k = 0; k < w; k++) {
          const top = k === 0;
          let c = top ? body[2] : k === w - 1 && w > 1 ? body[0] : body[1];
          if (top && spec.cap) c = C(spec.cap[0], spec.cap[1]);
          if (top && spec.moss && r() < 0.34 && f < 0.7) c = C(spec.moss, 3);
          if (spec.vein && w > 1 && k === 1 && (j & 3) !== 3) c = C(spec.vein[0], spec.vein[1]);
          px.push([Math.round(x), Math.round(y) + k, c]);
        }
        px.push([Math.round(x), Math.round(y) + w, dim(body[0], 0.55), 1]);
        if (elder && j > len * 0.45 && r() < 0.04) {
          let bx = x,
            by = y,
            bd = dir + (r() < 0.5 ? -0.8 : 0.8);
          for (let q = 0; q < 8 + r() * 10; q++) {
            bx += Math.cos(bd);
            by += Math.sin(bd) * 0.55;
            px.push([Math.round(bx), Math.round(by), body[1]], [Math.round(bx), Math.round(by) + 1, dim(body[0], 0.55), 1]);
          }
        }
      }
    }
    return px;
  }

  window.TGP = { MAKE, roots };
})();
