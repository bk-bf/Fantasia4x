#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileRef, gitInfo, launchedBy, machineName, newId, spoolDir, writeBlob, writeEntry } from './spool.mjs';
import { allEntries, getEntry, listEntries, missingBlobs, reindex, storeDir, supersededBy, withLock } from './store.mjs';
import { ingestPerfLog, ingestResult, ingestSave } from './ingest.mjs';
import { assembleSave, resolveSave } from './fetch.mjs';
import { withInvalid } from './invalid.mjs';

/** @typedef {import('./store.mjs').Entry} Entry */
/** @typedef {import('./store.mjs').Stats} Stats */
/** @typedef {import('./store.mjs').StretchEnd} StretchEnd */

/** @type {Record<string, string>} */
const ZONES = { laptop: 'Europe/Berlin', desktop: 'Europe/Berlin', ubuntuserver: 'Etc/UTC' };
const [cmd, ...rest] = process.argv.slice(2);
const root = storeDir();

function remoteHost() {
  if (process.env.F4X_LEDGER_DIR || machineName() === 'ubuntuserver') return null;
  return process.env.F4X_LEDGER_HOST || 'ubuntu';
}

/** @param {string} host @param {string[]} args @param {boolean} [binary] */
function overSsh(host, args, binary = false) {
  const remote = process.env.F4X_LEDGER_REMOTE_CLI || '~/Documents/Projects/Fantasia4x/tools/ledger/cli.mjs';
  const quoted = args.map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ');
  const missing = `no ledger CLI at ${remote} on ${host}; set F4X_LEDGER_REMOTE_CLI to the tools/ledger/cli.mjs of a checkout there that has it`;
  const r = spawnSync(
    'timeout',
    [
      '10m',
      'ssh',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'BatchMode=yes',
      host,
      `test -f ${remote} || { echo '${missing}' >&2; exit 3; }; node ${remote} ${quoted}`
    ],
    { stdio: ['ignore', binary ? 'pipe' : 'inherit', 'inherit'], maxBuffer: 2 ** 31 }
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r.stdout;
}

/** @param {unknown} s @param {number} [n] */
const short = (s, n = 8) => (s ? String(s).slice(0, n) : '-');
/** @param {Stats | null} s */
const fmtStats = (s) => (s ? `${Math.round(s.median)} (p10 ${s.p10 == null ? '-' : Math.round(s.p10)}, n ${s.n ?? '-'})` : '-');

/** @param {Entry} e */
function stretchLines(e) {
  return (e.perf?.stretches ?? []).map((s) => {
    const speeds = Object.entries(s.tps ?? {})
      .map(([sp, st]) => `${sp} ${fmtStats(st)}`)
      .join(', ');
    /** @param {StretchEnd} p */
    const at = (p) => (p.save ? short(p.save, 12) : p.capture ? `cap ${p.capture}` : '-');
    return `    T${s.from.turn ?? '?'} ${at(s.from)} → ${s.to ? `T${s.to.turn} ${at(s.to)}` : 'end'}: ${speeds || 'no running samples'}`;
  });
}

/** @param {Entry} e */
function line(e) {
  /** @type {Partial<import('./store.mjs').World>} */
  const w = e.world ?? {};
  const load = e.host?.load;
  const where = e.branch ?? (e.refs ? e.refs.split(',')[0] : '-');
  const bad = e.invalid?.length ? `INVALID: ${e.invalid.join('; ')}` : '';
  const away = missingBlobs(root, e).length ? `blob on ${e.machine}` : '';
  const tps = e.perf?.tps && !bad ? `tps ${Math.round(e.perf.tps.median)}@${e.perf.speed ?? '?'}` : '';
  const ck = e.perf?.checkpoints?.length ? `${e.perf.checkpoints.length} checkpoints` : '';
  return [
    e.id,
    e.kind,
    where,
    short(e.commit),
    e.tool ?? '-',
    e.scenario ?? '-',
    w.map ?? '-',
    `p${w.pawns ?? '-'} m${w.mobs ?? '-'} T${w.turn ?? '-'}`,
    w.save ? `world ${short(w.save, 12)}` : '',
    tps,
    tps && load ? `load ${Array.isArray(load) ? load[0] : load}` : '',
    ck,
    away,
    bad
  ]
    .filter(Boolean)
    .join('  ');
}

/** @param {string[]} args */
function list(args) {
  const { values } = parseArgs({
    args,
    options: {
      machine: { type: 'string' },
      branch: { type: 'string' },
      commit: { type: 'string' },
      kind: { type: 'string' },
      tool: { type: 'string' },
      scenario: { type: 'string' },
      world: { type: 'string' },
      since: { type: 'string' },
      json: { type: 'boolean' },
      stretches: { type: 'boolean' },
      all: { type: 'boolean' }
    }
  });
  const entries = listEntries(root, values);
  if (values.json) return console.log(JSON.stringify(entries, null, 2));
  for (const e of entries) {
    console.log(line(e));
    if (values.stretches) for (const s of stretchLines(e)) console.log(s);
  }
}

/** @param {string[]} args */
function show([id]) {
  const e = getEntry(root, id);
  console.log(JSON.stringify(e, null, 2));
  const lines = stretchLines(e);
  if (lines.length) console.error(`\nstretches between checkpoints:\n${lines.join('\n')}`);
  const by = supersededBy(allEntries(root)).get(e.id);
  if (by) console.error(`\nsuperseded by ${by}`);
  const children = listEntries(root, {}).filter((c) => c.parent === e.id);
  if (children.length) console.error(`\nlinked back to this entry:\n${children.map((c) => `  ${line(c)}`).join('\n')}`);
}

/** @param {string[]} args */
async function fetch(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { to: { type: 'string' } } });
  const target = positionals[0];
  if (!target) throw new Error('usage: pnpm ledger fetch <entry id|world id> [--to file]');
  const save = resolveSave(root, target);
  for (const file of missingBlobs(root, save)) {
    console.error(`pulling blob ${file.sha256.slice(0, 12)} from the ${save.machine} spool`);
    (await import('./sync.mjs')).fetchBlob(root, save.machine, file.sha256);
  }
  const gz = assembleSave(root, save);
  if (values.to === '-') return process.stdout.write(gz);
  const out = values.to ?? `${(save.world.save ?? save.id).slice(0, 12)}.json.gz`;
  writeFileSync(out, gz);
  console.error(`world ${save.world.save} (entry ${save.id}, turn ${save.world.turn}) written to ${out}`);
}

