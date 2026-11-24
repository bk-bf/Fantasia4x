import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { itemObjects } from './items.mjs';
import { loadRegistry } from './registry.mjs';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'lib',
  'game',
  'database',
  'items',
  'storage.json'
);
const DEFAULT_TUCK = 'low';

const drawing = (sketch = new Map([['', { x: 0, y: 0, rgb: [0, 0, 0] }]])) =>
  [...sketch.values()]
    .map((c) => `${c.x},${c.y},${c.rgb.join('.')}`)
    .sort()
    .join(';');

function stageBounds(own = { stages: [0], ground: (quantity = 1) => new Map() }) {
  const shown = own.stages.map((mark) => drawing(own.ground(mark)));
  const bounds = [];
  let stage = 0;
  for (let quantity = 1; quantity <= own.stages[own.stages.length - 1]; quantity++) {
    const at = shown.indexOf(drawing(own.ground(quantity)));
    if (at < stage) throw new Error(`a stage drawn at ${quantity} comes before stage ${stage}`);
    while (stage < at) {
      bounds.push(quantity - 1);
      stage++;
    }
  }
  if (bounds.length !== own.stages.length - 1) throw new Error('a stage is never drawn');
  return bounds;
}

export function ownStorage(DBX = loadRegistry()) {
  const rows = Object.fromEntries([['', { family: '' }]].slice(1));
  for (const o of itemObjects()) {
    const own = DBX.worldGear.of(o);
    if (!own) continue;
    rows[o.id] = {
      family: own.kind,
      ...((own.tuck ?? DEFAULT_TUCK) === DEFAULT_TUCK ? {} : { tuck: own.tuck }),
      ...(own.stages ? { stages: stageBounds(own), stack: own.stages[own.stages.length - 1] } : {})
    };
  }
  return rows;
}

const spaced = (row = { family: '' }) =>
  JSON.stringify(row)
    .replace(/([{,:])(?=["\d[])/g, '$1 ')
    .replace(/}$/, ' }');

export const storageJson = (rows = ownStorage()) =>
  `{\n${Object.entries(rows)
    .map(([id, row]) => `  "${id}": ${spaced(row)}`)
    .join(',\n')}\n}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = storageJson();
  const changed = readFileSync(OUT, 'utf8') !== next;
  if (changed) writeFileSync(OUT, next);
  console.log(
    `${Object.keys(JSON.parse(next)).length} items with their own map sprite${changed ? ', storage.json rewritten' : ''}`
  );
}
