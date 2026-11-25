import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAtlas, ORDINARY, MAGIC } from './atlas.mjs';

const [, , TREE, PORT, WORK, ONLY = ''] = process.argv;
const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, '..');
const IMG = join(PAGE, 'img');
const TILE = 32;
const SEASONS = ['summer', 'winter'];
const BASE = { summer: 'summer-ground', winter: 'winter-ground' };
const wanted = (name) => !ONLY || ONLY.split(',').includes(name);
const node = (script, ...args) => execFileSync('node', [script, ...args.map(String)], { stdio: 'inherit' });
const { encodePng } = await import(`${TREE}/tools/tileset/png.mjs`);

const VIEWS = {
  map: {
    places: { lone: [26.5, 29.4], forest: [51.5, 9], edge: [46, 16.5], water: [8, 29.5], rock: [56, 37], elder: [40.5, 19.5] },
    folk: [
      ['woodcutter', 27.5, 30.9, false],
      ['hunter', 24.2, 29.6, true],
      ['farmer', 51.2, 9.6, false],
      ['cook', 53.6, 11.2, true],
      ['weaver', 41.9, 22.2, true],
      ['miner', 38.6, 21.4, false],
      ['hunter', 46.4, 17.3, false],
      ['woodcutter', 10.6, 31.2, true]
    ]
  },
  grounds: {
    places: { grounds: [31, 8.5] },
    folk: [
      ['farmer', 4.3, 6.9, false],
      ['hunter', 18.2, 6.8, true],
      ['cook', 32.4, 6.9, false],
      ['miner', 39.3, 6.7, true],
      ['weaver', 53.3, 6.9, false],
      ['woodcutter', 27.9, 10.9, true]
    ]
  }
};

mkdirSync(IMG, { recursive: true });
mkdirSync(WORK, { recursive: true });
const world = `${WORK}/world.json.gz`;
if (!existsSync(world)) throw new Error(`run mockups/mountain-tops/probe/world.test.ts first, with WORLD_OUT=${world}`);
if (wanted('world')) node(join(HERE, 'world.mjs'), world, WORK);

const views = {};
for (const [name, extra] of Object.entries(VIEWS)) {
  const dir = `${WORK}/${name}`;
  if (wanted('render') && (ONLY || !existsSync(`${dir}/meta.json`))) node(join(HERE, 'render.mjs'), TREE, PORT, `${WORK}/${name}.map.json.gz`, dir);
  const scene = JSON.parse(readFileSync(`${WORK}/${name}.scene.json`, 'utf8'));
  const W = scene.w * TILE,
    H = scene.h * TILE;
  const raw = (layer) => readFileSync(`${dir}/${layer}.rgba`);
  if (wanted('images')) {
    const keep = new Uint8Array(W * H * 4);
    SEASONS.forEach((season, k) => {
      const full = new Uint8Array(raw(season));
      for (let i = 3; i < full.length; i += 4) full[i] = 255;
      writeFileSync(`${WORK}/${name}-${season}.png`, encodePng(W, H, full, 6));
      execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '8', `${WORK}/${name}-${season}.png`, '-o', join(IMG, `${name}-${season}.webp`)]);
      const props = raw(`${season}-props`),
        ground = raw(BASE[season]);
      for (let i = 0; i < W * H; i++) {
        const o = i * 4;
        keep[o + 3] = 255;
        if (props[o] !== ground[o] || props[o + 1] !== ground[o + 1] || props[o + 2] !== ground[o + 2]) keep[o + k * 2] = 255;
      }
    });
    writeFileSync(`${WORK}/${name}-keep.png`, encodePng(W, H, keep, 6));
    execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '8', `${WORK}/${name}-keep.png`, '-o', join(IMG, `${name}-keep.webp`)]);
  }
  views[name] = { ...scene, ...extra };
}

const painted = `${TREE}/static/tilesets/painted`;
const { decodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const manifest = JSON.parse(readFileSync(`${painted}/manifest.json`, 'utf8'));
const sheet = decodePng(readFileSync(`${painted}/atlas.png`));
const tufts = {};
for (const [id, s] of Object.entries(manifest.sprites)) {
  const m = /^tuft\/(\w+)\/(\d)$/.exec(id);
  if (!m) continue;
  const px = [];
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const o = ((s.y + y) * sheet.w + s.x + x) * 4;
      if (sheet.rgba[o + 3] > 127) px.push([x + s.ox, y + s.oy, '#' + [0, 1, 2].map((k) => sheet.rgba[o + k].toString(16).padStart(2, '0')).join('')]);
    }
  (tufts[m[1]] ??= [])[Number(m[2])] = px;
}

const sceneFile = join(PAGE, 'scene.json');
const art = wanted('atlas') ? await buildAtlas(TREE, WORK, IMG, encodePng) : JSON.parse(readFileSync(sceneFile, 'utf8'));
writeFileSync(
  sceneFile,
  JSON.stringify({ tile: TILE, atlas: art.atlas, sprites: art.sprites, kinds: art.kinds, palette: art.palette, ordinary: ORDINARY, magic: MAGIC, tufts, views }) + '\n'
);
console.log('sprites', Object.keys(art.sprites).length, 'atlas', art.atlas.join('x'));
