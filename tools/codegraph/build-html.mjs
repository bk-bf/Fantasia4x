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

const vendorPath = path.join(dir, 'vendor', 'mermaid.min.js');
if (!fs.existsSync(vendorPath)) {
  console.error('vendor/mermaid.min.js missing. Download it once with:');
  console.error('  curl -s -o tools/codegraph/vendor/mermaid.min.js \\');
  console.error('    https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js');
  process.exit(1);
}
const mermaidSrc = read(path.join('vendor', 'mermaid.min.js'));
// Inline the shared analysis module (export-stripped) so the viewer can run the
// architecture checks / port-candidates client-side — same code as CLI + API.
const analysisSrc = read('analysis.mjs').replace(/^export\s+/gm, '');

const html = template
  .replace('/*__GRAPH__*/', safe(JSON.parse(read('graph.json'))))
  .replace('/*__DESC__*/', safe(desc))
  // injected via function to avoid $-pattern interpretation in String.replace.
  .replace('/*__MERMAID__*/', () => mermaidSrc)
  .replace('/*__ANALYSIS__*/', () => analysisSrc);

const outPath = path.join(dir, 'codegraph.html');
fs.writeFileSync(outPath, html);
console.error(`Wrote ${outPath} (${(html.length / 1024).toFixed(0)} KB)`);
