import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , TREE, PORT, WORK, ONLY = ''] = process.argv;
const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, '..');
const MOCKUPS = join(PAGE, '..');
const REGION = [372, 176, 96, 64];
const TOPS = ['tor', 'pavement', 'knoll'];
const wanted = (name) => !ONLY || ONLY.split(',').some((part) => name.includes(part));
const node = (script, ...args) => execFileSync('node', [script, ...args.map(String)], { stdio: 'inherit' });
const webp = (png, name) => execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-sharp_yuv', png, '-o', join(PAGE, 'img', `${name}.webp`)]);
const world = `${WORK}/world.json.gz`;

mkdirSync(`${WORK}/png`, { recursive: true });
mkdirSync(join(PAGE, 'img'), { recursive: true });
if (!existsSync(world)) throw new Error(`run mockups/mountain-tops/probe/world.test.ts first, with WORLD_OUT=${world}`);
if (wanted('worlds') && (ONLY || !existsSync(`${WORK}/worlds/bridged.json.gz`))) node(join(MOCKUPS, 'map-scale', 'probe', 'worlds.mjs'), TREE, world, `${WORK}/worlds`);

const scenes = [
  { name: 'today', world, query: '' },
  { name: 'base', world: `${WORK}/worlds/bridged.json.gz`, query: '&peaks=0' }
];
for (const s of scenes) {
  const dir = `${WORK}/scene-${s.name}`;
  if (!wanted(`render-${s.name}`) || (!ONLY && existsSync(`${dir}/meta.json`))) continue;
  rmSync(`${dir}/footprint.bin`, { force: true });
  node(join(MOCKUPS, 'mountain-tops', 'probe', 'render.mjs'), TREE, PORT, s.world, dir, ...REGION, s.query);
}

const [x0, y0] = REGION;
const views = [{ name: 'today', scene: 'today', spec: { x0, y0, map: 750 } }];
for (const top of TOPS)
  for (const mined of [false, true])
    views.push({
      name: mined ? `${top}-mined` : top,
      scene: 'base',
      spec: { x0, y0, map: 750, plan: `${WORK}/worlds/bridged-plan.json`, mined, top: { module: join(HERE, 'outcrops.mjs'), name: top } }
    });
for (const v of views) {
  if (!wanted(`compose-${v.name}`)) continue;
  const png = `${WORK}/png/${v.name}.png`;
  node(join(MOCKUPS, 'map-scale', 'probe', 'compose.mjs'), TREE, `${WORK}/scene-${v.scene}`, png, JSON.stringify(v.spec));
  webp(png, v.name);
}
if (wanted('studies')) node(join(HERE, 'studies.mjs'), TREE, join(PAGE, 'img'));
