import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { openSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import { readControl, writeControl, readPace, readPlan, schedule } from './pace.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, '..');
const LEDGER = join(TOOL, '.ledger');
const REPO = process.env.AUDIT_ROOT || join(TOOL, '..', '..');
const RUNNER = join(TOOL, 'run.mjs');
const DB_PATH = process.env.AUDIT_DB || join(LEDGER, 'audit.db');
const REQUEST =
  process.env.AUDIT_REQ ||
  join(homedir(), 'Documents', 'Projects', 'dashboard', '.cache_sources', 'audit-control.json');

const DEFAULTS = { hours: 8, workers: 3, model: 'opus' };
const SETTLE_MS = 60_000;
const FAST_DEATH_MS = 120_000;
const MAX_FAST_DEATHS = 5;
const MIN_HOURS = 0.05;

const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
};

export function runnerPids() {
  try {
    return execFileSync('pgrep', ['-af', 'tools/audit/run.mjs'], { encoding: 'utf8' })
      .split('\n')
      .filter((l) => l.trim() && !l.includes('pgrep'))
      .map((l) => {
        const [pid, ...rest] = l.split(' ');
        return { pid: Number(pid), cmd: rest.join(' ') };
      })
      .filter((p) => Number.isFinite(p.pid) && /(^|\/)node(js)?$/.test(p.cmd.split(' ')[0]));
  } catch {
    return [];
  }
}

export function pendingWork() {
  try {
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    const row = db.prepare("SELECT count(*) AS n FROM work WHERE state='pending'").get();
    db.close();
    return Number(row?.n ?? 0);
  } catch {
    return -1;
  }
}

function settingsFrom(source, fallback) {
  const s = source ?? {};
  return {
    hours: Number(s.hours) > 0 ? Number(s.hours) : fallback.hours,
    workers: Number(s.workers) > 0 ? Number(s.workers) : fallback.workers,
    model: typeof s.model === 'string' && s.model ? s.model : fallback.model
  };
}

function applyRequest(req, now) {
  const control = readControl();
  const patch = {};
  if (req && typeof req === 'object') {
    if ('paused' in req && Boolean(req.paused) !== Boolean(control.paused)) {
      patch.paused = Boolean(req.paused);
      patch.paused_by = req.by || 'dashboard';
      patch.paused_at = patch.paused ? Math.floor(now / 1000) : null;
      patch.reason = patch.paused ? (req.reason ?? null) : null;
      patch.resume_after = patch.paused ? (req.resume_after ?? null) : null;
    }
    for (const key of ['ceiling_pct', 'margin_pct', 'window_batches', 'hours', 'workers', 'model']) {
      if (key in req && req[key] !== control[key]) patch[key] = req[key];
    }
  }
  if (Object.keys(patch).length === 0) return { control, applied: [] };
  return { control: writeControl(patch), applied: Object.keys(patch) };
}

function openWindow(settings, now, opened_by) {
  const held = readControl();
  const s = settingsFrom(settings, settingsFrom(held, DEFAULTS));
  return writeControl({
    run: {
      ...s,
      opened_by,
      opened_at: now,
      until: now + s.hours * 3600_000,
      launched_at: null,
      launched_pid: null,
      fast_deaths: 0,
      stopped: null
    }
  });
}

function claudeEnv() {
  const local = join(homedir(), '.local', 'bin');
  const resolved =
    process.env.AUDIT_CLAUDE ||
    (existsSync(join(local, 'claude')) ? join(local, 'claude') : 'claude');
  return {
    AUDIT_CLAUDE: resolved,
    PATH: `${local}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`
  };
}

const RUN_UNIT = 'fantasia-audit-run';

function runnerArgs({ hours, workers, model, dry }, runId) {
  return [
    RUNNER,
    '--workers', String(workers),
    '--hours', String(hours),
    '--model', model,
    '--run', runId,
    ...(dry ? ['--dry-run'] : [])
  ];
}

