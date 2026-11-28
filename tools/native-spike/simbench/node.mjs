import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [, , out, ticks = '1500', rounds = '3'] = process.argv;
globalThis.importScripts = () => {};
const dir = fileURLToPath(new URL('../out/simbench/', import.meta.url));
const wasm = readFileSync(fileURLToPath(new URL('../../../src/lib/spatial-core-pkg/spatial_core_bg.wasm', import.meta.url)));
const { runBench } = await import(`${dir}simbench.js`);
const r = await runBench({ wasm, ticks: Number(ticks), rounds: Number(rounds), log: (l) => console.log(l) });
const res = { runtime: `node ${process.version} (V8 ${process.versions.v8})`, ...r };
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res.rounds.map((x) => [x.tps.toFixed(1), x.p50.toFixed(3), x.p95.toFixed(3)])));
