import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { POST } from '../../routes/api/ledger/save/+server';
import { SPOOL_BUSY, queueSave, type SpooledSave } from '$lib/server/ledgerSave';
import { worldId } from '../../../tools/ledger/spool.mjs';
import {
  serializeSave,
  LEDGER_META_HEADER,
  type LedgerCaptureMeta
} from '$lib/game/sim/ledgerCapture';
import { fromSnapshot, toSnapshot } from '$lib/game/headless/snapshot';
import type { GameState, WorldTile } from '$lib/game/core/types';

const tile = (x: number): WorldTile =>
  ({
    x,
    y: 0,
    type: 'land',
    terrainType: 'grassland',
    subType: 'grass',
    walkable: true,
    resources: { stone: x },
    ascii: '.',
    gCost: 1,
    hCost: 1,
    fCost: 2,
    parent: null
  }) as unknown as WorldTile;

const state = {
  turn: 17136,
  seed: 4042420917,
  pawns: [{ id: 'p1' }],
  mobs: [{ id: 'm1' }],
  worldMap: [
    [tile(0), tile(1)],
    [tile(2), tile(3)]
  ]
} as unknown as GameState;

const meta = (over: Partial<LedgerCaptureMeta> = {}): LedgerCaptureMeta => ({
  captureId: 'feed0001-0',
  session: 'feed0001',
  sessionAt: '2026-11-27T01:37:00.000Z',
  reason: 'session',
  at: '2026-11-27T01:37:00.000Z',
  ms: 412,
  turn: 17136,
  seed: 4042420917,
  map: '2x2',
  pawns: 1,
  mobs: 1,
  speed: 4,
  save: 'slot-1',
  scenario: null,
  generatedBy: null,
  savedBy: 'c'.repeat(40),
  ...over
});

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function scratch(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `f4x-ledger-${name}-`));
  dirs.push(dir);
  return dir;
}

function scratchSpool(): string {
  const spool = scratch('spool');
  vi.stubEnv('F4X_LEDGER_SPOOL', spool);
  vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'session-1');
  vi.stubEnv('F4X_MACHINE', 'laptop');
  return spool;
}

async function send(
  body: BodyInit,
  header: string | null = encodeURIComponent(JSON.stringify(meta()))
) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (header) headers.set(LEDGER_META_HEADER, header);
  const request = new Request('http://localhost/api/ledger/save', {
    method: 'POST',
    body,
    headers
  });
  return POST({ request } as Parameters<typeof POST>[0]);
}

const bytesOf = async (blob: Blob) => (await blob.arrayBuffer()).slice(0);

describe('the ledger save route', () => {
  it('accepts the capture at once and spools it under the world id core computes', async () => {
    const spool = scratchSpool();
    const body = serializeSave(state);
    const text = await body.text();
    const res = await send(body);
    expect(res.status).toBe(202);
    const receipt = await res.json();
    expect(receipt.captureId).toBe('feed0001-0');

    const child = queueSave(
      await bytesOf(body),
      meta({ captureId: 'feed0001-1', reason: 'manual', at: '2026-11-27T01:39:00.000Z' })
    );
    await child?.spooled;
    const entries = readdirSync(join(spool, 'entries')).map((f) =>
      JSON.parse(readFileSync(join(spool, 'entries', f), 'utf8'))
    );
    const entry = entries.find((e) => e.id === receipt.entry);
    expect(entry).toMatchObject({
      v: 1,
      kind: 'save',
      at: '2026-11-27T01:37:00.000Z',
      machine: 'laptop',
      launchedBy: { who: 'agent', session: 'session-1' },
      scenario: 'save',
      world: {
        captureId: 'feed0001-0',
        name: 'slot-1',
        turn: 17136,
        seed: 4042420917,
        map: '2x2',
        pawns: 1,
        mobs: 1,
        generatedBy: null,
        savedBy: 'c'.repeat(40)
      },
      perf: {
        speed: '4x',
        capture: { reason: 'session', session: 'feed0001', ms: 412, bytes: text.length }
      },
      parent: null
    });
    expect(entry.commit).toMatch(/^[0-9a-f]{40}$/);

    const [file] = entry.files;
    expect(file).toMatchObject({ role: 'save', name: 'save.json.gz' });
    const gz = readFileSync(join(spool, 'blobs', file.sha256.slice(0, 2), file.sha256));
    expect(createHash('sha256').update(gz).digest('hex')).toBe(file.sha256);
    expect(file.bytes).toBe(gz.length);
    const snapshot = JSON.parse(gunzipSync(gz).toString('utf8'));
    expect(entry.world.save).toBe(worldId(snapshot));
    expect(entry.world.save).toBe(worldId({ ...toSnapshot(state) }));
    expect(entries.find((e) => e.id === child?.entry)?.parent).toBe(receipt.entry);
    const back = fromSnapshot(snapshot);
    expect(back.turn).toBe(17136);
    expect(back.worldMap[1][1].resources).toEqual({ stone: 3 });
  });

  it('refuses a body that is not a save snapshot, or one without its capture meta', async () => {
    scratchSpool();
    expect((await send('{"nope":1}')).status).toBe(400);
    expect((await send(serializeSave(state), null)).status).toBe(400);
  });
});

