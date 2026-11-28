#!/usr/bin/env node
// @ts-nocheck
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { fileRef, newId, sha256Of } from './spool.mjs';
import { allEntries, keyedEntry, putBlob, putKeyed, storeDir, withLock } from './store.mjs';
import { fullCommit, ingestBench, ingestPerfLog, ingestResult, ingestSave, noHost, nobody, worldIdOf } from './ingest.mjs';

export const DATA = JSON.parse(readFileSync(new URL('./import-2026-11-27.json', import.meta.url), 'utf8'));

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue;
      yield* walk(p);
    } else yield p;
  }
}

const agent = (session) => ({ ...nobody('agent'), session });

export function importFirst(root, from, log = () => {}) {
  const used = new Set();
  const counts = {};
  const bump = (machine, kind, n = 1) => {
    if (n) counts[`${machine} ${kind}`] = (counts[`${machine} ${kind}`] ?? 0) + n;
  };
  const S = DATA.sessions;
  const trees = Object.fromEntries(Object.entries(DATA.trees).map(([k, t]) => [k, { commit: fullCommit(t.commit), branch: t.branch }]));
  const compat = join(from, 'compat-extracted');
  const extracted = join(from, 'ledger-extracted');
  const SN = join(from, 'laptop-snapshots');
  const snapDate = (n) => /<date>(.*?)<\/date>/.exec(readFileSync(join(SN, String(n), 'info.xml'), 'utf8'))[1];

  const worldNotes = new Map();
  const addWorld = (path, fn) => {
    if (!existsSync(path)) throw new Error(`${relative(from, path)} named in import-2026-11-27.json is missing`);
    const id = worldIdOf(readFileSync(path));
    const was = worldNotes.get(id) ?? { notes: [] };
    worldNotes.set(id, fn(was));
  };
  for (const [rel, w] of Object.entries(DATA.writers)) {
    addWorld(join(compat, rel), (was) => ({ ...was, commit: w.commit, notes: [...was.notes, `written by ${w.commit}, matched by ${w.by} (save-compat session ${S.saveCompat})`] }));
  }
  for (const rel of DATA.oldFormat) {
    addWorld(join(compat, rel), (was) => ({
      ...was,
      notes: [...was.notes, 'an old save format: it throws on its first tick on 8623ae45 and 83ca8f15 and runs on bfa96d5d (#454)']
    }));
  }
  const amend = (worldId) => worldNotes.get(worldId) ?? null;

  function perfLogs(machine, dir, checkout, who, note) {
    const paths = readdirSync(dir).filter((n) => /^perf\.log/.test(n)).map((n) => join(dir, n));
    if (!paths.length) return;
    const r = ingestPerfLog(root, { machine, checkout, paths, who, note, timeZone: DATA.zone, now: Date.now() });
    bump(machine, 'play', r.created);
    if (r.open) log(`open sessions left in ${relative(from, dir)}: ${r.open}`);
    paths.forEach((p) => used.add(p));
  }

  function debugBundle(machine, dir, checkout, who, note) {
    const others = readdirSync(dir)
      .map((n) => join(dir, n))
      .filter((p) => statSync(p).isFile() && !/^perf\.log/.test(basename(p)));
    const files = [...others, ...(existsSync(join(dir, 'tilemap')) ? [...walk(join(dir, 'tilemap'))] : [])];
    if (!files.length) return;
    files.forEach((p) => used.add(p));
    const key = `debug-logs|${machine}|${checkout}|${sha256Of(files.map((f) => sha256Of(readFileSync(f))).join(','))}`;
    if (keyedEntry(root, key)) return;
    const at = Math.min(...files.map((p) => statSync(p).mtimeMs));
    const r = putKeyed(root, key, {
      v: 1,
      id: newId(machine, at, key),
      kind: 'play',
      at: null,
      recordedAt: new Date().toISOString(),
      launchedBy: nobody(who),
      machine,
      branch: null,
      commit: null,
      dirty: null,
      refs: null,
      tool: null,
      scenario: null,
      world: { save: null, name: null, turn: null, seed: null, map: null, pawns: null, mobs: null, generatedBy: null, savedBy: null },
      host: noHost(),
      perf: { checkout },
      files: files.map((p) => fileRef('log', relative(dir, p), putBlob(root, p), root)),
      parent: null,
      note
    });
    if (r.created) bump(machine, 'play (debug logs)');
  }

  function saveFile(machine, path, who, note, extra = {}) {
    let m = extra.meta ?? {};
    if (existsSync(`${path}.meta`)) {
      m = JSON.parse(readFileSync(`${path}.meta`, 'utf8')).meta ?? {};
      used.add(`${path}.meta`);
    }
    const r = ingestSave(root, {
      machine,
      who,
      path,
      at: m.savedAt ?? null,
      name: m.cultureName ?? m.raceName ?? null,
      note: [note, m.kind ? `${m.kind} save` : ''].filter(Boolean).join(', '),
      commit: extra.commit ?? null,
      branch: extra.branch ?? null,
      amend
    });
    if (r.created) bump(machine, 'save');
    used.add(path);
    return r;
  }

  perfLogs('laptop', join(from, 'laptop-raw/debug'), DATA.laptopCheckout, 'owner', '');
  perfLogs('laptop', join(from, S.tickHarness, 'laptop'), DATA.laptopCheckout, 'owner', '');
  for (const n of readdirSync(SN).map(Number).sort((a, b) => b - a)) {
    perfLogs('laptop', join(SN, String(n)), DATA.laptopCheckout, 'owner', `recovered from laptop snapper snapshot ${n} (${snapDate(n)} UTC)`);
    used.add(join(SN, String(n), 'info.xml'));
  }
  const state = join(from, 'laptop-raw/debug/checkout-state.txt');
  used.add(state);
  debugBundle('laptop', join(from, 'laptop-raw/debug'), DATA.laptopCheckout, 'owner', `the laptop checkout's other debug logs, copied 2026-11-27 with its HEAD at ${readFileSync(state, 'utf8').trim()}; they span every session in its perf.log`);
  for (const [sub, checkout] of Object.entries(DATA.desktopCheckouts)) {
    const who = sub.startsWith('worktrees/') ? 'agent' : null;
    perfLogs('desktop', join(from, 'desktop-raw/debug', sub), checkout, who, '');
    debugBundle('desktop', join(from, 'desktop-raw/debug', sub), checkout, who, `the other debug logs of ${checkout} on the desktop, copied 2026-11-27`);
  }
  used.add(join(from, 'desktop-raw/listing.txt'));

  const ownerSave = saveFile('laptop', join(from, S.tickHarness, 'laptop/owner-save.json.gz'), 'owner', `copied from the laptop's dev-shell IndexedDB (127.0.0.1:5174) by agent session ${S.tickHarness} with a {v:1} wrapper, then run by its harness`);
  const inputs = {};
  for (const name of ['owner-save.json.gz', 'colony40-dev.json.gz', 'colony40-lo.json.gz']) {
    const tree = name.includes('-dev') ? trees.dev : name.includes('-lo') ? trees.lo : {};
    inputs[name] = saveFile('desktop', join(from, 'desktop-raw/tmp/f4xprof-save', name), 'agent', `/tmp/f4xprof-save on the desktop, the save input of agent session ${S.tickHarness}'s harness`, {
      commit: name.startsWith('colony40') ? tree.commit : null,
      branch: name.startsWith('colony40') ? tree.branch : null
    });
  }
  used.add(join(from, 'desktop-raw/tmp/f4xprof-save/extract-save.mjs'));

  for (const p of walk(compat)) {
    if (!p.endsWith('.json.gz')) continue;
    const rel = relative(compat, p);
    const dir = rel.split('/')[0];
    const index = join(compat, dir, 'index.json');
    const metas = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')).metas ?? {} : {};
    const key = basename(p, '.json.gz');
    const machine = dir.startsWith('colony40') ? 'desktop' : 'laptop';
    const where = /^s(\d+)-127$/.exec(dir) ? `laptop snapper snapshot ${dir.slice(1, -4)}, dev-shell IndexedDB at 127.0.0.1:5174` : dir;
    saveFile(machine, p, machine === 'laptop' ? 'owner' : 'agent', `extracted by save-compat session ${S.saveCompat} from ${where}, IndexedDB key ${key.replace(/^_/, '')}`, {
      meta: metas[`meta:${key}`] ?? {}
    });
    if (existsSync(index)) used.add(index);
  }
  for (const [sub, label] of [
    ['current', (profile) => `read from a copy of the laptop's ${profile} IndexedDB (laptop-raw/config/${profile})`],
    ['630e9adf-idb', (profile) => `read from agent session ${S.tickHarness}'s copy of the laptop's ${profile} IndexedDB`]
  ]) {
    for (const profile of readdirSync(join(extracted, sub)).sort()) {
      for (const f of readdirSync(join(extracted, sub, profile)).filter((n) => n.endsWith('.json.gz')).sort()) {
        saveFile('laptop', join(extracted, sub, profile, f), 'owner', label(profile));
      }
    }
  }
  for (const n of readdirSync(join(extracted, 'snapshots')).map(Number).sort((a, b) => a - b)) {
    for (const profile of readdirSync(join(extracted, 'snapshots', String(n))).sort()) {
      const dir = join(extracted, 'snapshots', String(n), profile);
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.json.gz')).sort()) {
        saveFile('laptop', join(dir, f), 'owner', `recovered from laptop snapper snapshot ${n} (${snapDate(n)} UTC), ${profile} IndexedDB`);
      }
    }
  }
  for (const p of walk(join(from, 'laptop-raw/config'))) used.add(p);
  for (const p of walk(join(from, S.tickHarness, 'laptop/idb'))) used.add(p);
  for (const p of walk(SN)) if (p.includes('-IndexedDB/')) used.add(p);

  function harness(dir, session, treeOf, notePrefix, profiles = {}, source = []) {
    for (const p of walk(dir)) {
      if (!p.endsWith('.json')) continue;
      const rel = relative(dir, p);
      let result;
      try {
        result = JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        continue;
      }
      if (!result || Array.isArray(result) || !result.scenario) continue;
      const tree = treeOf(rel);
      const via = Object.entries(DATA.harnessInputs).find(([part]) => rel.includes(part));
      const input = via ? inputs[via[1]] : result.scenario === 'owner-save' ? ownerSave : null;
      const r = ingestResult(root, {
        machine: 'desktop',
        path: p,
        kind: 'harness',
        tool: 'tick-harness',
        launchedBy: agent(session),
        commit: tree?.commit ?? null,
        branch: tree?.branch ?? null,
        dirty: null,
        worldId: input?.worldId ?? null,
        parent: input?.id ?? null,
        saveWorld: input ? allEntries(root).find((e) => e.id === input.id).world : null,
        files: [
          ...(profiles[rel] ?? []).map((f) => ({ role: f.endsWith('.txt') ? 'log' : 'profile', path: f, name: f.endsWith('.txt') ? basename(f) : `profile/${basename(f)}` })),
          ...source
        ],
        note: `${notePrefix}; ${rel}; the tree carried the uncommitted harness files and engine-instrumentation.diff${tree ? '' : '; tree unknown'}`
      });
      if (r.created) bump('desktop', 'harness');
      used.add(p);
      (profiles[rel] ?? []).forEach((f) => used.add(f));
      source.forEach((f) => used.add(f.path));
    }
  }
  const sources = (dirs) => dirs.flatMap(([base, d]) => [...walk(d)].map((p) => ({ role: 'log', name: `${base}/${relative(d, p)}`, path: p })));
  const treeFromTop = (rel) => trees[rel.split('/')[0]] ?? null;
  const cpuDir = join(from, 'desktop-raw/tmp/f4xprof-cpu');
  const cpu = (n) => readdirSync(join(cpuDir, n)).map((f) => join(cpuDir, n, f));
  const h = join(from, S.tickHarness);
  const prof630 = {
    'lo/cpuprof/owner-save.json': [...cpu('owner-save'), join(h, 'results/lo/cpuprof-summary.txt')],
    'lo/cpuprof/colony-750-40p.json': [...cpu('colony-750-40p'), join(h, 'results/lo/cpuprof-summary.txt')],
    'lo/cpuprof/b100-cpu.json': [...cpu('b100'), join(h, 'results/lo/cpuprof-stress.txt')],
    'lo/cpuprof/e3600-cpu.json': [...cpu('e3600'), join(h, 'results/lo/cpuprof-stress.txt')]
  };
  const src630 = sources([
    ['harness', join(h, 'harness')],
    ['tools', join(h, 'tools')],
    ['harness', join(from, 'desktop-raw/tmp/f4xprof-harness')]
  ]);
  harness(join(h, 'results'), S.tickHarness, treeFromTop, `results of agent session ${S.tickHarness}'s tick harness on the desktop`, prof630, src630);
  harness(join(from, 'desktop-raw/tickprof'), S.tickHarness, treeFromTop, `/tmp/f4xprof tick-harness output on the desktop, agent session ${S.tickHarness}`, prof630, src630);
  const h0 = join(from, S.tickProfile);
  const prof0 = {};
  for (const s of ['dev-save', 'colony-750-40p', 'colony-1060-80p']) {
    const d = join(h0, 'prof', s);
    if (existsSync(d)) prof0[`cpuprof/${s}.json`] = readdirSync(d).map((n) => join(d, n));
  }
  const src0 = [...sources([['harness', join(h0, 'harness')]]), { role: 'log', name: 'run.sh', path: join(h0, 'run.sh') }];
  harness(join(h0, 'out'), S.tickProfile, () => trees.dev, `results of agent session ${S.tickProfile}'s tick harness in /tmp/f4x-tickprof on the desktop, a copy of debug/tick-profile cut from origin/dev`, prof0, src0);

  const toolOf = DATA.benchTools.map(([re, tool]) => [new RegExp(re), tool]);
  function benchDir(dir) {
    const names = readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile());
    for (const name of names.filter((n) => n.endsWith('.json') && !DATA.notResults.includes(n))) {
      const p = join(dir, name);
      try {
        JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        continue;
      }
      const tool = toolOf.find(([re]) => re.test(name))?.[1] ?? null;
      const prefix = name.replace(/(-frame-cost|-results|-steady)?\.json$/, '');
      const siblings = names.filter((n) => n !== name && !n.endsWith('.json') && (n.startsWith(`${prefix}-`) || n.startsWith(`${prefix}.`)));
      const r = ingestBench(root, {
        machine: 'desktop',
        path: p,
        tool,
        who: 'agent',
        siblings: siblings.map((s) => join(dir, s)),
        note: `desktop /tmp/${relative(join(from, 'desktop-raw/tmp'), p)}${tool ? '' : `; the tool is not named, only its directory ${basename(dir)}`}; the output names no commit, so the tree it ran on is unknown; at is the file's modification time`
      });
      if (r.created) bump('desktop', `bench${r.invalid?.length ? ' (invalid)' : ''}`);
      used.add(p);
      siblings.forEach((s) => used.add(join(dir, s)));
    }
  }
  const tmp = join(from, 'desktop-raw/tmp');
  for (const d of readdirSync(tmp).sort()) {
    if (DATA.skipTmp.includes(d)) continue;
    benchDir(join(tmp, d));
    for (const sub of readdirSync(join(tmp, d)).sort()) {
      const p = join(tmp, d, sub);
      if (statSync(p).isDirectory() && sub !== 'node_modules') benchDir(p);
    }
  }

  const skip = ['first-import-tooling'];
  const unattributed = [...walk(from)].filter((p) => !used.has(p) && !skip.includes(relative(from, p).split('/')[0])).map((p) => relative(from, p));
  return { counts, unattributed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { from: { type: 'string' }, out: { type: 'string' } } });
  const root = storeDir();
  const from = values.from ?? join(root, 'import-2026-11-27');
  const { counts, unattributed } = withLock(root, () => importFirst(root, from, console.log));
  console.log(JSON.stringify(counts, null, 1));
  console.log(`unattributed: ${unattributed.length} files`);
  if (values.out) writeFileSync(values.out, unattributed.join('\n') + '\n');
  console.log(`entries in store: ${allEntries(root).length}`);
}
