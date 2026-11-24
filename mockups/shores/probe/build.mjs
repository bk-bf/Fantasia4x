import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shores, plants } from './shores.mjs';

const [, , TREE, PORT, WORK, ONLY = ''] = process.argv;
const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, '..');
const PEAKS = join(HERE, '..', '..', 'mountain-tops', 'probe');
const SCALE = join(HERE, '..', '..', 'map-scale', 'probe');
const { regions } = JSON.parse(readFileSync(join(PAGE, 'places.json'), 'utf8'));
const wanted = (name) => !ONLY || ONLY.split(',').some((part) => name.includes(part));
const node = (script, ...args) => execFileSync('node', [script, ...args.map(String)], { stdio: 'inherit' });
const TODAY = `${WORK}/world.json.gz`;
const GEN = `${WORK}/shores.json.gz`;

if (!existsSync(TODAY)) throw new Error(`run mockups/mountain-tops/probe/world.test.ts first, with WORLD_OUT=${TODAY}`);
mkdirSync(`${WORK}/png`, { recursive: true });
mkdirSync(join(PAGE, 'img'), { recursive: true });
if (wanted('worlds') || !existsSync(GEN)) {
  const today = JSON.parse(gunzipSync(readFileSync(TODAY)).toString('utf8'));
  const gen = shores(today);
  writeFileSync(GEN, gzipSync(JSON.stringify(gen), { level: 1 }));
  writeFileSync(`${WORK}/plan-today.json`, JSON.stringify(plants(today)));
  writeFileSync(`${WORK}/plan-gen.json`, JSON.stringify(plants(gen)));
}
writeFileSync(`${WORK}/plan-none.json`, JSON.stringify({ trees: [], reeds: [], lilies: [] }));

const VARIANTS = [
  { name: 'today', world: 'today', plan: 'none' },
  { name: 'art', world: 'today', plan: 'today' },
  { name: 'gen', world: 'gen', plan: 'none' },
  { name: 'all', world: 'gen', plan: 'gen' }
];

for (const [region, r] of Object.entries(regions))
  for (const world of ['today', 'gen']) {
    const scene = `${WORK}/scene-${region}-${world}`;
    if (!wanted(`render-${region}-${world}`) && existsSync(`${scene}/meta.json`)) continue;
    rmSync(`${scene}/footprint.bin`, { force: true });
    node(join(PEAKS, 'render.mjs'), TREE, PORT, world === 'today' ? TODAY : GEN, scene, r.x, r.y, r.w, r.h);
  }

for (const [region, r] of Object.entries(regions))
  for (const v of VARIANTS) {
    const name = `${region}-${v.name}`;
    if (!wanted(`compose-${name}`)) continue;
    const spec = { x0: r.x, y0: r.y, map: 750, plan: `${WORK}/plan-${v.plan}.json`, folk: [] };
    node(join(SCALE, 'compose.mjs'), TREE, `${WORK}/scene-${region}-${v.world}`, `${WORK}/png/${name}.png`, JSON.stringify(spec));
    execFileSync('cwebp', ['-quiet', '-q', '84', '-m', '6', '-sharp_yuv', `${WORK}/png/${name}.png`, '-o', join(PAGE, 'img', `${name}.webp`)]);
  }
