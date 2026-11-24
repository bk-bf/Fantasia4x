import { writeFileSync } from 'node:fs';
import { loadScene, distanceInside, blur } from './field.mjs';
import { DIRECTIONS } from './directions.mjs';

const [, , TREE, OUT, WHICH = 'a', SNOW = '0', REGION = ''] = process.argv;
const scene = await loadScene(TREE, OUT);
const { encodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const { W, H, FW, FH, M, LIFT, foot, top, today, s0, s6 } = scene;
const A = scene.art(4096);
const grain = scene.art(2048).rockTone;
const ramp = A.P.rock;

const [RX, RY, RW, RH] = REGION ? REGION.split(',').map(Number) : [0, 0, W, H];
const PAD = 140;
const box = {
  x0: Math.max(0, RX + M - PAD),
  x1: Math.min(FW, RX + M + RW + PAD),
  y0: Math.max(0, RY + M - PAD),
  y1: Math.min(FH, RY + M + RH + PAD)
};

const { dist, nearX, nearY } = distanceInside(foot, FW, FH);
const dir = DIRECTIONS[WHICH]({ grain, A, FW, FH, foot, dist, nearX, nearY, blur, box, snow: SNOW === '1' });

const layer = new Uint8Array(FW * FH * 3);
const drawn = new Uint8Array(FW * FH);
const put = (x, r, c) => {
  if (r < 0 || r >= FH) return;
  const i = r * FW + x;
  layer[i * 3] = c[0];
  layer[i * 3 + 1] = c[1];
  layer[i * 3 + 2] = c[2];
  drawn[i] = 1;
};
for (let x = box.x0; x < box.x1; x++) {
  let front = Infinity;
  for (let y = box.y1 - 1; y >= box.y0; y--) {
    const i = y * FW + x;
    if (!foot[i]) {
      front = Infinity;
      continue;
    }
    if (front === Infinity) front = y - LIFT + 1;
    const row = Math.round(y - LIFT - dir.height[i]);
    if (row >= front) continue;
    const span = front - row;
    for (let k = 0; k < span; k++) put(x, row + k, dir.colour(x, y, row + k, k, span));
    front = row;
  }
}

const out = new Uint8Array(RW * RH * 4);
const gain = [0, 1, 2].map((c) => 1 / (ramp[6][c] - ramp[0][c]));
for (let y = 0; y < RH; y++)
  for (let x = 0; x < RW; x++) {
    const ci = (RY + y) * W + RX + x,
      fi = (RY + y + M) * FW + RX + x + M,
      o = (y * RW + x) * 4;
    out[o + 3] = 255;
    for (let c = 0; c < 3; c++) {
      if (!top[ci] || !drawn[fi]) {
        out[o + c] = today[ci * 4 + c];
        continue;
      }
      const lit = (s6[ci * 4 + c] - s0[ci * 4 + c]) * gain[c];
      out[o + c] = Math.max(0, Math.min(255, Math.round(s0[ci * 4 + c] + (layer[fi * 3 + c] - ramp[0][c]) * lit)));
    }
  }
const name = `${OUT}/${WHICH}${SNOW === '1' ? '-snow' : ''}${REGION ? '-region' : ''}.png`;
writeFileSync(name, encodePng(RW, RH, out, 6));
if (!REGION && WHICH === 'a' && SNOW === '0') {
  const flat = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H * 4; i++) flat[i] = i % 4 === 3 ? 255 : today[i];
  writeFileSync(`${OUT}/today.png`, encodePng(W, H, flat, 6));
}
console.log('wrote', name);