/** @param {string[]} args */
function record(args) {
  const { values } = parseArgs({
    args,
    options: {
      kind: { type: 'string' },
      tool: { type: 'string' },
      scenario: { type: 'string' },
      result: { type: 'string' },
      file: { type: 'string', multiple: true },
      parent: { type: 'string' },
      world: { type: 'string' },
      note: { type: 'string' },
      at: { type: 'string' }
    }
  });
  if (!values.kind) throw new Error('record needs --kind');
  const dir = spoolDir();
  const raw = values.result ?? '{}';
  /** @type {{ world?: Partial<import('./store.mjs').World>, perf?: import('./store.mjs').Perf, host?: Partial<import('./store.mjs').Host>, [field: string]: unknown }} */
  const result = raw.trim().startsWith('{') ? JSON.parse(raw) : JSON.parse(readFileSync(raw, 'utf8'));
  const files = (values.file ?? []).map((spec) => {
    const eq = spec.indexOf('=');
    if (eq < 1) throw new Error(`--file wants role=path, got ${spec}`);
    const path = spec.slice(eq + 1);
    return fileRef(spec.slice(0, eq), basename(path), writeBlob(path, dir), dir);
  });
  const machine = machineName();
  const at = values.at ?? new Date().toISOString();
  const { world, perf, host, ...restResult } = result;
  const id = writeEntry(
    withInvalid({
      v: 1,
      id: newId(machine, at),
      kind: values.kind,
      at,
      launchedBy: launchedBy(),
      machine,
      ...gitInfo(process.cwd()),
      tool: values.tool ?? null,
      scenario: values.scenario ?? null,
      world: { save: values.world ?? null, ...(world ?? {}) },
      host: { load: null, loadEnd: null, cores: null, others: null, ...(host ?? {}) },
      perf: perf ?? restResult,
      files,
      parent: values.parent ?? null,
      note: values.note ?? ''
    }),
    dir
  );
  console.log(id);
}

/** @param {string} dir @returns {Generator<string>} */
function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      yield* walk(p);
    } else yield p;
  }
}

