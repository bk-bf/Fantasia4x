import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/** @param {number} x @param {number} [d] */
const f = (x, d = 3) => (typeof x === 'number' ? x.toFixed(d) : String(x));

/** @param {Record<string, any>} r */
const head = (r) =>
  `${r.scenario} ${r.branch}@${String(r.commit).slice(0, 8)}${r.dirty ? '+dirty' : ''} turn ${r.turn} seed ${r.seed} map ${r.map} pawns ${r.pawns} mobs ${r.mobs}`;

/** @param {Record<string, any>} r */
function loop(r) {
  const log = r.workerTpsLog;
  const phases = Object.entries(r.phaseMsPerTick)
    .slice(0, 14)
    .map(([k, v]) => `${k} ${f(v)} ${f((100 * v) / r.tickMsMean, 0)}%`);
  return [
    `  TPS ${f(r.tps, 1)} of ${r.targetTps}, tick ${f(r.tickMsMean)} ms, busy ${f(r.busyShare, 2)}, gc ${f(100 * r.gc.share, 2)}%, clone ${f(r.posts.cloneMs / Math.max(1, r.ticks))} ms/tick, worker tps= lines ${log.n} mean ${f(log.mean, 0)}`,
    `  ${phases.join(', ')}`
  ];
}

/** @param {Record<string, any>} r */
function tick(r) {
  const t = r.tick;
  const phases = r.phases.slice(0, 14).map((/** @type {any} */ p) => `${p.label} ${f(p.mean)} ${f(100 * p.share, 0)}%`);
  const wasm = Object.entries(r.wasm)
    .sort((a, b) => b[1].msPerTick - a[1].msPerTick)
    .slice(0, 3)
    .map(([k, v]) => `${k} ${f(v.msPerTick)} ms ${f(v.callsPerTick, 1)}/tick`);
  return [
    `  tick mean ${f(t.mean)} p50 ${f(t.p50)} p95 ${f(t.p95)} max ${f(t.max, 1)}, uncapped ${f(r.uncappedTps, 0)} TPS, gc ${f(100 * r.gc.share, 2)}%`,
    `  ${phases.join(', ')}`,
    `  wasm: ${wasm.join(', ')}`
  ];
}

for (const file of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(file, 'utf8'));
  console.log([`${basename(file)}: ${head(r)}`, ...('tps' in r ? loop(r) : tick(r))].join('\n'));
}
