import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { machineName } from '../../../tools/ledger/spool.mjs';
import { captureEntryId, spoolCapture } from '../../../tools/ledger/capture.mjs';
import { appendToLog, logDir, logStamp } from './logFiles';
import { ledgerFailedLine, type LedgerUploadMeta } from '$lib/game/sim/ledgerCapture';

const MAX_IN_SPOOL = 2;
const SHA256 = /^[0-9a-f]{64}$/;

export interface SpooledSave {
  save: string;
  entry: string;
  blob: string;
}

export interface SaveJob {
  gz: Uint8Array;
  meta: LedgerUploadMeta;
  entry: string;
  env: NodeJS.ProcessEnv;
  checkout: string;
}

type Runner = (job: SaveJob) => Promise<SpooledSave>;

export interface SpoolOptions {
  env?: NodeJS.ProcessEnv;
  checkout?: string;
  logs?: string;
  run?: Runner;
}

export function readCaptureMeta(header: string | null): LedgerUploadMeta | null {
  if (!header) return null;
  try {
    const meta = JSON.parse(decodeURIComponent(header)) as LedgerUploadMeta;
    const named = ['captureId', 'session', 'sessionAt', 'reason', 'at'] as const;
    if (!named.every((k) => typeof meta?.[k] === 'string')) return null;
    if (!SHA256.test(String(meta.worldId)) || !SHA256.test(String(meta.blob))) return null;
    return Number.isInteger(meta.bytes) ? meta : null;
  } catch {
    return null;
  }
}

export const looksLikeGzip = (body: Uint8Array): boolean => body[0] === 0x1f && body[1] === 0x8b;

let queue: Promise<void> = Promise.resolve();
let inSpool = 0;

export const spoolFull = (): boolean => inSpool >= MAX_IN_SPOOL;

export function logCaptureFailure(
  meta: LedgerUploadMeta,
  err: unknown,
  logs: string = logDir()
): void {
  try {
    mkdirSync(logs, { recursive: true });
    const turn = String(meta.turn).padStart(5, '0');
    appendToLog(join(logs, 'perf.log'), [
      `${logStamp(new Date())} [T${turn}] [error] ${ledgerFailedLine(meta.captureId, err)}`
    ]);
  } catch (logErr) {
    console.error('[ledger] could not log a failed capture', meta.captureId, err, logErr);
  }
}

export const SPOOL_BUSY = 'spool busy: one capture running and one waiting';

export function queueSave(
  gz: Uint8Array,
  meta: LedgerUploadMeta,
  {
    env = process.env,
    checkout = process.cwd(),
    logs = logDir(),
    run = spoolCapture
  }: SpoolOptions = {}
): { entry: string; spooled: Promise<SpooledSave> } | null {
  if (spoolFull()) {
    logCaptureFailure(meta, SPOOL_BUSY, logs);
    return null;
  }
  inSpool++;
  const entry = captureEntryId(machineName(env), meta.at, meta.captureId);
  const job: SaveJob = { gz, meta, entry, env: { ...env }, checkout };
  const spooled = queue.then(() => run(job));
  queue = spooled.then(
    () => {},
    (err) => logCaptureFailure(meta, err, logs)
  );
  void queue.finally(() => inSpool--);
  return { entry, spooled };
}
