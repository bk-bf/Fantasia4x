import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { HASH_HEAD, SAVE_HEAD } from './canonical.mjs';
import {
  fileRef,
  gitInfo,
  launchedBy,
  machineName,
  newId,
  sha256Of,
  spoolDir,
  writeBlob,
  writeEntry
} from './spool.mjs';

/**
 * @typedef {import('../../src/lib/game/sim/ledgerCapture').LedgerUploadMeta} UploadMeta
 * @typedef {{ gz: Uint8Array, meta: UploadMeta, entry: string, env: NodeJS.ProcessEnv, checkout: string }} SaveJob
 */

const SNAPSHOT_HEAD = Buffer.from(`${SAVE_HEAD}"dynamic":`);

/** @param {string} machine @param {string} at @param {string} captureId */
export function captureEntryId(machine, at, captureId) {
  const tag = createHash('sha256').update(captureId).digest('hex').slice(0, 6);
  return newId(machine, at).slice(0, -6) + tag;
}

/** @param {string} dir @param {string} id */
const sessionMark = (dir, id) => join(dir, 'sessions', id);

/** @param {UploadMeta} meta @param {string} machine @param {string} dir */
function sessionParent(meta, machine, dir) {
  const root = `${meta.session}-0`;
  if (meta.captureId === root || !meta.sessionAt) return null;
  const id = captureEntryId(machine, meta.sessionAt, root);
  return existsSync(sessionMark(dir, id)) || existsSync(join(dir, 'entries', `${id}.json`)) ? id : null;
}

/** @param {UploadMeta} meta @param {string} entry @param {string} dir */
function markSession(meta, entry, dir) {
  if (meta.captureId !== `${meta.session}-0`) return;
  mkdirSync(join(dir, 'sessions'), { recursive: true });
  writeFileSync(sessionMark(dir, entry), '');
}

/** @param {Uint8Array} gz @returns {Promise<{ worldId: string, bytes: number }>} */
export async function readCapture(gz) {
  const hash = createHash('sha256').update(HASH_HEAD);
  let head = Buffer.alloc(0);
  let bytes = 0;
  const sink = new Writable({
    write(chunk, _encoding, done) {
      if (head.length < SNAPSHOT_HEAD.length) head = Buffer.concat([head, chunk.subarray(0, SNAPSHOT_HEAD.length - head.length)]);
      const skip = Math.max(0, SAVE_HEAD.length - bytes);
      if (skip < chunk.length) hash.update(chunk.subarray(skip));
      bytes += chunk.length;
      done(head.length >= SNAPSHOT_HEAD.length && !head.equals(SNAPSHOT_HEAD) ? new Error('not a save snapshot') : null);
    }
  });
  await pipeline(Readable.from([gz]), createGunzip(), sink);
  if (!head.equals(SNAPSHOT_HEAD)) throw new Error('not a save snapshot');
  return { worldId: hash.digest('hex'), bytes };
}

/** @param {SaveJob} job */
export async function spoolCapture({ gz, meta, entry, env, checkout }) {
  const started = performance.now();
  const bytes = Buffer.from(gz.buffer, gz.byteOffset, gz.byteLength);
  const blobSha = sha256Of(bytes);
  if (blobSha !== meta.blob) throw new Error(`upload hashes to ${blobSha.slice(0, 12)}, not the ${meta.blob.slice(0, 12)} its sender named`);
  const read = await readCapture(bytes);
  if (read.worldId !== meta.worldId)
    throw new Error(`save hashes to world ${read.worldId.slice(0, 12)}, not the ${meta.worldId.slice(0, 12)} its sender named`);
  if (read.bytes !== meta.bytes) throw new Error(`save holds ${read.bytes} bytes, not the ${meta.bytes} its sender named`);
  const dir = spoolDir(env);
  const blob = writeBlob(bytes, dir);
  const machine = machineName(env);
  writeEntry(
    {
      id: entry,
      kind: 'save',
      at: meta.at,
      launchedBy: launchedBy(env),
      machine,
      ...gitInfo(checkout),
      tool: null,
      scenario: meta.scenario ?? 'save',
      world: {
        save: read.worldId,
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
        speed: meta.speed == null ? null : `${meta.speed}x`,
        capture: {
          reason: meta.reason,
          session: meta.session,
          ms: meta.ms,
          packMs: meta.packMs,
          bytes: read.bytes,
          serverMs: Math.round(performance.now() - started)
        }
      },
      files: [fileRef('save', 'save.json.gz', blob, dir)],
      parent: sessionParent(meta, machine, dir),
      note: null
    },
    dir
  );
  markSession(meta, entry, dir);
  return { save: read.worldId, entry, blob };
}
