// @ts-nocheck
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileRef, newId } from './spool.mjs';
import { stats } from './perflog.mjs';
import {
  getEntry,
  keyedEntry,
  listEntries,
  putBlob,
  putKeyed,
  readBlob,
  withLock
} from './store.mjs';

export const REPO_SLUG = 'bk-bf/Fantasia4x';
export const WORKFLOWS = ['check.yml', 'promote.yml'];
export const PERF_ARTIFACT =
  /^(frame-budget|work-pins-notes|tps-notes|codspeed-counts(-\d+)?|codspeed-legacy-counts|gungraun-flamegraphs|browser-work-pins)$/;
const PERF_STEP =
  /work pins|instruction counts|ticks per second|frame budget|codspeed benchmarks|counts from the profiles|game day|tools\/(work-pins|gungraun|bench)\//i;
const RAN = new Set(['success', 'failure', 'cancelled']);
const RERUN_WINDOW_MS = 7 * 24 * 3600 * 1000;
const TABLE_ROWS = 100;

const STAMP = /^(\u{FEFF})?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z ?/u;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');

export function logLines(text) {
  return text.split('\n').map((l) => l.replace(/\r$/, '').replace(STAMP, '').replace(ANSI, ''));
}

const unwrap = (c) =>
  c
    .trim()
    .replace(/\*\*/g, '')
    .replace(/^`(.*)`$/, '$1');
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(unwrap);

export function num(text) {
  if (text == null) return null;
  const m = /^[+-]?[\d,]*\.?\d+/.exec(String(text).trim());
  return m ? Number(m[0].replace(/,/g, '')) : null;
}

const numList = (text) =>
  String(text ?? '')
    .split(',')
    .map(num)
    .filter((n) => n != null);

export function tablesIn(lines) {
  const out = [];
  let title = null;
  let caption = null;
  let prose = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      title = line.slice(3).trim();
      caption = null;
      prose = null;
      continue;
    }
    if (line.startsWith('### ')) {
      caption = line.slice(4).trim();
      continue;
    }
    const summary = /<summary>(.*?)<\/summary>/.exec(line);
    if (summary) {
      caption = summary[1].trim();
      continue;
    }
    if (line.startsWith('|') && /^\|[-:| ]+\|$/.test((lines[i + 1] ?? '').trim())) {
      const columns = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push(cells(lines[i]));
      i--;
      out.push({ title, caption: caption ?? prose, columns, rows });
      caption = null;
      prose = null;
      continue;
    }
    if (line.trim() && !/^(<|##\[|- )/.test(line)) prose = line.trim();
  }
  return out;
}

const rowObjects = (t) =>
  t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? ''])));

export function stepsIn(lines) {
  const steps = [];
  let step = { cmd: null, env: {}, lines: [] };
  let inGroup = false;
  let inEnv = false;
  for (const line of lines) {
    if (line.startsWith('##[group]Run ')) {
      steps.push(step);
      step = { cmd: line.slice('##[group]Run '.length).trim(), env: {}, lines: [] };
      inGroup = true;
      inEnv = false;
      continue;
    }
    if (inGroup) {
      if (line.startsWith('##[endgroup]')) {
        inGroup = false;
        continue;
      }
      if (/^env:\s*$/.test(line)) {
        inEnv = true;
        continue;
      }
      const kv = /^ {2}([A-Z_][A-Z0-9_]*): (.*)$/.exec(line);
      if (inEnv && kv) {
        step.env[kv[1]] = kv[2].trim();
        continue;
      }
      if (inEnv && !line.startsWith('  ')) inEnv = false;
      continue;
    }
    step.lines.push(line);
  }
  steps.push(step);
  return steps;
}

const GATE_LEGS = { sim: 'work-pins', browser: 'browser-work-pins', day: 'day', tps: 'tps' };

