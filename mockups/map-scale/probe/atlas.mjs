import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadArt } from './trees.mjs';
import { snowDepth } from './lands.mjs';
import { noise, distanceTo } from './grid.mjs';

const [, , TREE, WORLD, TARGET, SPEC] = process.argv;
const spec = JSON.parse(SPEC);
const { encodePng, decodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const A = await loadArt(TREE);
const painted = `${TREE}/static/tilesets/painted`;
const manifest = JSON.parse(readFileSync(`${painted}/manifest.json`, 'utf8'));
const sheet = decodePng(readFileSync(`${painted}/atlas.png`));
const world = JSON.parse(gunzipSync(readFileSync(WORLD)).toString('utf8'));
const plan = spec.plan ? JSON.parse(readFileSync(spec.plan, 'utf8')) : { trees: [] };
const kinds = spec.kinds;
const n = world.length;
const K = spec.scale;
const S = n * K;
const TILE = manifest.tile;

const mean = (id) => {
  const s = manifest.sprites[id];
  const sum = [0, 0, 0];
  let count = 0;
  for (let y = s.y; y < s.y + s.h; y++)
    for (let x = s.x; x < s.x + s.w; x++) {
      const o = (y * sheet.w + x) * 4;
      if (sheet.rgba[o + 3] < 200) continue;
      for (let c = 0; c < 3; c++) sum[c] += sheet.rgba[o + c];
      count++;
    }
  return sum.map((v) => v / Math.max(1, count));
};
const seen = spec.palette ? JSON.parse(readFileSync(spec.palette, 'utf8')) : {};
const ground = { ...Object.fromEntries(Object.entries(manifest.map.subterrain).map(([sub, ids]) => [sub, mean(ids[0])])), ...seen };
const GRASS = /_patch$|^forest_moss$/;
const groundOf = (t) => ground[Object.keys(t.resources ?? {}).some((k) => GRASS.test(k)) ? `${t.subType}+grass` : t.subType] ?? ground[t.subType] ?? ground.dirt;
const solid = (t) => (t.resources?.mountain_wall ?? 0) > 0 || (t.resources?.cliff_wall ?? 0) > 0;
const inside = distanceTo(n, n, (i) => !solid(world[(i / n) | 0][i % n]));
const snowfield = spec.style === 'true';
const relief = spec.style !== 'today';

const px = new Uint8Array(S * S * 4).fill(255);
const put = (x, y, c, k = 1) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const o = (y * S + x) * 4;
  px[o] = Math.min(255, c[0] * k);
  px[o + 1] = Math.min(255, c[1] * k);
  px[o + 2] = Math.min(255, c[2] * k);
};
const TONES = [0.93, 1, 1.07];
const depthAt = (tx, ty) => inside[Math.max(0, Math.min(n - 1, ty)) * n + Math.max(0, Math.min(n - 1, tx))];
const heightAt = (x, y) => {
  const fx = x / K - 0.5,
    fy = y / K - 0.5,
    tx = Math.floor(fx),
    ty = Math.floor(fy),
    u = fx - tx,
    v = fy - ty;
  const d = (depthAt(tx, ty) * (1 - u) + depthAt(tx + 1, ty) * u) * (1 - v) + (depthAt(tx, ty + 1) * (1 - u) + depthAt(tx + 1, ty + 1) * u) * v;
  return d * (0.5 + 1.1 * (1 - Math.abs(2 * noise(x / 34, y / 34, 501) - 1)));
};

