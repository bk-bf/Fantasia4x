import { readFileSync } from 'node:fs';
/** @typedef {{ id: number, children?: number[], callFrame: { functionName: string, url: string, lineNumber: number } }} ProfNode */
/** @type {{ nodes: ProfNode[], samples: number[], timeDeltas: number[] }} */
const prof = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const top = Number(process.argv[3] ?? 40);
/** @type {Map<number, ProfNode>} */
const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const within = process.env.WITHIN ?? 'processGameTurn';
const inTick = new Map();
/** @type {(id: number) => boolean} */
const isIn = (id) => {
  if (inTick.has(id)) return inTick.get(id);
  const n = /** @type {ProfNode} */ (nodes.get(id));
  /** @type {boolean} */
  const r = n.callFrame.functionName === within || (parent.has(id) ? isIn(parent.get(id)) : false);
  inTick.set(id, r);
  return r;
};
const self = new Map();
const dts = prof.timeDeltas;
for (let i = 0; i < prof.samples.length; i++) { const id = prof.samples[i]; if (!isIn(id)) continue; self.set(id, (self.get(id) ?? 0) + (dts[i + 1] ?? 0)); }
const total = [...self.values()].reduce((a, b) => a + b, 0);
/** @param {ProfNode} n */
const key = (n) => {
  const cf = n.callFrame;
  const url = cf.url.replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '');
  return `${cf.functionName || '(anon)'} ${url}:${cf.lineNumber + 1}`;
};
const byFn = new Map();
const byFile = new Map();
const cat = new Map();
/** @param {ProfNode} n */
const classify = (n) => {
  const u = n.callFrame.url;
  const f = n.callFrame.functionName;
  if (u.startsWith('wasm://') || /wasm-function/.test(f)) return 'wasm';
  if (/spatial_core\.js|sim_core\.js/.test(u)) return 'wasm-glue';
  if (f === '(garbage collector)') return 'gc';
  if (f === '(program)' || f === '(idle)' || f === '(root)') return f;
  if (u.includes('/src/')) return 'ts';
  if (u === '' ) return 'native/builtin';
  return 'other-js';
};
for (const [id, us] of self) {
  const n = /** @type {ProfNode} */ (nodes.get(id));
  const k = key(n);
  byFn.set(k, (byFn.get(k) ?? 0) + us);
  const file = k.split(' ')[1]?.replace(/:\d+$/, '') ?? '?';
  byFile.set(file, (byFile.get(file) ?? 0) + us);
  const c = classify(n);
  cat.set(c, (cat.get(c) ?? 0) + us);
}
const incl = new Map();
for (const [id, us] of self) {
  const seen = new Set();
  let cur = id;
  while (cur !== undefined) {
    const k = key(/** @type {ProfNode} */ (nodes.get(cur)));
    if (!seen.has(k)) { incl.set(k, (incl.get(k) ?? 0) + us); seen.add(k); }
    cur = parent.get(cur);
  }
}
/** @param {Map<string, number>} m @param {number} n */
const fmt = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `${(us / 1000).toFixed(0).padStart(7)}ms ${((us / total) * 100).toFixed(1).padStart(5)}%  ${k}`).join('\n');
console.log(`total sampled ${(total / 1000).toFixed(0)} ms`);
console.log('\n== category (self)\n' + fmt(cat, 20));
console.log('\n== self by function\n' + fmt(byFn, top));
console.log('\n== self by file\n' + fmt(byFile, 30));
const grep = process.argv[4];
if (grep) console.log(`\n== inclusive matching ${grep}\n` + fmt(new Map([...incl].filter(([k]) => new RegExp(grep).test(k))), 60));