function heldRunner() {
  const waiting: Array<() => void> = [];
  const run = () =>
    new Promise<SpooledSave>((done) =>
      waiting.push(() => done({ save: 's', entry: 'e', blob: 'b' }))
    );
  const release = () => waiting.splice(0).forEach((done) => done());
  return { run, release, waiting };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('queueing a capture for the spool', () => {
  it('names the entry before any of the slow work has run', async () => {
    scratchSpool();
    const { run, release } = heldRunner();
    const queued = queueSave(await bytesOf(serializeSave(state)), meta(), { run });
    expect(queued?.entry).toMatch(/^20261127T013700Z-laptop-[0-9a-f]{6}$/);
    const settled = await Promise.race([
      queued?.spooled.then(() => true),
      new Promise((r) => setTimeout(() => r(false), 20))
    ]);
    expect(settled).toBe(false);
    release();
    await queued?.spooled;
  });

  it('keeps one capture waiting behind the running one and drops the next with a logged reason', async () => {
    scratchSpool();
    const logs = join(scratch('logs'), 'not-yet');
    const { run, release, waiting } = heldRunner();
    const body = await bytesOf(serializeSave(state));
    const at = (n: number) => meta({ captureId: `feed0001-${n}`, reason: 'periodic' });
    const running = queueSave(body.slice(0), at(1), { run, logs });
    const next = queueSave(body.slice(0), at(2), { run, logs });
    expect(queueSave(body.slice(0), at(3), { run, logs })).toBeNull();
    expect(readFileSync(join(logs, 'perf.log'), 'utf8')).toMatch(
      new RegExp(`\\[T17136\\] \\[error\\] ledger failed cap=feed0001-3 error="${SPOOL_BUSY}"\n$`)
    );
    await settle();
    expect(waiting).toHaveLength(1);
    release();
    await running?.spooled;
    await settle();
    release();
    await next?.spooled;
    await settle();
    const after = queueSave(body.slice(0), at(4), { run, logs });
    expect(after).not.toBeNull();
    await settle();
    release();
    await after?.spooled;
  });

  it('logs a capture the spool could not write, creating the log folder, and keeps spooling', async () => {
    scratchSpool();
    const logs = join(scratch('logs'), 'missing', '.debug');
    const body = await bytesOf(serializeSave(state));
    const broken = queueSave(body.slice(0), meta({ captureId: 'feed0001-5' }), {
      logs,
      run: () => Promise.reject(new Error('disk full'))
    });
    await expect(broken?.spooled).rejects.toThrow('disk full');
    await settle();
    expect(readFileSync(join(logs, 'perf.log'), 'utf8')).toContain(
      'ledger failed cap=feed0001-5 error="disk full"'
    );
    const { run, release } = heldRunner();
    const next = queueSave(body.slice(0), meta({ captureId: 'feed0001-6' }), { run, logs });
    await settle();
    release();
    await expect(next?.spooled).resolves.toMatchObject({ save: 's' });
  });

  it('ties a later capture to its session capture only when that capture was written', async () => {
    const spool = scratchSpool();
    const body = await bytesOf(serializeSave(state));
    const sessionAt = '2026-11-27T02:00:00.000Z';
    const write = async (over: Partial<LedgerCaptureMeta>) => {
      const queued = queueSave(body.slice(0), meta({ sessionAt, ...over }));
      await queued?.spooled;
      return queued?.entry;
    };
    const parentOf = (id?: string) =>
      JSON.parse(readFileSync(join(spool, 'entries', `${id}.json`), 'utf8')).parent;

    const root = await write({ session: 'aaaa0000', captureId: 'aaaa0000-0', at: sessionAt });
    const child = await write({
      session: 'aaaa0000',
      captureId: 'aaaa0000-1',
      reason: 'periodic',
      at: '2026-11-27T02:02:00.000Z'
    });
    const orphan = await write({
      session: 'bbbb0000',
      captureId: 'bbbb0000-1',
      reason: 'manual',
      at: '2026-11-27T02:03:00.000Z'
    });
    expect(parentOf(root)).toBeNull();
    expect(parentOf(child)).toBe(root);
    expect(parentOf(orphan)).toBeNull();
  });
});