export function stepLeg(step) {
  const cmd = step.cmd ?? '';
  if (/tools\/work-pins\/frame-budget\.mjs/.test(cmd)) return 'frame-budget';
  if (/tools\/gungraun\/gate\.mjs/.test(cmd)) return 'gungraun';
  if (/tools\/bench\/counts\.mjs/.test(cmd)) return 'codspeed';
  if (/tools\/work-pins\/gate\.mjs/.test(cmd)) {
    let leg = /--leg\s+"?(\$?\w+)"?/.exec(cmd)?.[1] ?? 'sim';
    if (leg.startsWith('$')) leg = step.env[leg.slice(1)] ?? '';
    return GATE_LEGS[leg] ?? null;
  }
  return null;
}

const HEADING_LEGS = [
  [/^Ticks per second/, 'tps'],
  [/^Absolute budgets, ticks per second/, 'tps'],
  [/^Absolute budgets, browser frames/, 'frame-budget'],
  [/^Browser work pins/, 'browser-work-pins'],
  [/^Work pins/, 'work-pins']
];

const headingLeg = (title) => HEADING_LEGS.find(([re]) => re.test(title ?? ''))?.[1] ?? null;

export function uploadedArtifacts(lines) {
  const seen = new Map();
  for (const line of lines) {
    const m =
      /^Artifact (\S+) has been successfully uploaded! Final size is (\d+) bytes\. Artifact ID is (\d+)/.exec(
        line
      );
    if (m) seen.set(m[1], { name: m[1], bytes: Number(m[2]), id: Number(m[3]) });
    const put = /^##\[group\]Run gh-issue artifact put (\S+)/.exec(line);
    if (put && !seen.has(put[1])) seen.set(put[1], { name: put[1], bytes: null, id: null });
  }
  return [...seen.values()];
}

function budgets(tables) {
  return tables
    .filter((t) => t.columns.includes('measure') && t.columns.includes('median'))
    .flatMap(rowObjects)
    .map((r) => ({
      scenario: r.scenario || null,
      phase: r.phase || null,
      measure: r.measure,
      runs: numList(r.runs),
      median: num(r.median),
      limit: r.limit || null,
      unit: r.unit || null
    }));
}

function pinRows(t) {
  return rowObjects(t).map((r) => ({
    scenario: r.scenario,
    fn: r.function,
    where: r['file:line'] || '',
    base: num(r.base),
    head: num(r.head)
  }));
}

function workPinsDigest(tables) {
  const pins = tables.filter((t) => t.columns[0] === 'scenario' && t.columns.includes('function'));
  const totals = pins.find((t) => /^Totals/i.test(t.caption ?? ''));
  const over = pins.find((t) => /budget/i.test(t.caption ?? ''));
  const creatures = pins.find((t) => /^Creature cost/i.test(t.caption ?? ''));
  const title = pins[0]?.title ?? tables[0]?.title ?? '';
  return {
    verdict: title || null,
    changed: num(
      /(\d[\d,]*) count\(s\) changed/.exec(title + ' ' + pins.map((t) => t.caption).join(' '))?.[1]
    ),
    totals: totals ? pinRows(totals) : pins.flatMap(pinRows).filter((r) => r.fn === 'all calls'),
    overBudget: over ? pinRows(over) : [],
    ...(creatures ? { creatureCost: pinRows(creatures) } : {}),
    scenarios: [...new Set(pins.flatMap((t) => t.rows.map((r) => r[0])))]
      .filter((x) => x && !x.includes(' / '))
      .sort()
  };
}

