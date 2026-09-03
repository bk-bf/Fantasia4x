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
  window_batches: 60
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
  const tmp = `${CONTROL}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 1));
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

export function windowState() {
  const control = readControl();
  const { batches } = readPace();
  const cap = Number(control.window_batches) || DEFAULT_CONTROL.window_batches;
  const oldest = batches.length ? Math.min(...batches) : null;
  return {
    cap,
    used: batches.length,
    remaining: Math.max(0, cap - batches.length),
    window_ends: oldest === null ? null : oldest + WINDOW_MS,
    paused: !!control.paused,
    control
  };
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

export function nextSlotDelay(now = Date.now()) {
  const { cap } = windowState();
  const { batches } = readPace();
  if (batches.length < cap) return 0;
  const sorted = [...batches].sort((a, b) => a - b);
  const freeAt = sorted[batches.length - cap] + WINDOW_MS;
  return Math.max(0, freeAt - now);
}
