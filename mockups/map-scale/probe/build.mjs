import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , TREE, PORT, WORK, ONLY = ''] = process.argv;
const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, '..');
const PEAKS = join(HERE, '..', '..', 'mountain-tops', 'probe');
const places = JSON.parse(readFileSync(join(PAGE, 'places.json'), 'utf8'));
const { region, map } = places;
const wanted = (name) => !ONLY || ONLY.split(',').some((part) => name.includes(part));
const node = (script, ...args) => execFileSync('node', [script, ...args.map(String)], { stdio: 'inherit' });
const worldOf = (name) => (name === 'today' ? `${WORK}/world.json.gz` : `${WORK}/worlds/${name}.json.gz`);
const planOf = (name) => (name === 'today' ? null : `${WORK}/worlds/${name}-plan.json`);

mkdirSync(`${WORK}/png`, { recursive: true });
mkdirSync(join(PAGE, 'img'), { recursive: true });
if (!existsSync(worldOf('today'))) throw new Error(`run mockups/mountain-tops/probe/world.test.ts first, with WORLD_OUT=${worldOf('today')}`);
if (wanted('worlds') && (ONLY || !existsSync(worldOf('true')))) node(join(HERE, 'worlds.mjs'), TREE, worldOf('today'), `${WORK}/worlds`);
const kinds = JSON.parse(readFileSync(`${WORK}/worlds/kinds.json`, 'utf8'));

const views = [
  { name: 'today', world: 'today', x: region.x, y: region.y, folk: places.folk.region },
  { name: 'bridged', world: 'bridged', x: region.x, y: region.y, folk: places.folk.region, peaks: true },
  ...Object.entries(places.places).map(([place, p]) => ({ name: `true-${place}`, world: 'true', x: p.true[0], y: p.true[1], folk: places.folk[place], peaks: true, snowfield: true }))
];

const webp = (name) => execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-sharp_yuv', `${WORK}/png/${name}.png`, '-o', join(PAGE, 'img', `${name}.webp`)]);

for (const v of views) {
  const scene = `${WORK}/scene-${v.name}`;
  if (wanted(`render-${v.name}`) && (ONLY || !existsSync(`${scene}/meta.json`))) {
    rmSync(`${scene}/footprint.bin`, { force: true });
    node(join(PEAKS, 'render.mjs'), TREE, PORT, worldOf(v.world), scene, v.x, v.y, region.w, region.h);
  }
  if (wanted(`palette-${v.name}`)) node(join(HERE, 'palette.mjs'), scene, worldOf(v.world), v.x, v.y, `${WORK}/palette.json`);
}
for (const v of views) {
  if (!wanted(`compose-${v.name}`)) continue;
  const spec = { x0: v.x, y0: v.y, map, peaks: Boolean(v.peaks), snowfield: Boolean(v.snowfield), plan: planOf(v.world), folk: v.folk };
  node(join(HERE, 'compose.mjs'), TREE, `${WORK}/scene-${v.name}`, `${WORK}/png/${v.name}.png`, JSON.stringify(spec));
  webp(v.name);
}
for (const style of ['today', 'bridged', 'true']) {
  if (!wanted(`map-${style}`)) continue;
  const boxes = style === 'true' ? Object.values(places.places).map((p) => [...p.true, region.w, region.h]) : [[region.x, region.y, region.w, region.h]];
  const spec = { style, scale: places.mapScale, kinds, plan: planOf(style), palette: `${WORK}/palette.json`, boxes };
  node(join(HERE, 'atlas.mjs'), TREE, worldOf(style), `${WORK}/png/map-${style}.png`, JSON.stringify(spec));
  execFileSync('cwebp', ['-quiet', '-lossless', '-z', '9', `${WORK}/png/map-${style}.png`, '-o', join(PAGE, 'img', `map-${style}.webp`)]);
}
