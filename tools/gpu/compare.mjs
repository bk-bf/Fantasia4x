import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodePng, encodePng } from './png.mjs';

const [A, B, DIFF_DIR] = process.argv.slice(2);
if (!A || !B) {
  console.error(
    'usage: node tools/gpu/compare.mjs <before dir> <after dir> [diff dir, default <after dir>/diff]'
  );
  process.exit(2);
}
const diffDir = resolve(DIFF_DIR ?? join(B, 'diff'));
const commitOf = (/** @type {string} */ dir) =>
  existsSync(join(dir, 'COMMIT')) ? readFileSync(join(dir, 'COMMIT'), 'utf8').trim() : 'unknown';
console.log(`before ${commitOf(A)}  after ${commitOf(B)}`);
const scenes = readdirSync(A)
  .filter((f) => f.endsWith('.png'))
  .sort();
let failed = 0;
for (const f of scenes) {
  const pb = join(B, f);
  if (!existsSync(pb)) {
    console.log(`${f.padEnd(28)} MISSING in ${B}`);
    failed++;
    continue;
  }
  const a = decodePng(readFileSync(join(A, f)));
  const b = decodePng(readFileSync(pb));
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`${f.padEnd(28)} SIZE ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    failed++;
    continue;
  }
  const out = Buffer.alloc(a.rgba.length);
  let diff = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    const d = Math.max(
      Math.abs(a.rgba[i] - b.rgba[i]),
      Math.abs(a.rgba[i + 1] - b.rgba[i + 1]),
      Math.abs(a.rgba[i + 2] - b.rgba[i + 2]),
      Math.abs(a.rgba[i + 3] - b.rgba[i + 3])
    );
    if (d) {
      diff++;
      if (d > maxDelta) maxDelta = d;
      out[i] = 255;
      out[i + 1] = 0;
      out[i + 2] = 255;
    } else {
      const g = (a.rgba[i] * 0.3 + a.rgba[i + 1] * 0.59 + a.rgba[i + 2] * 0.11) * 0.35;
      out[i] = out[i + 1] = out[i + 2] = g;
    }
    out[i + 3] = 255;
  }
  if (diff) {
    mkdirSync(diffDir, { recursive: true });
    writeFileSync(join(diffDir, f), encodePng(a.width, a.height, out));
    failed++;
  }
  console.log(
    `${f.padEnd(28)} ${diff ? `DIFF ${diff} px, max channel delta ${maxDelta} -> ${join(diffDir, f)}` : 'identical'}`
  );
}
console.log(
  failed
    ? `${failed} of ${scenes.length} scenes differ`
    : `all ${scenes.length} scenes bit-identical`
);
process.exit(failed ? 1 : 0);
