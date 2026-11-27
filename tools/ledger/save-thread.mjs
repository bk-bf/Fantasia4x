import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import {
  fileRef,
  gitInfo,
  launchedBy,
  machineName,
  spoolDir,
  worldId,
  writeBlob,
  writeEntry
} from './spool.mjs';

/**
 * @typedef {{ captureId: string, session: string, reason: string, at: string, ms: number, turn: number, seed: number, map: string, pawns: number, mobs: number, speed: number, save: string | null, scenario: string | null, generatedBy: string | null, savedBy: string | null }} CaptureMeta
 * @typedef {{ text: Uint8Array, meta: CaptureMeta, entry: string, parent: string | null, env: NodeJS.ProcessEnv, checkout: string }} SaveJob
 */

/** @param {SaveJob} job */
export function spoolCapture({ text, meta, entry, parent, env, checkout }) {
  const started = performance.now();
  const bytes = Buffer.from(text.buffer, text.byteOffset, text.byteLength);
  const dir = spoolDir(env);
  const blob = writeBlob(gzipSync(bytes, { level: 6 }), dir);
  const save = worldId(JSON.parse(bytes.toString('utf8')));
  writeEntry(
    {
      id: entry,
      kind: 'save',
      at: meta.at,
      launchedBy: launchedBy(env),
      machine: machineName(env),
      ...gitInfo(checkout),
      tool: null,
      scenario: meta.scenario ?? 'save',
      world: {
        save,
        captureId: meta.captureId,
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
          session: meta.session,
          ms: meta.ms,
          bytes: bytes.length,
          serverMs: Math.round(performance.now() - started)
        }
      },
      files: [fileRef('save', 'save.json.gz', blob, dir)],
      parent,
      note: null
    },
    dir
  );
  return { save, entry, blob };
}

if (!isMainThread && workerData?.ledgerSave)
  parentPort?.postMessage(spoolCapture(workerData.ledgerSave));
