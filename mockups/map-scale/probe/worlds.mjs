import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { bridge, trueWorld } from './lands.mjs';

const [, , TREE, WORLD, OUT] = process.argv;
const manifest = JSON.parse(readFileSync(`${TREE}/static/tilesets/painted/manifest.json`, 'utf8'));
const kinds = Object.fromEntries(
  Object.entries(manifest.map.resource)
    .filter(([, sprites]) => sprites[0].startsWith('tree/'))
    .map(([id, sprites]) => [id, sprites[0].split('/')[1]])
);
const today = JSON.parse(gunzipSync(readFileSync(WORLD)).toString('utf8'));
mkdirSync(OUT, { recursive: true });
for (const [name, build] of Object.entries({ bridged: bridge, true: trueWorld })) {
  const { world, plan } = build(today, kinds);
  writeFileSync(`${OUT}/${name}.json.gz`, gzipSync(JSON.stringify(world), { level: 1 }));
  writeFileSync(`${OUT}/${name}-plan.json`, JSON.stringify(plan));
  console.log(name, 'trees', plan.trees.length, 'reeds', plan.reeds.length, 'lilies', plan.lilies.length);
}
writeFileSync(`${OUT}/kinds.json`, JSON.stringify(kinds));
