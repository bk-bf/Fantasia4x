import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [, , SCENE, WORLD, X0, Y0, TARGET] = process.argv;
const TILE = 32;
const REACH = 3;
const GRASS = /_patch$|^forest_moss$/;
const TALL = /_tree$|_grove$|_pine$|_snag$|_wall$/;
const meta = JSON.parse(readFileSync(`${SCENE}/meta.json`, 'utf8'));
const frame = readFileSync(`${SCENE}/today.rgba`);
const world = JSON.parse(gunzipSync(readFileSync(WORLD)).toString('utf8'));
const tall = (tx, ty) => Object.keys(world[ty]?.[tx]?.resources ?? {}).some((k) => TALL.test(k));
const sums = {};
for (let ty = 0; ty < meta.H / TILE; ty++)
  for (let tx = 0; tx < meta.W / TILE; tx++) {
    const wx = +X0 + tx,
      wy = +Y0 + ty;
    let shaded = false;
    for (let j = 0; j <= REACH && !shaded; j++) for (let i = -1; i <= 1 && !shaded; i++) shaded = tall(wx + i, wy + j);
    if (shaded) continue;
    const t = world[wy][wx];
    const key = Object.keys(t.resources ?? {}).some((k) => GRASS.test(k)) ? `${t.subType}+grass` : t.subType;
    const sum = (sums[key] ??= [0, 0, 0, 0]);
    for (let y = ty * TILE; y < (ty + 1) * TILE; y++)
      for (let x = tx * TILE; x < (tx + 1) * TILE; x++) {
        const o = (y * meta.W + x) * 4;
        sum[0] += frame[o];
        sum[1] += frame[o + 1];
        sum[2] += frame[o + 2];
        sum[3]++;
      }
  }
const prior = (() => {
  try {
    return JSON.parse(readFileSync(TARGET, 'utf8'));
  } catch {
    return {};
  }
})();
writeFileSync(TARGET, JSON.stringify({ ...prior, ...Object.fromEntries(Object.entries(sums).map(([k, s]) => [k, [s[0] / s[3], s[1] / s[3], s[2] / s[3]]])) }));
console.log(Object.keys(sums).join(' '));
