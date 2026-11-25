import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const [, , WORLD, WORK] = process.argv;
export const MARGIN = 6;
const REGION = { x0: 32, y0: 176, w: 64, h: 44 };
const STRIP = { w: 62, h: 18 };
const TREE_OF = {
  oak_tree: 'oak',
  ash_tree: 'ash',
  pine_tree: 'pine',
  willow_tree: 'willow',
  yew_tree: 'yew',
  birch_tree: 'birch',
  apple_tree: 'apple',
  dead_tree: 'dead',
  ironwood_grove: 'ironwood',
  moonwood_grove: 'moonwood',
  frostheart_pine: 'frostheart',
  witchwood_grove: 'witchwood',
  heartwood_grove: 'heartwood',
  soulwood_grove: 'soulwood',
  emberwood_grove: 'emberwood',
  bonewood_snag: 'bonewood'
};
const CLASS = {
  grass: 'g',
  deep_grass: 'g',
  tall_grass: 'g',
  savanna: 'g',
  terra_preta: 'g',
  dirt: 's',
  mud: 'm',
  clay: 'c',
  riverbank: 'a',
  quicksand: 'a',
  mineral_deposit: 'r',
  cave: 'r',
  bog: 'b',
  mossy_ground: 'o',
  moss: 'o',
  shallow_water: 'w',
  water: 'w'
};
const WALLS = ['mountain_wall', 'cliff_wall'];
const LAIRS = /den|warren|aerie|roost|nest|cache|hoard|relic|vent/;
const FINDS = /den|warren|aerie|roost|nest|cache|hoard|relic|outcrop|node|vent|geode|ite$|coal|gold|electrum|salt|cluster/;

