import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { POST } from '../../routes/api/ledger/save/+server';
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

const meta: LedgerCaptureMeta = {
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
  parent: null
};

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function send(
  body: BodyInit,
  header: string | null = encodeURIComponent(JSON.stringify(meta))
) {
  const spool = mkdtempSync(join(tmpdir(), 'f4x-ledger-spool-'));
  dirs.push(spool);
  vi.stubEnv('F4X_LEDGER_SPOOL', spool);
  vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'session-1');
  vi.stubEnv('F4X_MACHINE', 'laptop');
  const headers = new Headers({ 'content-type': 'application/json' });
  if (header) headers.set(LEDGER_META_HEADER, header);
  const request = new Request('http://localhost/api/ledger/save', {
    method: 'POST',
    body,
    headers
  });
  const res = await POST({ request } as Parameters<typeof POST>[0]);
  return { res, spool };
}

describe('the ledger save route', () => {
  it('spools the snapshot as a gzipped blob under an entry named for the sha256 of its JSON', async () => {
    const body = serializeSave(state);
    const text = await body.text();
    const { res, spool } = await send(body);
    expect(res.status).toBe(200);
    const receipt = await res.json();
    expect(receipt.save).toBe(createHash('sha256').update(text).digest('hex'));

    const [entryFile] = readdirSync(join(spool, 'entries'));
    const entry = JSON.parse(readFileSync(join(spool, 'entries', entryFile), 'utf8'));
    expect(entry.id).toBe(receipt.entry);
    expect(entry).toMatchObject({
      v: 1,
      kind: 'save',
      at: meta.at,
      machine: 'laptop',
      launchedBy: { who: 'agent', session: 'session-1' },
      scenario: 'save',
      world: {
        save: receipt.save,
        name: 'slot-1',
        turn: 17136,
        seed: 4042420917,
        map: '2x2',
        pawns: 1,
        mobs: 1,
        generatedBy: null,
        savedBy: 'c'.repeat(40)
      },
      perf: { speed: '4x', capture: { reason: 'session', ms: 412, bytes: text.length } },
      parent: null
    });
    expect(entry.commit).toMatch(/^[0-9a-f]{40}$/);

    const [file] = entry.files;
    expect(file).toMatchObject({ role: 'save', name: 'save.json.gz' });
    const gz = readFileSync(join(spool, 'blobs', file.sha256.slice(0, 2), file.sha256));
    expect(createHash('sha256').update(gz).digest('hex')).toBe(file.sha256);
    expect(file.bytes).toBe(gz.length);
    const back = fromSnapshot(JSON.parse(gunzipSync(gz).toString('utf8')));
    expect(back.turn).toBe(17136);
    expect(back.worldMap[1][1].resources).toEqual({ stone: 3 });
  });

  it('refuses a body that is not a save snapshot, or one without its capture meta', async () => {
    expect((await send('{"nope":1}')).res.status).toBe(400);
    expect((await send(serializeSave(state), null)).res.status).toBe(400);
  });
});
