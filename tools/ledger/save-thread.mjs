import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fileRef,
  gitInfo,
  launchedBy,
  machineName,
  newId,
  spoolDir,
  worldId,
  writeBlob,
  writeEntry
} from './spool.mjs';

/**
 * @typedef {import('../../src/lib/game/sim/ledgerCapture').LedgerCaptureMeta} CaptureMeta
 * @typedef {{ text: Uint8Array, meta: CaptureMeta, entry: string, env: NodeJS.ProcessEnv, checkout: string }} SaveJob
 */

/** @param {string} machine @param {string} at @param {string} captureId */
export function captureEntryId(machine, at, captureId) {
  const tag = createHash('sha256').update(captureId).digest('hex').slice(0, 6);
  return newId(machine, at).slice(0, -6) + tag;
}

/** @param {string} dir @param {string} id */
const sessionMark = (dir, id) => join(dir, 'sessions', id);

/** @param {CaptureMeta} meta @param {string} machine @param {string} dir */
function sessionParent(meta, machine, dir) {
  const root = `${meta.session}-0`;
  if (meta.captureId === root || !meta.sessionAt) return null;
  const id = captureEntryId(machine, meta.sessionAt, root);
  return existsSync(sessionMark(dir, id)) || existsSync(join(dir, 'entries', `${id}.json`)) ? id : null;
}

/** @param {CaptureMeta} meta @param {string} entry @param {string} dir */
function markSession(meta, entry, dir) {
  if (meta.captureId !== `${meta.session}-0`) return;
  mkdirSync(join(dir, 'sessions'), { recursive: true });
  writeFileSync(sessionMark(dir, entry), '');
}

/** @param {SaveJob} job */
export function spoolCapture({ text, meta, entry, env, checkout }) {
  const started = performance.now();
  const bytes = Buffer.from(text.buffer, text.byteOffset, text.byteLength);
  const dir = spoolDir(env);
  const blob = writeBlob(gzipSync(bytes, { level: 6 }), dir);
  const save = worldId(JSON.parse(bytes.toString('utf8')));
  const parent = sessionParent(meta, machineName(env), dir);
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
  markSession(meta, entry, dir);
  return { save, entry, blob };
}

if (!isMainThread && workerData?.ledgerSave)
  parentPort?.postMessage(spoolCapture(workerData.ledgerSave));
