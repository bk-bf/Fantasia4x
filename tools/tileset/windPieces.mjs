const PART_BITS = 15;
const LEAVES = new Set([3, 5]);
const RIM_KINDS = new Set([0, 1, 2]);
const NEEDLE = 5;
const SHADED = 128;
const STALK_BIT = 64;
const CY_BITS = 127;
const PLANT_CY_BITS = 63;
const CLUMP = { leaf: [12, 12], wood: [9, 5] };
const RAGGED = 0.3;
const SMALL = 16;
const CORE_WEIGHT = 0.35;
const INK = 70;
const STALK_STEP = 40;
const LOBE_STEP = 14;
const LOBE_WIDE = 8;
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

export const WOOD = 254;
export const NO_PIECE = 255;
export const PLANT_MAX = 127;

export const pieceScale = (w = 0, h = 0) => ({ sx: w > 253 ? 2 : 1, sy: h > 254 ? 4 : 2 });

const seeded = (id = '') => {
  let a = 7;
  for (let i = 0; i < id.length; i++) a = Math.imul(a ^ id.charCodeAt(i), 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const lum = (px = new Uint8ClampedArray(0), i = 0) =>
  0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2];

const greenish = (px = new Uint8ClampedArray(0), i = 0) =>
  px[i * 4 + 1] > px[i * 4] + 8 && px[i * 4 + 1] >= px[i * 4 + 2];

function voronoi(pixels = [0], cls = 'leaf', w = 0, h = 0, rng = Math.random) {
  const [cw, ch] = CLUMP[cls];
  const seeds = [];
  for (let gy = -ch; gy < h + ch; gy += ch)
    for (let gx = -cw; gx < w + cw; gx += cw) seeds.push([gx + rng() * cw, gy + rng() * ch]);
  const groups = new Map();
  for (const i of pixels) {
    const x = i % w,
      y = Math.floor(i / w);
    let near = 0,
      best = Infinity;
    for (let n = 0; n < seeds.length; n++) {
      const d = ((x - seeds[n][0]) / cw) ** 2 + ((y - seeds[n][1]) / ch) ** 2 + rng() * RAGGED;
      if (d < best) {
        best = d;
        near = n;
      }
    }
    if (!groups.has(near)) groups.set(near, []);
    groups.get(near).push(i);
  }
  return [...groups.values()];
}

function outlined(pixels = [0], px = new Uint8ClampedArray(0), w = 0, step = 0) {
  const solid = new Set(pixels);
  const ink = new Set(pixels.filter((i) => lum(px, i) < INK));
  const label = new Map();
  const groups = [];
  const order = pixels
    .filter((i) => !ink.has(i))
    .sort((a, b) => a % w - (b % w) || Math.floor(a / w) - Math.floor(b / w));
  const near = (i = 0, dx = 0, dy = 0) => {
    const x = (i % w) + dx;
    return x < 0 || x >= w ? -1 : i + dx + dy * w;
  };
  for (const start of order) {
    if (label.has(start)) continue;
    const id = groups.length;
    label.set(start, id);
    const group = [start],
      queue = [start];
    while (queue.length) {
      const at = queue.pop();
      for (const [dx, dy] of SIDES) {
        const n = near(at, dx, dy);
        if (
          solid.has(n) &&
          !ink.has(n) &&
          !label.has(n) &&
          Math.abs(lum(px, n) - lum(px, at)) < step
        ) {
          label.set(n, id);
          group.push(n);
          queue.push(n);
        }
      }
    }
    groups.push(group);
  }
  let merged = true;
  while (merged) {
    merged = false;
    for (let n = 0; n < groups.length; n++) {
      const group = groups[n];
      if (!group.length || group.length >= SMALL) continue;
      const beside = [];
      for (const i of group)
        for (const [dx, dy] of SIDES) {
          const l = label.get(near(i, dx, dy));
          if (l !== undefined && l !== n) beside.push(l);
        }
      if (!beside.length) continue;
      const host = mostOf(beside);
      for (const i of group) label.set(i, host);
      groups[host].push(...group);
      groups[n] = [];
      merged = true;
    }
  }
  let rest = pixels.filter((i) => !label.has(i));
  while (rest.length) {
    const left = [];
    for (const i of rest) {
      const ids = [];
      for (const [dx, dy] of SIDES) {
        const l = label.get(near(i, dx, dy));
        if (l !== undefined) ids.push(l);
      }
      if (ids.length) label.set(i, mostOf(ids));
      else left.push(i);
    }
    if (left.length === rest.length) {
      for (const i of left) label.set(i, groups.push([i]) - 1);
      break;
    }
    rest = left;
  }
  const pieces = new Map();
  for (const [i, n] of label) {
    if (!pieces.has(n)) pieces.set(n, []);
    pieces.get(n).push(i);
  }
  return [...pieces.values()];
}

function mostOf(ids = [0]) {
  const count = new Map();
  for (const n of ids) count.set(n, (count.get(n) ?? 0) + 1);
  let best = ids[0];
  for (const [n, c] of count) if (c > (count.get(best) ?? 0)) best = n;
  return best;
}

const spread = (group = [0], w = 0) => {
  let lo = Infinity,
    hi = -Infinity;
  for (const i of group) {
    lo = Math.min(lo, i % w);
    hi = Math.max(hi, i % w);
  }
  return hi - lo + 1;
};

function plantPieces(pixels = [0], px = new Uint8ClampedArray(0), w = 0) {
  return outlined(pixels, px, w, STALK_STEP).flatMap((group) =>
    spread(group, w) > LOBE_WIDE ? outlined(group, px, w, LOBE_STEP) : [group]
  );
}

function painted(pixels = [0], phase = new Map(), w = 0) {
  const label = new Map();
  const groups = [];
  for (const start of pixels) {
    if (label.has(start)) continue;
    const id = groups.length;
    label.set(start, id);
    const group = [start],
      queue = [start];
    while (queue.length) {
      const at = queue.pop();
      for (const [dx, dy] of SIDES) {
        const x = (at % w) + dx;
        if (x < 0 || x >= w) continue;
        const n = at + dx + dy * w;
        if (phase.has(n) && !label.has(n) && phase.get(n) === phase.get(start)) {
          label.set(n, id);
          group.push(n);
          queue.push(n);
        }
      }
    }
    groups.push(group);
  }
  for (let n = 0; n < groups.length; n++) {
    const group = groups[n];
    if (group.length >= SMALL) continue;
    const big = [];
    for (const i of group)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = (i % w) + dx;
          if (x < 0 || x >= w) continue;
          const l = label.get(i + dx + dy * w);
          if (l !== undefined && groups[l].length >= SMALL) big.push(l);
        }
    if (!big.length) continue;
    const host = mostOf(big);
    groups[host].push(...group);
    for (const i of group) label.set(i, host);
    groups[n] = [];
  }
  return groups.filter((g) => g.length);
}

