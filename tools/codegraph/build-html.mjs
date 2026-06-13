// @ts-check
/**
 * Inlines graph.json + descriptions.json into template.html and writes a
 * single self-contained codegraph.html that opens in any browser.
 *
 * Run with:  node tools/codegraph/build-html.mjs   (run extract.mjs first)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

const graphPath = path.join(dir, 'graph.json');
if (!fs.existsSync(graphPath)) {
  console.error('graph.json missing — run `node tools/codegraph/extract.mjs` first.');
  process.exit(1);
}

const template = read('template.html');
// strip the JSONC-style _comment keys before inlining
const desc = JSON.parse(read('descriptions.json'));

// Escape `<` so the data can never break out of the <script> tag.
const safe = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

const html = template
  .replace('/*__GRAPH__*/', safe(JSON.parse(read('graph.json'))))
  .replace('/*__DESC__*/', safe(desc));

const outPath = path.join(dir, 'codegraph.html');
fs.writeFileSync(outPath, html);
console.error(`Wrote ${outPath} (${(html.length / 1024).toFixed(0)} KB)`);
