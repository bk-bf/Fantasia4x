import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import {
  fileRef,
  gitInfo,
  launchedBy,
  machineName,
  sha256Of,
  spoolDir,
  writeBlob,
  writeEntry
} from '../../../tools/ledger/spool.mjs';
import type { LedgerCaptureMeta, LedgerReceipt } from '$lib/game/sim/ledgerCapture';

const gzipAsync = promisify(gzip);

const SNAPSHOT_HEAD = '{"v":1,"dynamic":';

export function readCaptureMeta(header: string | null): LedgerCaptureMeta | null {
  if (!header) return null;
  try {
    const meta = JSON.parse(decodeURIComponent(header)) as LedgerCaptureMeta;
    return typeof meta?.reason === 'string' && typeof meta.at === 'string' ? meta : null;
  } catch {
    return null;
  }
}

export function looksLikeSnapshot(text: Buffer): boolean {
  return text.subarray(0, SNAPSHOT_HEAD.length).toString('utf8') === SNAPSHOT_HEAD;
}

export async function spoolSave(
  text: Buffer,
  meta: LedgerCaptureMeta,
  env: NodeJS.ProcessEnv = process.env,
  checkout = process.cwd()
): Promise<LedgerReceipt> {
  const started = performance.now();
  const save = sha256Of(text);
  const gz = await gzipAsync(text, { level: 6 });
  const dir = spoolDir(env);
  const blob = writeBlob(gz, dir);
  const entry = writeEntry(
    {
      kind: 'save',
      at: meta.at,
      launchedBy: launchedBy(env),
      machine: machineName(env),
      ...gitInfo(checkout),
      tool: null,
      scenario: meta.scenario ?? 'save',
      world: {
        save,
        name: meta.save,
        turn: meta.turn,
        seed: meta.seed,
        map: meta.map,
        pawns: meta.pawns,
        mobs: meta.mobs,
        generatedBy: meta.generatedBy,
        savedBy: meta.savedBy
      },
      perf: {
        speed: `${meta.speed}x`,
        capture: {
          reason: meta.reason,
          ms: meta.ms,
          bytes: text.length,
          serverMs: Math.round(performance.now() - started)
        }
      },
      files: [fileRef('save', 'save.json.gz', blob, dir)],
      parent: meta.parent,
      note: null
    },
    dir
  );
  return { save, entry };
}