const hash = (x, y, z) => {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const world = JSON.parse(gunzipSync(readFileSync(WORLD)).toString('utf8'));

function strip(tile) {
  const resources = {},
    growth = {};
  let kind = null;
  for (const [k, v] of Object.entries(tile.resources ?? {})) {
    if (TREE_OF[k]) {
      if (v > 0) kind = TREE_OF[k];
      continue;
    }
    resources[k] = v;
    if (tile.growth?.[k] !== undefined) growth[k] = tile.growth[k];
  }
  return { tile: { ...tile, resources, growth, parent: null }, kind };
}

const classOf = (t) => (WALLS.some((k) => (t.resources?.[k] ?? 0) > 0) ? 'x' : (CLASS[t.subType] ?? 'g'));

function finish(name, rows, trees, extra) {
  const h = rows.length - 2 * MARGIN,
    w = rows[0].length - 2 * MARGIN;
  rows.forEach((row, y) => row.forEach((t, x) => Object.assign(t, { x, y, discovered: true })));
  const kinds = rows.map((row) => row.map(classOf).join(''));
  writeFileSync(`${WORK}/${name}.map.json.gz`, gzipSync(JSON.stringify(rows)));
  writeFileSync(`${WORK}/${name}.scene.json`, JSON.stringify({ w, h, margin: MARGIN, kinds, trees, ...extra }));
  console.log(name, w, h, 'trees', trees.length);
  for (let y = MARGIN; y < MARGIN + h; y++) {
    let line = '';
    for (let x = MARGIN; x < MARGIN + w; x++) {
      const t = trees.find((q) => q.x === x - MARGIN && q.y === y - MARGIN);
      line += t ? (t.age === 'elder' ? 'E' : t.kind[0].toUpperCase()) : kinds[y][x] === 'g' ? '.' : kinds[y][x];
    }
    console.log(line);
  }
}

function region() {
  const { x0, y0, w, h } = REGION;
  const rows = [],
    trees = [];
  for (let ty = -MARGIN; ty < h + MARGIN; ty++) {
    const row = [];
    for (let tx = -MARGIN; tx < w + MARGIN; tx++) {
      const { tile, kind } = strip(world[y0 + ty][x0 + tx]);
      row.push(tile);
      if (kind && tx >= -2 && ty >= -1 && tx < w + 2 && ty < h + 5) {
        const magic = !TREE_OF[`${kind}_tree`];
        const r = hash(tx, ty, 7);
        trees.push({ x: tx, y: ty, kind, age: r < (magic ? 0.7 : 0.42) ? 'mature' : 'young', seed: 1 + Math.floor(hash(tx, ty, 9) * 3) });
      }
    }
    rows.push(row);
  }
  const LONE = [26, 30],
    ELDER = [40, 21];
  const far = (t, [x, y], d) => Math.hypot(t.x - x, t.y - y) > d;
  const kept = trees.filter((t) => far(t, LONE, 4.2) && far(t, ELDER, 3.6));
  kept.push({ x: LONE[0], y: LONE[1], kind: 'oak', age: 'mature', seed: 2, role: 'lone' });
  kept.push({ x: LONE[0] - 3, y: LONE[1] - 1, kind: 'oak', age: 'young', seed: 1, role: 'lone' });
  kept.push({ x: ELDER[0], y: ELDER[1], kind: 'heartwood', age: 'elder', seed: 1, role: 'elder' });
  const SHORE = [
    [9, 30, 'oak'],
    [8, 27, 'birch'],
    [4, 31, 'willow']
  ];
  for (const [x, y, kind] of SHORE) {
    for (let i = kept.length - 1; i >= 0; i--) if (Math.hypot(kept[i].x - x, kept[i].y - y) < 1.5) kept.splice(i, 1);
    kept.push({ x, y, kind, age: 'mature', seed: 1 + ((x + y) % 3), role: 'shore' });
  }
  return { rows, trees: kept };
}

function donors() {
  const pool = {};
  for (let y = 40; y < 710; y += 1)
    for (let x = 40; x < 710; x += 1) {
      const t = world[y][x];
      const wall = WALLS.some((k) => (t.resources?.[k] ?? 0) > 0);
      const key = wall ? 'wall' : t.subType;
      if (Object.keys(t.resources ?? {}).some((k) => TREE_OF[k])) continue;
      if (t.river || t.riverCourse) continue;
      if (!wall && Object.keys(t.resources ?? {}).some((k) => (key === 'mineral_deposit' ? LAIRS : FINDS).test(k))) continue;
      (pool[key] ??= []).length < 400 && pool[key].push(t);
    }
  return pool;
}

function laid() {
  const pool = donors();
  const BANDS = ['deep_grass', 'dirt', 'mud', 'clay', 'riverbank', 'cave', 'bog', 'mossy_ground', 'grass'];
  const BW = 7;
  const { w, h } = STRIP;
  const subAt = (tx, ty) => {
    const wob = Math.round((hash(0, ty >> 1, 31) - 0.5) * 2.2 + (hash(ty, 3, 33) - 0.5) * 1.2);
    const band = Math.max(0, Math.min(BANDS.length - 1, Math.floor((tx + wob) / BW)));
    let sub = BANDS[band];
    const sx = tx - 4 * BW;
    if (ty >= 12 + Math.round(Math.sin(tx * 0.5) * 1.2) && tx >= 3 * BW + 2 && tx < 6 * BW - 2) sub = ty >= 15 ? 'water' : 'shallow_water';
    if (ty >= 15 && tx >= 3 * BW && tx < 6 * BW) sub = sx > -3 && sx < 10 ? 'water' : 'shallow_water';
    if (ty <= 1 + Math.round(Math.sin(tx * 0.9) * 1) && tx >= 5 * BW + 1 && tx < 6 * BW) sub = 'wall';
    if (ty < 0 && tx >= 5 * BW - 1 && tx < 6 * BW + 2) sub = 'wall';
    return sub;
  };
  const rows = [];
  for (let ty = -MARGIN; ty < h + MARGIN; ty++) {
    const row = [];
    for (let tx = -MARGIN; tx < w + MARGIN; tx++) {
      const sub = subAt(tx, ty);
      const list = pool[sub] ?? pool.grass;
      const d = list[Math.floor(hash(tx, ty, 41) * list.length)];
      row.push({ ...d, resources: { ...d.resources }, growth: { ...(d.growth ?? {}) }, parent: null });
    }
    rows.push(row);
  }
  const COVER = /grass_patch$|^savanna$|moss$/;
  const clear = (tx, ty) => {
    for (let dy = -1; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const t = rows[ty + dy + MARGIN]?.[tx + dx + MARGIN];
        if (t) t.resources = Object.fromEntries(Object.entries(t.resources).filter(([k]) => COVER.test(k) || WALLS.includes(k)));
      }
  };
  const DEFAULT = ['oak', 'pine', 'willow', 'ash', 'birch', 'pine', 'willow', 'yew', 'apple'];
  const EDGE = ['oak', 'ash', 'birch', 'apple', 'pine', 'oak', 'willow', 'yew'];
  const trees = [];
  BANDS.forEach((b, i) => {
    trees.push({ x: i * BW + 3, y: 6, kind: DEFAULT[i], age: 'mature', seed: 1 + (i % 3), role: 'ground' });
    if (i !== 5) trees.push({ x: i * BW + 5, y: 3, kind: DEFAULT[i], age: 'young', seed: 1 + (i % 2), role: 'ground' });
  });
  EDGE.forEach((k, i) => trees.push({ x: i * BW + BW - 1, y: i === 3 || i === 4 || i === 5 ? 10 : 12, kind: k, age: 'mature', seed: 1 + ((i + 1) % 3), role: 'edge' }));
  trees.push({ x: 5 * BW + 3, y: 3, kind: 'pine', age: 'mature', seed: 2, role: 'edge' });
  for (const t of trees) if (t.age === 'mature') clear(t.x, t.y);
  return { rows, trees, bands: BANDS.map((b, i) => ({ sub: b, x: i * BW + 3.5 })) };
}

mkdirSync(WORK, { recursive: true });
const r = region();
finish('map', r.rows, r.trees, {});
const l = laid();
finish('grounds', l.rows, l.trees, { bands: l.bands });