function launch({ hours, workers, model, dry }, now) {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  const runId = `dashboard-${stamp}`;
  const log = join(LEDGER, `${runId}.log`);
  const env = claudeEnv();
  const args = runnerArgs({ hours, workers, model, dry }, runId);

  if (process.env.XDG_RUNTIME_DIR) {
    const r = spawnSync(
      'systemd-run',
      [
        '--user', '--collect', `--unit=${RUN_UNIT}`,
        `--description=Fantasia4x audit run ${runId}`,
        `--working-directory=${REPO}`,
        `--setenv=AUDIT_CLAUDE=${env.AUDIT_CLAUDE}`,
        `--setenv=PATH=${env.PATH}`,
        process.execPath,
        ...args
      ],
      { encoding: 'utf8' }
    );
    if (r.status === 0) return { unit: `${RUN_UNIT}.service`, log, runId };
    return { error: `systemd-run: ${(r.stderr || r.error?.message || '').trim().slice(0, 200)}`, log, runId };
  }

  const fd = openSync(log, 'a');
  const child = spawn(process.execPath, args, {
    cwd: REPO,
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, ...env }
  });
  child.unref();
  return { pid: child.pid, log, runId };
}

export function decide(now, pids = runnerPids()) {
  const control = readControl();
  const run = control.run;
  if (pids.length) return { launch: false, state: 'running', why: `${pids.length} runner alive` };
  if (control.paused) {
    return { launch: false, state: 'paused', why: control.reason || 'paused from the dashboard' };
  }
  if (!run || !run.until) {
    return { launch: false, state: 'no window', why: 'no run window is open — press Resume' };
  }
  if (run.stopped) return { launch: false, state: 'stopped', why: run.stopped };
  if (run.until <= now) {
    return { launch: false, state: 'window closed', why: `the ${run.hours}h run window has closed` };
  }
  const pending = pendingWork();
  if (pending === 0) return { launch: false, state: 'complete', why: 'no pending work is left' };
  if (pending < 0) return { launch: false, state: 'no ledger', why: 'the ledger could not be read' };
  if (run.launched_at && now - run.launched_at < SETTLE_MS) {
    return { launch: false, state: 'settling', why: 'a runner was just launched' };
  }
  return {
    launch: true,
    state: 'launch',
    why: 'unpaused, inside the run window, with work pending',
    hours: Math.max(MIN_HOURS, (run.until - now) / 3600_000),
    workers: run.workers,
    model: run.model,
    dry: Boolean(run.dry)
  };
}

export async function tick(now = Date.now()) {
  const req = readJson(REQUEST, null);
  const { control: afterRequest, applied } = applyRequest(req, now);

  const start = req?.start_request;
  const seen = readJson(join(LEDGER, 'last-start.json'), {});
  let control = afterRequest;
  let opened = null;

  if (start?.ts && start.ts !== seen.ts) {
    control = openWindow(start, now, 'start button');
    opened = 'start';
    writeFileSync(join(LEDGER, 'last-start.json'), JSON.stringify({ ts: start.ts }));
  } else if (applied.includes('paused') && control.paused === false) {
    const run = control.run;
    if (!run?.until || run.until <= now || run.stopped) {
      control = openWindow(run ?? start, now, 'resume button');
      opened = 'resume';
    } else {
      control = writeControl({ run: { ...run, fast_deaths: 0, stopped: null } });
    }
  }

  const pids = runnerPids();
  const decision = decide(now, pids);
  let launched = null;

  if (decision.launch) {
    const run = readControl().run;
    const died = run.launched_at && now - run.launched_at < FAST_DEATH_MS;
    const fastDeaths = died ? (run.fast_deaths ?? 0) + 1 : 0;
    if (fastDeaths >= MAX_FAST_DEATHS) {
      control = writeControl({
        run: { ...run, fast_deaths: fastDeaths, stopped: `the runner exited immediately ${fastDeaths} times` }
      });
      decision.launch = false;
      decision.state = 'stopped';
      decision.why = control.run.stopped;
    } else {
      launched = launch(decision, now);
      control = writeControl({
        run: {
          ...run,
          fast_deaths: fastDeaths,
          launched_at: now,
          launched_pid: launched.pid ?? null,
          launched_unit: launched.unit ?? null,
          launch_error: launched.error ?? null,
          stopped: launched.error ? `could not launch: ${launched.error}` : null
        }
      });
    }
  } else {
    control = readControl();
  }

  const plan = await readPlan(control.plan_url);
  const sched = schedule(plan, control, now);
  return {
    ts: now,
    applied,
    opened,
    decision,
    launched,
    control,
    plan: plan
      ? {
          pct: plan.pct,
          resets_at: plan.resetsAt ? plan.resetsAt / 1000 : null,
          target: sched.target ?? null,
          ceiling: sched.ceiling ?? null,
          stale: plan.stale ?? null
        }
      : null,
    schedule: sched,
    batches_in_window: readPace().batches.length,
    pids: launched ? runnerPids() : pids,
    pending: pendingWork()
  };
}