/** @param {string[]} args */
function importDir(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      machine: { type: 'string' },
      who: { type: 'string' },
      note: { type: 'string' },
      checkout: { type: 'string' },
      commit: { type: 'string' },
      branch: { type: 'string' },
      tz: { type: 'string' },
      tool: { type: 'string' },
      kind: { type: 'string' }
    }
  });
  const dir = resolve(positionals[0] ?? '.');
  if (!values.machine || !['owner', 'agent'].includes(values.who ?? ''))
    throw new Error('usage: pnpm ledger import <dir> --machine M --who owner|agent [--note N]');
  const machine = values.machine;
  const who = values.who;
  const note = values.note ?? '';
  /** @type {Map<string, string[]>} */
  const logs = new Map();
  const counts = { play: 0, save: 0, result: 0, known: 0, open: 0 };
  /** @type {string[]} */
  const skipped = [];
  for (const p of walk(dir)) {
    const name = basename(p);
    if (/^perf\.log(\.|$)/.test(name)) {
      const d = p.slice(0, -name.length);
      logs.set(d, [...(logs.get(d) ?? []), p]);
    } else if (name.endsWith('.json.gz')) {
      const r = ingestSave(root, { machine, who, path: p, note, commit: values.commit ?? null, branch: values.branch ?? null });
      r.created ? counts.save++ : counts.known++;
    } else if (name.endsWith('.json')) {
      let parsed = null;
      try {
        parsed = JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        parsed = null;
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.scenario) {
        const r = ingestResult(root, {
          machine,
          who,
          path: p,
          note,
          commit: values.commit ?? null,
          branch: values.branch ?? null,
          kind: values.kind ?? 'harness',
          tool: values.tool ?? 'tick-harness'
        });
        r.created ? counts.result++ : counts.known++;
      } else skipped.push(relative(dir, p));
    } else skipped.push(relative(dir, p));
  }
  for (const [d, paths] of logs) {
    const r = ingestPerfLog(root, {
      machine,
      who,
      note,
      paths,
      checkout: values.checkout ?? `import:${d}`,
      timeZone: values.tz ?? ZONES[machine]
    });
    counts.play += r.created;
    counts.known += r.known;
    counts.open += r.open;
  }
  console.log(JSON.stringify(counts));
  if (skipped.length) console.log(`not imported:\n  ${skipped.join('\n  ')}`);
}

const host = remoteHost();
try {
  if (cmd === 'list') host ? overSsh(host, ['list', ...rest]) : list(rest);
  else if (cmd === 'show') host ? overSsh(host, ['show', ...rest]) : show(rest);
  else if (cmd === 'fetch') {
    if (!host) await fetch(rest);
    else {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { to: { type: 'string' } } });
      const gz = overSsh(host, ['fetch', positionals[0], '--to', '-'], true);
      const out = values.to ?? `${positionals[0].slice(0, 12)}.json.gz`;
      out === '-' ? process.stdout.write(gz) : writeFileSync(out, gz);
      if (out !== '-') console.error(`written to ${out}`);
    }
  } else if (cmd === 'record') record(rest);
  else if (cmd === 'import') withLock(root, () => importDir(rest));
  else if (cmd === 'supersede') {
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { base: { type: 'string' } } });
    if (!positionals[0]) throw new Error('usage: pnpm ledger supersede <spec.json> [--base dir]');
    const { attribute } = await import('./supersede.mjs');
    const items = JSON.parse(readFileSync(positionals[0], 'utf8'));
    for (const r of attribute(root, items, resolve(values.base ?? '.'))) console.log(`${r.id}${r.supersedes ? ` supersedes ${r.supersedes}` : ''}${r.created ? '' : ' (known)'}`);
  }
  else if (cmd === 'reindex') withLock(root, () => console.log(`${reindex(root)} entries indexed`));
  else if (cmd === 'ingest-raw') await withLock(root, async () => console.log(JSON.stringify((await import('./sync.mjs')).ingestRaw(root))));
  else if (cmd === 'sync') await withLock(root, async () => (await import('./sync.mjs')).sync());
  else if (cmd === 'ci') {
    const { values } = parseArgs({
      args: rest,
      options: { floor: { type: 'string' }, 'max-calls': { type: 'string' }, previous: { type: 'string' } }
    });
    const { ingestCI } = await import('./ci.mjs');
    const opts = { floor: values.floor, maxCalls: values['max-calls'], previous: values.previous };
    console.log(JSON.stringify(await ingestCI(root, opts)));
  }
  else if (cmd === 'rerun') await (await import('./rerun.mjs')).rerunCli(root, rest);
  else {
    console.error('usage: pnpm ledger list|show|fetch|record|import|supersede|reindex|sync|ingest-raw|ci|rerun');
    process.exit(2);
  }
} catch (err) {
  console.error(`ledger ${cmd}: ${/** @type {Error} */ (err).message}`);
  process.exit(1);
}
