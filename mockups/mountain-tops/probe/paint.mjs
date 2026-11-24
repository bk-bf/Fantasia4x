import { writeFileSync } from 'node:fs';
import { loadScene, distanceInside, blur } from './field.mjs';
import { DIRECTIONS } from './directions.mjs';
import { excavate } from './mine.mjs';
import { peakLayer, sunlight } from './layer.mjs';

const [, , TREE, OUT, WHICH = 'a', SNOW = '0', MINED = '0', REGION = ''] = process.argv;
const scene = await loadScene(TREE, OUT);
const { encodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const { W, H, FW, FH, M, foot, top, today, s0 } = scene;
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

const { layer, drawn, source } = peakLayer(scene, dir, box);
const { at: lightAt, noon } = sunlight(scene, ramp);
const dig = MINED === '1' ? excavate({ ...scene, A, grain }) : null;
const UNDER = 0.74;
const RIM = { [dig?.PART.rimLit]: 1.24, [dig?.PART.rimDark]: 0.74 };

const out = new Uint8Array(RW * RH * 4);
for (let y = 0; y < RH; y++)
  for (let x = 0; x < RW; x++) {
    const ci = (RY + y) * W + RX + x,
      fx = RX + x + M,
      fy = RY + y + M,
      fi = fy * FW + fx,
      o = (y * RW + x) * 4;
    out[o + 3] = 255;
    const peak = top[ci] && drawn[fi] && !(dig && dig.seeThrough(fx, fy));
    const stands = dig && dig.ground[fi] > 0 && (peak ? source[fi] : dig.cover(fx, fy)) < dig.ground[fi];
    const dug = dig && !peak && !stands ? dig.part[fi] : 0;
    for (let c = 0; c < 3; c++) {
      const sun = top[ci] ? lightAt(ci, c) : noon[c];
      let v = today[ci * 4 + c];
      if (stands) v = dig.folk[fi * 3 + c] * sun;
      else if (peak) v = s0[ci * 4 + c] + (layer[fi * 3 + c] - ramp[0][c]) * sun;
      else if (dug === dig?.PART.floor || dug === dig?.PART.face) v = dig.colour[fi * 3 + c] * sun * (dug === dig.PART.face ? UNDER : 1);
      else if (dug) v *= RIM[dug] * UNDER;
      else if (dig && top[ci] && drawn[fi]) v *= UNDER;
      out[o + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
const name = `${OUT}/${WHICH}${MINED === '1' ? '-mined' : ''}${SNOW === '1' ? '-snow' : ''}${REGION ? '-region' : ''}.png`;
writeFileSync(name, encodePng(RW, RH, out, 6));
if (!REGION && WHICH === 'a' && SNOW === '0' && MINED === '0') {
  const flat = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H * 4; i++) flat[i] = i % 4 === 3 ? 255 : today[i];
  writeFileSync(`${OUT}/today.png`, encodePng(W, H, flat, 6));
}
console.log('wrote', name);
