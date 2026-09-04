import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEDGER = join(HERE, '..', '.ledger');
const CONTROL = join(LEDGER, 'control.json');
const PACE = join(LEDGER, 'pace.json');

export const WINDOW_MS = 5 * 3600_000;

const DEFAULT_CONTROL = {
  paused: false,
  paused_by: null,
  paused_at: null,
  reason: null,
  resume_after: null,
  ceiling_pct: 95,
  poll_seconds: 60,
  plan_url: 'https://dashboard.callmedaddy.dedyn.io/api/plan'
};

function readJson(path, fallback) {
  try {
    return { ...fallback, ...JSON.parse(readFileSync(path, 'utf8')) };
  } catch {
    return { ...fallback };
  }
}

export const readControl = () => readJson(CONTROL, DEFAULT_CONTROL);

export function writeControl(patch) {
  mkdirSync(LEDGER, { recursive: true });
  const next = { ...readControl(), ...patch };
  writeFileSync(CONTROL, JSON.stringify(next, null, 1));
  return next;
}

export function readPace() {
  const p = readJson(PACE, { batches: [] });
  const cutoff = Date.now() - WINDOW_MS;
  return { batches: (p.batches ?? []).filter((t) => t > cutoff) };
}

export function recordBatch(ts = Date.now()) {
  mkdirSync(LEDGER, { recursive: true });
  const { batches } = readPace();
  batches.push(ts);
  writeFileSync(PACE, JSON.stringify({ batches }, null, 1));
  return batches.length;
}

export function writeWorkerState(worker, state) {
  mkdirSync(LEDGER, { recursive: true });
  const path = join(LEDGER, `worker-${String(worker).replace(/[^a-z0-9_-]/gi, '_')}.json`);
  writeFileSync(path, JSON.stringify({ worker, ts: Date.now(), ...state }));
}

let planCache = { at: 0, plan: null };

export async function readPlan(url, maxAgeMs = 30_000) {
  if (Date.now() - planCache.at < maxAgeMs && planCache.plan) return planCache.plan;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`plan ${res.status}`);
    const body = await res.json();
    const five = body?.five_hour;
    if (typeof five?.pct !== 'number' || !five?.resets_at) throw new Error('no five_hour');
    const plan = { pct: five.pct, resetsAt: Date.parse(five.resets_at) };
    planCache = { at: Date.now(), plan };
    return plan;
  } catch (e) {
    return planCache.plan ? { ...planCache.plan, stale: e.message } : null;
  }
}

export function schedule(plan, control, now = Date.now()) {
  const ceiling = Number(control.ceiling_pct) || DEFAULT_CONTROL.ceiling_pct;
  if (!plan) return { verdict: 'go', reason: 'no plan data' };
  const windowStart = plan.resetsAt - WINDOW_MS;
  const elapsed = Math.min(Math.max(now - windowStart, 0), WINDOW_MS);
  const target = (ceiling * elapsed) / WINDOW_MS;
  const minsLeft = Math.max(0, (plan.resetsAt - now) / 60_000);
  if (plan.pct >= ceiling) {
    return { verdict: 'wait', target, ceiling, pct: plan.pct, minsLeft,
             reason: `at the ${ceiling}% ceiling` };
  }
  if (plan.pct >= target) {
    return { verdict: 'wait', target, ceiling, pct: plan.pct, minsLeft,
             reason: `${plan.pct.toFixed(1)}% used is ahead of the ${target.toFixed(1)}% schedule` };
  }
  return { verdict: 'go', target, ceiling, pct: plan.pct, minsLeft,
           reason: `${plan.pct.toFixed(1)}% used is behind the ${target.toFixed(1)}% schedule` };
}

export function pauseReason(now = Date.now()) {
  const control = readControl();
  if (!control.paused) return null;
  if (control.resume_after && now >= Number(control.resume_after)) {
    writeControl({ paused: false, paused_by: null, paused_at: null, reason: null, resume_after: null });
    return null;
  }
  return control.reason || 'paused';
}

export async function windowState() {
  const control = readControl();
  const plan = await readPlan(control.plan_url);
  const { batches } = readPace();
  return { control, plan, batches: batches.length, ...schedule(plan, control) };
}