const centreOf = (group = [0], w = 0) => {
  let sx = 0,
    sy = 0;
  for (const i of group) {
    sx += i % w;
    sy += Math.floor(i / w);
  }
  return [sx / group.length, sy / group.length];
};

/**
 * @param {{ w: number, h: number, px: Uint8ClampedArray, light: Uint8ClampedArray }} s
 * @param {{ id: string, tree: boolean, parts: boolean }} o
 */
export function windPieces(s, o) {
  const { w, h, px, light } = s;
  const rng = seeded(o.id);
  const solid = [];
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] === 255) solid.push(i);
  if (!solid.length) return;
  const kindOf = (i = 0) => light[i * 4 + 2] & PART_BITS;
  const setCy = (i = 0, v = 0) => (light[i * 4 + 1] = (light[i * 4 + 1] & SHADED) | v);
  if (!o.parts) {
    if (w > PLANT_MAX || h > PLANT_MAX) return;
    let groups = [];
    if (o.tree) {
      const needles = solid.every((i) => !LEAVES.has(kindOf(i)));
      const leafy = (i = 0) => LEAVES.has(kindOf(i)) || (needles && greenish(px, i));
      const leaves = solid.filter(leafy);
      for (const g of voronoi(leaves, 'leaf', w, h, rng)) groups.push([g, false]);
    } else groups = plantPieces(solid, px, w).map((g) => [g, spread(g, w) <= LOBE_WIDE - 2]);
    for (const [group, stalk] of groups) {
      const [cx, cy] = centreOf(group, w);
      for (const i of group) {
        light[i * 4 + 3] = 1 + Math.round(cx);
        setCy(i, (stalk ? STALK_BIT : 0) | (Math.round(cy / 2) & PLANT_CY_BITS));
      }
    }
    return;
  }
  const { sx, sy } = pieceScale(w, h);
  const needles = solid.every((i) => !LEAVES.has(kindOf(i)));
  if (needles) for (const i of solid) if (greenish(px, i)) light[i * 4 + 2] = (light[i * 4 + 2] & ~PART_BITS) | NEEDLE;
  const phase = new Map();
  const isLeaf = (i = 0) => LEAVES.has(kindOf(i));
  const rim = [];
  for (const i of solid) {
    if (isLeaf(i) || !RIM_KINDS.has(kindOf(i)) || lum(px, i) >= INK) continue;
    for (const [dx, dy] of SIDES) {
      const x = (i % w) + dx,
        n = i + dx + dy * w;
      if (x < 0 || x >= w || n < 0 || n >= w * h || px[n * 4 + 3] !== 255 || !isLeaf(n)) continue;
      rim.push([i, n]);
      break;
    }
  }
  for (const [i, leaf] of rim) {
    light[i * 4 + 2] = (light[i * 4 + 2] & ~PART_BITS) | kindOf(leaf);
    phase.set(i, light[leaf * 4 + 1] & CY_BITS);
  }
  const leaves = [];
  for (const i of solid) {
    if (isLeaf(i)) {
      leaves.push(i);
      if (!phase.has(i)) phase.set(i, light[i * 4 + 1] & CY_BITS);
    } else light[i * 4 + 3] = WOOD;
  }
  if (!leaves.length) return;
  const crown = o.id.startsWith('trees/') ? painted(leaves, phase, w) : voronoi(leaves, 'leaf', w, h, rng);
  const [mx, my] = centreOf(leaves, w);
  let far = 0;
  for (const i of leaves) far = Math.max(far, Math.hypot((i % w) - mx, Math.floor(i / w) - my));
  far ||= 1;
  for (const group of crown) {
    const [cx, cy] = centreOf(group, w);
    const weight = CORE_WEIGHT + (1 - CORE_WEIGHT) * Math.min(1, Math.hypot(cx - mx, cy - my) / far);
    for (const i of group) {
      light[i * 4 + 3] = 1 + Math.round(cx / sx);
      setCy(i, Math.round(cy / sy) & CY_BITS);
      light[i * 4 + 2] = (Math.round(weight * 15) << 4) | kindOf(i);
    }
  }
}