function tpsDigest(tables) {
  const cmp = tables.find((t) => t.columns[0] === 'side');
  const side = (name) => {
    const r = cmp?.rows.find((row) => row[0] === name);
    return r ? { runsMs: numList(r[1]), medianMs: num(r[2]), tps: num(r[3]) } : null;
  };
  const floor = budgets(tables).find((b) => b.measure === 'ticks per second');
  return {
    verdict: cmp?.title ?? null,
    compare: cmp
      ? {
          name: /`([^`]+)`/.exec(cmp.caption ?? '')?.[1] ?? null,
          base: side('base'),
          head: side('head')
        }
      : null,
    floor: floor ?? null
  };
}

function codspeedDigest(tables) {
  const t = tables.find((x) => x.columns[0] === 'benchmark');
  if (!t) return { benchmarks: {} };
  const benchmarks = {};
  for (const r of t.rows) {
    benchmarks[r[0]] = {
      instructions: num(r[1]),
      instructionsChange: r[2] || null,
      llMisses: num(r[3]),
      llMissesChange: r[4] || null,
      verdict: r[5] || null
    };
  }
  return { against: t.caption ?? null, benchmarks };
}

const GUNGRAUN_METRICS = {
  Instructions: 'instructions',
  'L1 Hits': 'l1Hits',
  'LL Hits': 'llHits',
  'RAM Hits': 'ramHits',
  'Total read+write': 'totalReadWrite',
  'Estimated Cycles': 'estimatedCycles'
};

export function gungraunDigest(lines) {
  const benches = {};
  const crates = [];
  let mode = null;
  let bench = null;
  for (const line of lines) {
    if (line.startsWith('$ ')) {
      mode = /--save-baseline=base/.test(line)
        ? 'base'
        : /--baseline=base/.test(line)
          ? 'compare'
          : 'head';
      bench = null;
      continue;
    }
    const verdict = /^([\w-]+): (base against head|head only), (.+)$/.exec(line);
    if (verdict) {
      crates.push({
        crate: verdict[1],
        compared: verdict[2] === 'base against head',
        verdict: verdict[3]
      });
      continue;
    }
    if (mode && /^\S+::\S/.test(line)) {
      bench = benches[line.trim()] ??= {};
      continue;
    }
    const metric = /^ {2}([A-Za-z0-9+ ]+?):\s+(\d+)?\|(\d+|N\/A)?/.exec(line);
    if (!bench || !metric || !GUNGRAUN_METRICS[metric[1]]) continue;
    const key = GUNGRAUN_METRICS[metric[1]];
    const first = metric[2] == null ? null : Number(metric[2]);
    const second = metric[3] == null || metric[3] === 'N/A' ? null : Number(metric[3]);
    if (mode === 'base') (bench.base ??= {})[key] = first;
    else {
      (bench.head ??= {})[key] = first;
      if (mode === 'compare' && second != null) (bench.base ??= {})[key] = second;
    }
  }
  return { crates, benches };
}

const keepTable = (t) =>
  t.rows.length > TABLE_ROWS
    ? { title: t.title, caption: t.caption, columns: t.columns, rowCount: t.rows.length }
    : { title: t.title, caption: t.caption, columns: t.columns, rows: t.rows };

const DIGESTS = {
  'work-pins': workPinsDigest,
  'browser-work-pins': workPinsDigest,
  day: workPinsDigest,
  tps: tpsDigest,
  'frame-budget': (tables) => ({ verdict: tables[0]?.title ?? null, budgets: budgets(tables) }),
  codspeed: codspeedDigest
};

export function parseJobLog(text) {
  const lines = logLines(text);
  const legs = {};
  for (const step of stepsIn(lines)) {
    const tables = tablesIn(step.lines);
    const leg = stepLeg(step) ?? headingLeg(tables[0]?.title);
    if (!leg) continue;
    const digest = leg === 'gungraun' ? gungraunDigest(step.lines) : DIGESTS[leg](tables);
    if (leg === 'gungraun' && !Object.keys(digest.benches).length && !digest.crates.length)
      continue;
    if (leg !== 'gungraun' && !tables.length) continue;
    const env = Object.fromEntries(
      Object.entries(step.env).filter(([k]) =>
        ['BASE', 'BASE_BRANCH', 'HEAD_BRANCH', 'LEG', 'BASE_SHA'].includes(k)
      )
    );
    legs[leg] = {
      step: step.cmd,
      ...(Object.keys(env).length ? { env } : {}),
      ...digest,
      tables: tables.map(keepTable)
    };
  }
  return { legs, artifacts: uploadedArtifacts(lines) };
}

const jsonLines = (text) =>
  text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

export function frameBudgetRounds(json) {
  const phases = {};
  for (const round of json.results ?? []) {
    for (const [phase, v] of Object.entries(round)) {
      if (phase === 'round' || !v || typeof v !== 'object') continue;
      const p = (phases[phase] ??= {
        frames: [],
        medianMs: [],
        meanMs: [],
        maxMs: [],
        scriptMedianMs: []
      });
      for (const k of Object.keys(p)) p[k].push(v[k] ?? null);
    }
  }
  return { scenario: json.scenario ?? null, rounds: (json.results ?? []).length, phases };
}

export function parseArtifactFile(artifact, name, data) {
  const text = () => data.toString('utf8');
  if (artifact === 'tps-notes' && name.endsWith('.jsonl'))
    return { leg: 'tps', notes: jsonLines(text()) };
  if (artifact === 'work-pins-notes' && name.endsWith('.jsonl'))
    return { leg: 'work-pins', notes: jsonLines(text()) };
  if (/^codspeed-/.test(artifact) && name.endsWith('.json')) {
    const j = JSON.parse(text());
    return { leg: 'codspeed', countsSha: j.sha ?? null, counts: j.counts ?? null };
  }
  if (artifact === 'frame-budget' && name.endsWith('frame-budget.json'))
    return { leg: 'frame-budget', ...frameBudgetRounds(JSON.parse(text())) };
  return null;
}

const ROLES = [
  [/\.svg$/, 'profile'],
  [/\.log$/, 'log']
];
export const roleOf = (name) => ROLES.find(([re]) => re.test(name))?.[1] ?? 'result';

export function machineOf(job) {
  const runner = job.runner_name ?? '';
  if (!runner) return null;
  if (/^GitHub Actions \d+$/.test(runner) || job.runner_group_name === 'GitHub Actions')
    return 'github';
  const host = /^(.+?)-fantasia4x-\d+$/i.exec(runner)?.[1] ?? runner;
  return host.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

export function executions(jobs) {
  const seen = new Map();
  for (const job of [...jobs].sort((a, b) => a.run_attempt - b.run_attempt || a.id - b.id)) {
    const key = `${job.name}|${job.started_at}|${job.completed_at}|${job.runner_name ?? ''}`;
    if (!seen.has(key)) seen.set(key, job);
  }
  return [...seen.values()];
}

export const measuredSteps = (job) =>
  (job.steps ?? []).filter(
    (s) => PERF_STEP.test(s.name) && !/^install/i.test(s.name) && RAN.has(s.conclusion)
  );

const SCENARIO_OF = {
  'frame-budget': () => ['large-wilderness'],
  'browser-work-pins': () => ['dev-save'],
  day: () => ['dev-save'],
  tps: (leg) => [
    leg.compare?.name?.split(' ')[0] ?? leg.notes?.[0]?.name?.split(' ')[0],
    leg.floor?.scenario
  ],
  'work-pins': (leg) => [
    ...(leg.scenarios ?? []),
    ...(leg.notes ?? []).flatMap((n) => (n.totals ?? []).map((r) => r.scenario))
  ],
  codspeed: (leg) =>
    Object.keys({ ...leg.benchmarks, ...leg.counts }).map(
      (b) => /([\w-]+)\.bench\.ts/.exec(b)?.[1]
    ),
  gungraun: (leg) => leg.crates.map((c) => c.crate)
};

export function scenariosOf(legs) {
  const all = Object.entries(legs).flatMap(([leg, v]) =>
    (SCENARIO_OF[leg]?.(v) ?? []).filter(Boolean)
  );
  return [...new Set(all)].sort();
}

function mergeArtifact(legs, parsed) {
  if (!parsed) return;
  const { leg: name, ...rest } = parsed;
  let leg = name;
  const scenarios = (rest.notes ?? []).flatMap((n) => (n.totals ?? []).map((t) => t.scenario));
  if (name === 'work-pins' && scenarios.length && scenarios.every((s) => /^browser /.test(s)))
    leg = 'browser-work-pins';
  const into = (legs[leg] ??= { step: null, tables: [] });
  if (rest.notes) into.notes = [...(into.notes ?? []), ...rest.notes];
  else Object.assign(into, rest);
}

export function ghApi(counter = { calls: 0 }) {
  const gh = (args, opts = {}) => {
    const r = spawnSync('timeout', ['5m', 'gh', 'api', ...args], {
      encoding: opts.binary ? 'buffer' : 'utf8',
      maxBuffer: 2 ** 30,
      ...(opts.stdout ? { stdio: ['ignore', opts.stdout, 'pipe'] } : {})
    });
    return { status: r.status, stdout: r.stdout, stderr: String(r.stderr ?? '') };
  };
  const counted = (args, opts) => {
    counter.calls++;
    return gh(args, opts);
  };
  const statusOf = (stderr) => Number(/HTTP (\d{3})/.exec(stderr)?.[1] ?? 0) || null;
  return {
    counter,
    remaining() {
      const r = gh(['rate_limit', '--jq', '.resources.core.remaining']);
      return r.status === 0 ? Number(r.stdout.trim()) : 0;
    },
    json(path) {
      const r = counted([path]);
      if (r.status !== 0)
        return { error: statusOf(r.stderr) ?? 'failed', message: r.stderr.trim().slice(0, 200) };
      return { data: JSON.parse(r.stdout) };
    },
    text(path) {
      const r = counted(['--allow-escape-sequences', path]);
      if (r.status !== 0)
        return { error: statusOf(r.stderr) ?? 'failed', message: r.stderr.trim().slice(0, 200) };
      return { data: r.stdout };
    },
    download(path, file) {
      const fd = openSync(file, 'w');
      try {
        const r = counted([path], { stdout: fd });
        if (r.status !== 0)
          return { error: statusOf(r.stderr) ?? 'failed', message: r.stderr.trim().slice(0, 200) };
        return { data: file };
      } finally {
        closeSync(fd);
      }
    }
  };
}

function cursorPath(root) {
  return join(root, 'ci', 'cursor.json');
}

export function readCursor(root) {
  const p = cursorPath(root);
  const empty = { v: 1, workflows: {}, runs: {} };
  if (!existsSync(p)) return empty;
  return { ...empty, ...JSON.parse(readFileSync(p, 'utf8')) };
}

export function writeCursor(root, cursor) {
  const p = cursorPath(root);
  mkdirSync(join(root, 'ci'), { recursive: true });
  writeFileSync(`${p}.tmp-${process.pid}`, JSON.stringify(cursor) + '\n');
  renameSync(`${p}.tmp-${process.pid}`, p);
}

function listRuns(api, workflow, since) {
  const runs = [];
  for (let page = 1; ; page++) {
    const q = `repos/${REPO_SLUG}/actions/workflows/${workflow}/runs?per_page=100&page=${page}${since ? `&created=%3E%3D${since}` : ''}`;
    const r = api.json(q);
    if (r.error)
      return { error: `${workflow} runs page ${page}: ${r.error} ${r.message ?? ''}`.trim(), runs };
    const items = r.data.workflow_runs ?? [];
    const batch = items
      .filter((w) => w.status === 'completed')
      .map((w) => ({
        id: w.id,
        run_attempt: w.run_attempt,
        run_number: w.run_number,
        event: w.event,
        conclusion: w.conclusion,
        head_branch: w.head_branch,
        head_sha: w.head_sha,
        created_at: w.created_at,
        html_url: w.html_url,
        pull_requests: (w.pull_requests ?? []).map((p) => ({
          number: p.number,
          base: p.base?.ref ?? null
        }))
      }));
    runs.push(...batch);
    if (items.length < 100 || page * 100 >= (r.data.total_count ?? 0)) return { runs };
  }
}

function listJobs(api, runId) {
  const jobs = [];
  for (let page = 1; ; page++) {
    const r = api.json(
      `repos/${REPO_SLUG}/actions/runs/${runId}/jobs?filter=all&per_page=100&page=${page}`
    );
    if (r.error) return { error: `${r.error}`, jobs };
    jobs.push(...(r.data.jobs ?? []));
    if ((r.data.jobs ?? []).length < 100 || jobs.length >= (r.data.total_count ?? 0))
      return { jobs };
  }
}

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

export function localArtifactsDir(env = process.env) {
  return (
    env.F4X_CI_ARTIFACTS ||
    join(homedir(), 'Documents', 'Projects', 'Fantasia4x', '.ci', 'artifacts')
  );
}

function artifactFiles(api, root, runId, artifact, scratch, localDir) {
  const local = join(localDir, String(runId), artifact.name);
  if (existsSync(local))
    return {
      files: [...walk(local)].map((p) => ({ name: relative(local, p), data: readFileSync(p) }))
    };
  if (!artifact.id) return { gone: true };
  const zip = join(scratch, `${artifact.id}.zip`);
  const r = api.download(`repos/${REPO_SLUG}/actions/artifacts/${artifact.id}/zip`, zip);
  if (r.error)
    return r.error === 404 || r.error === 410
      ? { gone: true }
      : { error: `${artifact.name}: ${r.error}` };
  const out = join(scratch, String(artifact.id));
  mkdirSync(out, { recursive: true });
  const u = spawnSync('unzip', ['-q', '-o', zip, '-d', out], { encoding: 'utf8' });
  if (u.status !== 0) return { error: `${artifact.name}: unzip exit ${u.status}` };
  return { files: [...walk(out)].map((p) => ({ name: relative(out, p), data: readFileSync(p) })) };
}

export function jobKey(run, job) {
  return `ci|${REPO_SLUG}|${run.id}|${job.id}`;
}

export function ciEntry({ run, job, workflow, legs, files, invalid, root }) {
  const machine = machineOf(job);
  const tools = Object.keys(legs).sort();
  const floor = legs.tps?.floor;
  const pr = run.pull_requests?.[0] ?? null;
  return {
    v: 1,
    id: newId(machine, job.started_at, jobKey(run, job)),
    kind: 'ci',
    at: job.started_at,
    recordedAt: new Date().toISOString(),
    launchedBy: {
      who: 'ci',
      session: null,
      thread: null,
      ciRunId: run.id,
      ciJob: job.name,
      ciAttempt: job.run_attempt
    },
    machine,
    branch: run.head_branch ?? null,
    commit: run.head_sha ?? null,
    dirty: 0,
    refs: run.event === 'pull_request' && pr ? `refs/pull/${pr.number}/merge` : null,
    tool: tools.join(','),
    scenario: scenariosOf(legs).join(',') || null,
    world: { save: null },
    perf: { ...(floor?.runs?.length ? { tps: stats(floor.runs) } : {}), legs },
    files: files.map((f) => fileRef(f.role, f.name, f.sha, root)),
    ci: {
      repo: REPO_SLUG,
      workflow,
      event: run.event,
      runNumber: run.run_number,
      runUrl: run.html_url,
      jobId: job.id,
      jobUrl: job.html_url ?? null,
      runner: job.runner_name ?? null,
      conclusion: job.conclusion,
      completedAt: job.completed_at ?? null,
      pullRequest: pr
    },
    parent: null,
    note:
      run.event === 'pull_request'
        ? 'pull_request runs measure the merge of the branch into its base'
        : '',
    ...(invalid.length ? { invalid } : {})
  };
}

function previousEntry(ctx, run, job) {
  if (!ctx.previous) return null;
  const id = keyedEntry(ctx.previous, jobKey(run, job));
  return id ? getEntry(ctx.previous, id) : null;
}

const previousFiles = (ctx, prev, test) =>
  (prev?.files ?? [])
    .filter((f) => test(f))
    .map((f) => ({ ...f, data: readBlob(ctx.previous, f.sha256) }));

function jobLog(api, ctx, job, prev, report) {
  const log = api.text(`repos/${REPO_SLUG}/actions/jobs/${job.id}/logs`);
  if (!log.error) return { text: log.data };
  if (log.error !== 404 && log.error !== 410) return { retry: `job ${job.id} log: ${log.error}` };
  const kept = previousFiles(ctx, prev, (f) => f.role === 'log' && f.name.endsWith('.log.gz'))[0];
  if (!kept) return { gone: true };
  report.restored++;
  return { text: gunzipSync(kept.data).toString('utf8') };
}

function ingestJob(api, root, ctx, run, job, report) {
  const prev = previousEntry(ctx, run, job);
  const log = jobLog(api, ctx, job, prev, report);
  if (log.retry) return log;
  const files = [];
  let parsed = { legs: {}, artifacts: [] };
  const invalid = [];
  if (log.gone) invalid.push('job log expired');
  else {
    parsed = parseJobLog(log.text);
    files.push({
      role: 'log',
      name: `${job.name}.log.gz`,
      sha: putBlob(root, gzipSync(Buffer.from(log.text)))
    });
  }
  const wanted = parsed.artifacts.filter((a) => PERF_ARTIFACT.test(a.name));
  let expired = false;
  for (const artifact of wanted) {
    let got = artifactFiles(api, root, run.id, artifact, ctx.scratch, ctx.localDir);
    if (got.error) return { retry: `run ${run.id} ${got.error}` };
    if (got.gone) {
      const prefix = `${artifact.name}/`;
      const kept = previousFiles(ctx, prev, (f) => f.name.startsWith(prefix));
      if (!kept.length) {
        expired = true;
        continue;
      }
      report.restored++;
      got = { files: kept.map((f) => ({ name: f.name.slice(prefix.length), data: f.data })) };
    }
    for (const f of got.files) {
      const name = `${artifact.name}/${f.name}`;
      files.push({ role: roleOf(f.name), name, sha: putBlob(root, f.data) });
      try {
        mergeArtifact(parsed.legs, parseArtifactFile(artifact.name, f.name, f.data));
      } catch (err) {
        report.errors.push(`run ${run.id} ${name}: ${err.message}`);
      }
    }
  }
  if (expired) invalid.push('artifacts expired');
  if (!Object.keys(parsed.legs).length && prev) return carry(root, ctx, prev, report);
  if (!Object.keys(parsed.legs).length)
    return { skip: log.gone ? 'log and artifacts expired' : 'no perf numbers in the log' };
  const entry = ciEntry({
    run,
    job,
    workflow: ctx.workflow,
    legs: parsed.legs,
    files,
    invalid,
    root
  });
  const r = putKeyed(root, jobKey(run, job), entry);
  return { created: r.created, expired };
}

export const keyOfEntry = (e) =>
  `ci|${e.ci?.repo ?? REPO_SLUG}|${e.launchedBy.ciRunId}|${e.ci?.jobId}`;

function carry(root, ctx, prev, report) {
  for (const f of prev.files ?? []) putBlob(root, readBlob(ctx.previous, f.sha256));
  const r = putKeyed(root, keyOfEntry(prev), prev);
  if (r.created) report.carried++;
  return {};
}

function carryRest(root, ctx, report) {
  for (const prev of listEntries(ctx.previous, { kind: 'ci' })) {
    if (prev.launchedBy?.ciRunId == null || prev.ci?.jobId == null) continue;
    if (!keyedEntry(root, keyOfEntry(prev))) carry(root, ctx, prev, report);
  }
}

function ingestRun(api, root, ctx, run, done, report) {
  const listed = listJobs(api, run.id);
  if (listed.error) return { retry: `run ${run.id} jobs: ${listed.error}` };
  for (const job of executions(listed.jobs)) {
    if (job.run_attempt <= done || !machineOf(job) || !measuredSteps(job).length) continue;
    if (keyedEntry(root, jobKey(run, job))) {
      report.known++;
      continue;
    }
    const r = ingestJob(api, root, ctx, run, job, report);
    if (r.retry) return r;
    if (r.skip) report.skipped[r.skip] = (report.skipped[r.skip] ?? 0) + 1;
    if (r.created) report.entries++;
    if (r.expired) report.expired++;
  }
  return {};
}

const sinceOf = (state) =>
  state?.complete && state.newest
    ? new Date(Date.parse(state.newest) - RERUN_WINDOW_MS).toISOString().slice(0, 19) + 'Z'
    : null;

export function ingestCI(root, opts = {}) {
  return withLock(root, () => ingest(root, opts));
}

async function ingest(root, opts = {}) {
  const env = opts.env ?? process.env;
  const api = opts.api ?? ghApi();
  const floor = Number(opts.floor ?? env.F4X_LEDGER_CI_FLOOR ?? 1500);
  const maxCalls = Number(opts.maxCalls ?? env.F4X_LEDGER_CI_MAX_CALLS ?? 600);
  const perRun = 12;
  const report = {
    runs: 0,
    entries: 0,
    known: 0,
    expired: 0,
    restored: 0,
    carried: 0,
    skipped: {},
    calls: 0,
    stopped: null,
    errors: [],
    oldest: null,
    newest: null
  };
  const previous = opts.previous ?? env.F4X_LEDGER_PREVIOUS ?? null;
  const startCalls = api.counter?.calls ?? 0;
  const used = () => (api.counter?.calls ?? 0) - startCalls;
  mkdirSync(join(root, 'ci'), { recursive: true });
  const scratch = mkdtempSync(join(root, 'ci', 'incoming-'));
  const cursor = readCursor(root);
  try {
    outer: for (const workflow of opts.workflows ?? WORKFLOWS) {
      const state = (cursor.workflows[workflow] ??= { complete: false, newest: null });
      if (api.remaining() - perRun < floor) {
        report.stopped = `REST budget at the floor of ${floor}`;
        break;
      }
      const listed = listRuns(api, workflow, sinceOf(state));
      if (listed.error) {
        report.errors.push(listed.error);
        continue;
      }
      const todo = listed.runs.filter((r) => (cursor.runs[r.id]?.attempt ?? 0) < r.run_attempt);
      const ctx = {
        workflow,
        scratch,
        previous,
        localDir: opts.localDir ?? localArtifactsDir(env)
      };
      let finished = true;
      for (const run of todo) {
        if (used() + perRun > maxCalls) {
          report.stopped = `the ${maxCalls}-call cap for one sync`;
          finished = false;
          break outer;
        }
        if (api.remaining() - perRun < floor) {
          report.stopped = `REST budget at the floor of ${floor}`;
          finished = false;
          break outer;
        }
        const r = ingestRun(api, root, ctx, run, cursor.runs[run.id]?.attempt ?? 0, report);
        if (r.retry) {
          report.errors.push(r.retry);
          finished = false;
          continue;
        }
        cursor.runs[run.id] = { attempt: run.run_attempt, workflow, at: run.created_at };
        report.runs++;
        if (!report.oldest || run.created_at < report.oldest) report.oldest = run.created_at;
        if (!report.newest || run.created_at > report.newest) report.newest = run.created_at;
        writeCursor(root, cursor);
      }
      const newest =
        listed.runs
          .map((r) => r.created_at)
          .sort()
          .at(-1) ?? state.newest;
      if (finished)
        cursor.workflows[workflow] = {
          complete: true,
          newest: [state.newest, newest].filter(Boolean).sort().at(-1) ?? null
        };
      writeCursor(root, cursor);
    }
    const all = opts.workflows ?? WORKFLOWS;
    if (previous && !report.stopped && all.every((w) => cursor.workflows[w]?.complete))
      carryRest(root, { previous }, report);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  report.calls = used();
  return report;
}
