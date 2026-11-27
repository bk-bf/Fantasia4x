import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { POST } from '../../routes/api/ledger/save/+server';
import { queueSave } from '$lib/server/ledgerSave';
import { worldId } from '../../../tools/ledger/spool.mjs';
import {
  serializeSave,
  LEDGER_META_HEADER,
  type LedgerCaptureMeta
} from '$lib/game/sim/ledgerCapture';
import { fromSnapshot } from '$lib/game/headless/snapshot';
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

function scratchSpool(): string {
  const spool = mkdtempSync(join(tmpdir(), 'f4x-ledger-spool-'));
  dirs.push(spool);
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

    const { spooled } = queueSave(
      await bytesOf(body),
      meta({ captureId: 'feed0001-1', reason: 'manual' })
    );
    await spooled;
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
    expect(entry.world.save).toBe(worldId({ dynamic: snapshot.dynamic, world: state.worldMap }));
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

describe('queueing a capture for the spool', () => {
  it('names the entry before any of the slow work has run', async () => {
    scratchSpool();
    let release = () => {};
    const held = () =>
      new Promise<{ save: string; entry: string; blob: string }>((done) => {
        release = () => done({ save: 's', entry: 'e', blob: 'b' });
      });
    const body = await bytesOf(serializeSave(state));
    const { entry, spooled } = queueSave(body, meta(), process.env, process.cwd(), held);
    expect(entry).toMatch(/^\d{8}T\d{6}Z-laptop-[0-9a-f]{6}$/);
    const settled = await Promise.race([
      spooled.then(() => true),
      new Promise((r) => setTimeout(() => r(false), 20))
    ]);
    expect(settled).toBe(false);
    release();
    await spooled;
  });

  it('ties each later capture to the session capture taken under its own token', async () => {
    scratchSpool();
    const parents: Array<[string, string | null]> = [];
    const run = async (job: object) => {
      const { meta: m, parent } = job as { meta: LedgerCaptureMeta; parent: string | null };
      parents.push([m.captureId, parent]);
      return { save: 's', entry: 'e', blob: 'b' };
    };
    const body = await bytesOf(serializeSave(state));
    const queue = (over: Partial<LedgerCaptureMeta>) =>
      queueSave(body.slice(0), meta(over), process.env, process.cwd(), run);
    const a = queue({ session: 'aaaa0000', captureId: 'aaaa0000-0' });
    const b = queue({ session: 'bbbb0000', captureId: 'bbbb0000-0' });
    queue({ session: 'aaaa0000', captureId: 'aaaa0000-1', reason: 'periodic' });
    const last = queue({ session: 'bbbb0000', captureId: 'bbbb0000-1', reason: 'manual' });
    await last.spooled;
    expect(parents).toEqual([
      ['aaaa0000-0', null],
      ['bbbb0000-0', null],
      ['aaaa0000-1', a.entry],
      ['bbbb0000-1', b.entry]
    ]);
  });
});
