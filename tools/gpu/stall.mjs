import { readFileSync } from 'node:fs';

/** @typedef {{ id: number, callFrame: { functionName: string, url: string, lineNumber: number }, children?: number[] }} CpuNode */
/** @typedef {{ nodes: CpuNode[], startTime: number, samples: number[], timeDeltas: number[] }} CpuProfile */

const whole = process.argv.includes('--whole');
const files = process.argv.slice(2).filter((a) => a !== '--whole');
if (!files.length) {
  console.error('usage: node tools/gpu/stall.mjs [--whole] <file.cpuprofile>...');
  process.exit(2);
}

for (const file of files) {
  /** @type {CpuProfile} */
  const p = JSON.parse(readFileSync(file, 'utf8'));
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  /** @type {Map<number, number>} */
  const parent = new Map();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  /** @param {number} id */
  const name = (id) => {
    const cf = /** @type {CpuNode} */ (nodes.get(id)).callFrame;
    return `${cf.functionName || '(anon)'} ${String(cf.url.split('/').pop()).split('?')[0]}:${cf.lineNumber + 1}`;
  };
  /** @param {number} id */
  const idle = (id) => /** @type {CpuNode} */ (nodes.get(id)).callFrame.functionName === '(idle)';
  let t = p.startTime;
  /** @type {[number, number][]} */
  const samples = p.samples.map((s, i) => [(t += p.timeDeltas[i]), s]);
  /** @type {[number, number, number]} */
  let best = [0, 0, 0];
  /** @type {number | null} */
  let start = null;
  samples.forEach(([ts, s], i) => {
    if (!idle(s)) {
      if (start === null) start = i;
    } else if (start !== null) {
      const dur = samples[i - 1][0] - samples[start][0];
      if (dur > best[0]) best = [dur, start, i];
      start = null;
    }
  });
  const [dur, a, b] = whole ? [samples[samples.length - 1][0] - samples[0][0], 0, samples.length] : best;
  /** @type {Map<string, number>} */
  const self = new Map();
  /** @type {Map<string, number>} */
  const incl = new Map();
  /** @param {Map<string, number>} m @param {string} k @param {number} v */
  const add = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v);
  for (let i = a; i < b; i++) {
    const dt = i + 1 < samples.length ? samples[i + 1][0] - samples[i][0] : 0;
    add(self, name(samples[i][1]), dt);
    const seen = new Set();
    for (let x = /** @type {number | undefined} */ (samples[i][1]); x !== undefined; x = parent.get(x)) {
      const n = name(x);
      if (!seen.has(n)) add(incl, n, dt), seen.add(n);
    }
  }
  /** @param {Map<string, number>} m @param {number} n */
  const top = (m, n) =>
    [...m].filter(([k]) => !k.startsWith('(root)')).sort((x, y) => y[1] - x[1]).slice(0, n);
  console.log(`== ${file.split('/').pop()}: ${whole ? "whole profile" : "longest busy stretch"} ${(dur / 1000).toFixed(0)} ms`);
  console.log('  self:');
  for (const [k, v] of top(self, 12)) console.log(`  ${(v / 1000).toFixed(1).padStart(8)} ms  ${k}`);
  console.log('  inclusive:');
  for (const [k, v] of top(incl, 16)) console.log(`  ${(v / 1000).toFixed(1).padStart(8)} ms  ${k}`);
}
