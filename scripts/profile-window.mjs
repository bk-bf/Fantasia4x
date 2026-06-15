#!/usr/bin/env node
/**
 * profile-window.mjs — split the sim-worker JS self-time into an EARLY (startup) window vs the
 * STEADY-state remainder, to isolate the startup-cluster cost (ENGINE-PERFORMANCE startup ramp).
 *
 *   node scripts/profile-window.mjs [file.json] [earlySeconds=6] [topN=20]
 *
 * Functions ranked HIGH in EARLY but low in STEADY are the startup-specific hotspots.
 */
import fs from 'node:fs';
import path from 'node:path';

const DEBUG = path.resolve(import.meta.dirname, '../.debug');
const SIM_MARKERS = ['processGameTurn', 'stepEntities', 'tickPawn', 'evaluateFormula'];

const args = process.argv.slice(2);
function newest() {
  const c = fs
    .readdirSync(DEBUG)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, m: fs.statSync(path.join(DEBUG, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!c.length) throw new Error(`no profile .json in ${DEBUG}`);
  return path.join(DEBUG, c[0].f);
}
const file = args.find((a) => a.endsWith('.json')) ?? newest();
const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
const earlySec = nums[0] ?? 6;
const topN = nums[1] ?? 20;

const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const { stackTable: ST, frameTable: FT, funcTable: FN, stringArray: SA } = p.shared;
const isJS = FN.isJS;
const nameOf = (fn) => SA[FN.name[fn]] ?? '?';

/** deepest-JS-frame self-time, restricted to samples with t0 <= time < t1 */
function jsSelfWindow(thread, t0, t1) {
  const S = thread.samples;
  const time = S.time;
  const self = new Map();
  let total = 0;
  for (let i = 0; i < S.length; i++) {
    const t = time ? time[i] : i * (p.meta?.interval ?? 1);
    if (t < t0 || t >= t1) continue;
    let cur = S.stack[i];
    if (cur == null) continue;
    total++;
    let found = -1;
    while (cur != null) {
      const fn = FT.func[ST.frame[cur]];
      if (isJS[fn]) {
        found = fn;
        break;
      }
      cur = ST.prefix[cur];
    }
    if (found >= 0) self.set(found, (self.get(found) || 0) + 1);
  }
  return { self, total };
}

function topRows({ self, total }) {
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([fn, w]) => [nameOf(fn).slice(0, 38), ((100 * w) / (total || 1)).toFixed(1)]);
}

// Pick the busiest DOM Worker whose ACTUALLY-SAMPLED functions include a sim marker (the shared
// funcTable contains every function, so it can't be used to identify the thread).
let sim = null;
let bestActive = -1;
for (const t of p.threads) {
  if (t.name !== 'DOM Worker') continue;
  const { self, total } = jsSelfWindow(t, -Infinity, Infinity);
  if (total < 50) continue;
  const names = new Set([...self.keys()].map(nameOf));
  if (SIM_MARKERS.some((m) => names.has(m)) && total > bestActive) {
    bestActive = total;
    sim = t;
  }
}
if (!sim) throw new Error('no sim worker thread found');

const time = sim.samples.time;
const tStart = time ? time[0] : 0;
const tEnd = time ? time[sim.samples.length - 1] : sim.samples.length * (p.meta?.interval ?? 1);
const split = tStart + earlySec * 1000;

const early = jsSelfWindow(sim, tStart, split);
const steady = jsSelfWindow(sim, split, tEnd + 1);

console.log(`profile: ${path.basename(file)}`);
console.log(
  `sim worker span ${((tEnd - tStart) / 1000).toFixed(1)}s · EARLY=first ${earlySec}s (${early.total} samples) · STEADY=rest (${steady.total} samples)\n`
);

const er = topRows(early);
const sr = topRows(steady);
const steadyPct = new Map(sr.map(([n, v]) => [n, v]));
console.log('  EARLY (startup window)            │  STEADY (rest)');
console.log('  ─────────────────────────────────┼───────────────────────────────');
for (let i = 0; i < Math.max(er.length, sr.length); i++) {
  const e = er[i] ? `${er[i][1].padStart(5)}% ${er[i][0].padEnd(26)}` : ''.padEnd(33);
  const s = sr[i] ? `${sr[i][1].padStart(5)}% ${sr[i][0]}` : '';
  console.log(`  ${e}│  ${s}`);
}
console.log('\n── functions much HOTTER in startup than steady (Δ ≥ 1.5%) ──');
for (const [n, v] of er) {
  const sv = parseFloat(steadyPct.get(n) ?? '0');
  const d = parseFloat(v) - sv;
  if (d >= 1.5) console.log(`  +${d.toFixed(1)}%  ${n}  (early ${v}% vs steady ${sv}%)`);
}

// Raw DEEPEST-leaf frames (incl. native/GC/wasm) for the early window — reveals where the non-JS
// startup time actually goes (GC pauses, wasm pathfinding, structured-clone, scene setup).
function leafFrames(thread, t0, t1) {
  const S = thread.samples;
  const time = S.time;
  const tally = new Map();
  let n = 0;
  for (let i = 0; i < S.length; i++) {
    const t = time ? time[i] : i;
    if (t < t0 || t >= t1) continue;
    const cur = S.stack[i];
    if (cur == null) {
      tally.set('(no stack)', (tally.get('(no stack)') || 0) + 1);
      n++;
      continue;
    }
    const fn = FT.func[ST.frame[cur]];
    const nm = (SA[FN.name[fn]] ?? '?') + (isJS[fn] ? '' : ' [native]');
    tally.set(nm, (tally.get(nm) || 0) + 1);
    n++;
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => [k, ((100 * v) / n).toFixed(1)]);
}
const t0 = sim.samples.time ? sim.samples.time[0] : 0;
console.log(`\n── top DEEPEST leaf frames in first ${earlySec}s (native/GC/wasm visible) ──`);
for (const [k, v] of leafFrames(sim, t0, t0 + earlySec * 1000))
  console.log(`  ${v.padStart(5)}%  ${k.slice(0, 50)}`);
