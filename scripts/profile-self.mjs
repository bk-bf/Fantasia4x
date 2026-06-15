#!/usr/bin/env node
/**
 * profile-self.mjs — headless reader for Firefox Profiler JSON exports (ENGINE-PERFORMANCE).
 *
 * Replaces the in-game `[PROF]`/`profCount` instrumentation (which itself starved perf): record in
 * the Firefox Profiler, "Download" the profile, drop the .json in `.debug/`, then:
 *
 *   node scripts/profile-self.mjs                 # newest .debug/*profile*.json, sim worker
 *   node scripts/profile-self.mjs <file.json>     # a specific export
 *   node scripts/profile-self.mjs <file> 40       # top 40 rows
 *
 * Prints true JS SELF-time per function (each sample attributed to its deepest `isJS` frame, so
 * native/JIT leaves like `fun_b4df0` collapse into the JS function actually running) for every
 * active worker thread, flagging the sim worker (the one running the game tick).
 */
import fs from 'node:fs';
import path from 'node:path';

const DEBUG = path.resolve(import.meta.dirname, '../.debug');
const SIM_MARKERS = ['processGameTurn', 'tickPawn', 'computeCapacities', 'evaluateFormula', 'stepEntities'];

function newestProfile() {
  const cands = fs
    .readdirSync(DEBUG)
    .filter((f) => f.endsWith('.json') || f.includes('profile'))
    .map((f) => ({ f, m: fs.statSync(path.join(DEBUG, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!cands.length) throw new Error(`no profile .json in ${DEBUG}`);
  return path.join(DEBUG, cands[0].f);
}

const file = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : newestProfile();
const topN = Number(process.argv.find((a, i) => i >= 2 && /^\d+$/.test(a))) || 25;

const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const { stackTable: ST, frameTable: FT, funcTable: FN, stringArray: SA } = p.shared;
const isJS = FN.isJS;
const nameOf = (fn) => SA[FN.name[fn]] ?? '?';

function jsSelf(thread) {
  const S = thread.samples;
  const self = new Map();
  let total = 0,
    idle = 0;
  for (let i = 0; i < S.length; i++) {
    let cur = S.stack[i];
    if (cur == null) continue;
    const w = S.weight && S.weight[i] != null ? S.weight[i] : 1;
    total += w;
    let found = -1;
    while (cur != null) {
      const fn = FT.func[ST.frame[cur]];
      if (isJS[fn]) {
        found = fn;
        break;
      }
      cur = ST.prefix[cur];
    }
    if (found < 0) idle += w;
    else self.set(found, (self.get(found) || 0) + w);
  }
  return { self, total, idle };
}

console.log(`profile: ${path.basename(file)}  (interval ${p.meta?.interval}ms, ${p.threads.length} threads)\n`);
for (const t of p.threads) {
  if (t.name !== 'DOM Worker') continue;
  const { self, total, idle } = jsSelf(t);
  const active = total - idle;
  if (active < 50) continue; // skip idle workers
  const names = new Set([...self.keys()].map(nameOf));
  const isSim = SIM_MARKERS.some((m) => names.has(m));
  console.log(
    `── ${isSim ? 'SIM WORKER' : 'worker'} pid=${t.pid} tid=${t.tid} — JS-active ${active}/${total} (${((100 * active) / total).toFixed(0)}%) ──`
  );
  const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
  for (const [fn, w] of rows)
    console.log(`  ${((100 * w) / total).toFixed(1).padStart(5)}%  ${nameOf(fn).slice(0, 60)}`);
  console.log('');
}