for (let ty = 0; ty < n; ty++)
  for (let tx = 0; tx < n; tx++) {
    const t = world[ty][tx];
    const white = snowfield && snowDepth(tx, ty, n) + (noise(tx / 3, ty / 3, 505) - 0.5) * 6 > 0;
    for (let j = 0; j < K; j++)
      for (let i = 0; i < K; i++) {
        const x = tx * K + i,
          y = ty * K + j;
        if (!solid(t)) {
          const tone = TONES[Math.floor(noise(tx / 5, ty / 5, 507) * 2.999)];
          if (white) put(x, y, A.rp(A.P.snow, 0.66 + (noise(x / 14, y / 14, 509) - 0.5) * 0.6, x, y, 0));
          else put(x, y, groundOf(t), tone);
          continue;
        }
        if (!relief) {
          const face = ty + 1 < n && !solid(world[ty + 1][tx]) && j === K - 1;
          put(x, y, A.P.rock[face ? 1 : 3], face ? 1 : TONES[Math.floor(noise(tx / 4, ty / 4, 511) * 2.999)]);
          continue;
        }
        const h = heightAt(x, y);
        const lit = (h - heightAt(x - 3, y - 3) * 0.6 - heightAt(x - 3, y) * 0.4) / 1.5;
        const tone = 0.44 + lit * 0.3 + (noise(x / 7, y / 7, 503) - 0.5) * 0.1;
        const capped = white ? lit > -0.2 : h > 13 && lit > -0.1;
        put(x, y, capped ? A.rp(A.P.snow, 0.6 + lit * 0.3, x, y, 0) : A.rp(A.P.rock, tone, x, y, 0));
      }
  }

const blobs = [];
for (let ty = 0; ty < n; ty++)
  for (let tx = 0; tx < n; tx++) {
    const t = world[ty][tx];
    for (const k of Object.keys(t.resources ?? {})) if (kinds[k] && t.resources[k] > 0) blobs.push({ x: tx, y: ty, kind: kinds[k], r: K / 2, rise: 0 });
  }
for (const t of plan.trees) {
  const k = A.TREES[t.kind];
  const reach = k.shape === 'pine' ? 26.2 * Math.pow(t.f, 0.78) * 0.62 : k.shape === 'birch' ? 16 * Math.pow(t.f, 0.8) : k.shape === 'dead' ? 0 : k.rx * t.f * 0.95;
  if (reach) blobs.push({ x: t.x, y: t.y, kind: t.kind, r: Math.max(K / 2, (reach / TILE) * K), rise: ((k.th ?? 40) * Math.pow(t.f, 1.22) * 0.5) / TILE });
}
blobs.sort((a, b) => a.y - b.y);
for (const b of blobs) {
  const leaf = A.TREES[b.kind].leaf ?? A.P.oak,
    cx = (b.x + 0.5) * K,
    cy = (b.y + 0.9 - b.rise) * K - b.r * 0.6,
    top = leaf.length - 1;
  if (b.r <= K / 2 + 0.01) {
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) put(b.x * K + i, b.y * K + j - 1, leaf[j === 0 ? top - 1 : 2]);
    continue;
  }
  for (let y = Math.floor(cy - b.r); y <= Math.ceil(cy + b.r); y++)
    for (let x = Math.floor(cx - b.r); x <= Math.ceil(cx + b.r); x++) {
      const u = (x + 0.5 - cx) / b.r,
        v = (y + 0.5 - cy) / b.r,
        q = u * u + v * v;
      if (q > 1) continue;
      const lit = -(u * 0.55 + v * 0.6) + Math.sqrt(1 - q) * 0.4 + (noise(x / 2.5, y / 2.5, 515 + b.x) - 0.5) * 0.5;
      put(x, y, q > 0.8 && u + v > 0.2 ? leaf[0] : A.rp(leaf, 0.5 + lit * 0.42, x, y, 0.5));
    }
}

for (const [bx, by, bw, bh] of spec.boxes ?? []) {
  const edge = (x, y) => put(x, y, [246, 238, 214]);
  for (let x = bx * K - 1; x <= (bx + bw) * K; x++) {
    edge(x, by * K - 1);
    edge(x, (by + bh) * K);
  }
  for (let y = by * K - 1; y <= (by + bh) * K; y++) {
    edge(bx * K - 1, y);
    edge((bx + bw) * K, y);
  }
}
writeFileSync(TARGET, encodePng(S, S, px, 6));
console.log('wrote', TARGET, S, 'blobs', blobs.length);
