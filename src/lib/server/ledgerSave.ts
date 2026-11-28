import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { machineName } from '../../../tools/ledger/spool.mjs';
import { captureEntryId } from '../../../tools/ledger/save-thread.mjs';
import { appendToLog, logDir, logStamp } from './logFiles';
import { ledgerFailedLine, type LedgerCaptureMeta } from '$lib/game/sim/ledgerCapture';

const SNAPSHOT_HEAD = '{"v":1,"dynamic":';
const THREAD = fileURLToPath(new URL('../../../tools/ledger/save-thread.mjs', import.meta.url));
const THREAD_HEAP_MB = 6144;
const MAX_IN_SPOOL = 2;

export interface SpooledSave {
  save: string;
  entry: string;
  blob: string;
}

type Runner = (job: object, text: ArrayBuffer) => Promise<SpooledSave>;

export interface SpoolOptions {
  env?: NodeJS.ProcessEnv;
  checkout?: string;
  logs?: string;
  run?: Runner;
}

export function readCaptureMeta(header: string | null): LedgerCaptureMeta | null {
  if (!header) return null;
  try {
    const meta = JSON.parse(decodeURIComponent(header)) as LedgerCaptureMeta;
    const named = ['captureId', 'session', 'sessionAt', 'reason', 'at'] as const;
    return named.every((k) => typeof meta?.[k] === 'string') ? meta : null;
  } catch {
    return null;
  }
}

export function looksLikeSnapshot(text: Uint8Array): boolean {
  return Buffer.from(text.subarray(0, SNAPSHOT_HEAD.length)).toString('utf8') === SNAPSHOT_HEAD;
}

let queue: Promise<void> = Promise.resolve();
let inSpool = 0;

export const spoolFull = (): boolean => inSpool >= MAX_IN_SPOOL;

function runThread(job: object, text: ArrayBuffer): Promise<SpooledSave> {
  return new Promise((done, fail) => {
    const worker = new Worker(THREAD, {
      workerData: { ledgerSave: job },
      transferList: [text],
      resourceLimits: { maxOldGenerationSizeMb: THREAD_HEAP_MB }
    });
    worker.once('message', done);
    worker.once('error', fail);
    worker.once('exit', (code) => code !== 0 && fail(new Error(`spool thread exited ${code}`)));
  });
}

export function logCaptureFailure(
  meta: LedgerCaptureMeta,
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
  text: ArrayBuffer,
  meta: LedgerCaptureMeta,
  {
    env = process.env,
    checkout = process.cwd(),
    logs = logDir(),
    run = runThread
  }: SpoolOptions = {}
): { entry: string; spooled: Promise<SpooledSave> } | null {
  if (spoolFull()) {
    logCaptureFailure(meta, SPOOL_BUSY, logs);
    return null;
  }
  inSpool++;
  const entry = captureEntryId(machineName(env), meta.at, meta.captureId);
  const job = { text: new Uint8Array(text), meta, entry, env: { ...env }, checkout };
  const spooled = queue.then(() => run(job, text));
  queue = spooled.then(
    () => {},
    (err) => logCaptureFailure(meta, err, logs)
  );
  void queue.finally(() => inSpool--);
  return { entry, spooled };
}
