import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { machineName, newId } from '../../../tools/ledger/spool.mjs';
import { appendToLog, logDir, logStamp } from './logFiles';
import type { LedgerCaptureMeta } from '$lib/game/sim/ledgerCapture';

const SNAPSHOT_HEAD = '{"v":1,"dynamic":';
const THREAD = fileURLToPath(new URL('../../../tools/ledger/save-thread.mjs', import.meta.url));
const THREAD_HEAP_MB = 6144;

export interface SpooledSave {
  save: string;
  entry: string;
  blob: string;
}

export function readCaptureMeta(header: string | null): LedgerCaptureMeta | null {
  if (!header) return null;
  try {
    const meta = JSON.parse(decodeURIComponent(header)) as LedgerCaptureMeta;
    const named = ['captureId', 'session', 'reason', 'at'] as const;
    return named.every((k) => typeof meta?.[k] === 'string') ? meta : null;
  } catch {
    return null;
  }
}

export function looksLikeSnapshot(text: Uint8Array): boolean {
  return Buffer.from(text.subarray(0, SNAPSHOT_HEAD.length)).toString('utf8') === SNAPSHOT_HEAD;
}

const sessionEntries = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

type Runner = (job: object, text: ArrayBuffer) => Promise<SpooledSave>;

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

function logFailure(meta: LedgerCaptureMeta, err: unknown): void {
  const why = (err instanceof Error ? err.message : String(err)).replace(/"/g, "'");
  const turn = String(meta.turn).padStart(5, '0');
  appendToLog(join(logDir(), 'perf.log'), [
    `${logStamp(new Date())} [T${turn}] [error] ledger failed cap=${meta.captureId} error="${why}"`
  ]);
}

export function queueSave(
  text: ArrayBuffer,
  meta: LedgerCaptureMeta,
  env: NodeJS.ProcessEnv = process.env,
  checkout = process.cwd(),
  run: Runner = runThread
): { entry: string; spooled: Promise<SpooledSave> } {
  const entry = newId(machineName(env), meta.at);
  if (meta.reason === 'session') sessionEntries.set(meta.session, entry);
  const parent = meta.reason === 'session' ? null : (sessionEntries.get(meta.session) ?? null);
  const job = { text: new Uint8Array(text), meta, entry, parent, env: { ...env }, checkout };
  const spooled = queue.then(() => run(job, text));
  queue = spooled.catch((err) => logFailure(meta, err));
  return { entry, spooled };
}
