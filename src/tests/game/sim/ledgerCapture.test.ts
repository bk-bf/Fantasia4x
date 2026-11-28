import { describe, it, expect } from 'vitest';
import {
  LedgerCapturer,
  encodeState,
  saveBody,
  saveSize,
  type LedgerCaptureMeta
} from '$lib/game/sim/ledgerCapture';
import { packSave } from '$lib/game/sim/ledgerPack';
import { fromSnapshot, toSnapshot } from '$lib/game/headless/snapshot';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { worldId } from '../../../../tools/ledger/spool.mjs';
import type { GameState, WorldTile } from '$lib/game/core/types';

const tile = (x: number): WorldTile =>
  ({
    x,
    y: 0,
    type: 'land',
    terrainType: 'grassland',
    subType: 'grass',
    walkable: true,
    resources: {},
    ascii: '.',
    gCost: 3,
    hCost: 3,
    fCost: 6,
    parent: null
  }) as unknown as WorldTile;

const state = {
  turn: 30058,
  worldPawns: [],
  seed: 4242,
  pawns: [{ id: 'p1' }],
  mobs: [{ id: 'm1' }, { id: 'm2' }],
  worldMap: [
    [tile(0), tile(1), tile(2)],
    [tile(3), tile(4), tile(5)]
  ],
  generatedBy: { commit: 'a96826d3'.padEnd(40, '0'), branch: 'test/look-overhaul', dirty: 0 }
} as unknown as GameState;

const saveText = (save: Uint8Array) => Buffer.concat(saveBody(save)).toString('utf8');
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

function rig(fail = false) {
  const lines: string[] = [];
  const posts: { text: string; meta: LedgerCaptureMeta }[] = [];
  const answers: Array<() => void> = [];
  let clock = 1000;
  const capturer = new LedgerCapturer({
    state: () => state,
    speed: () => 4,
    now: () => (clock += 7),
    clock: () => new Date('2026-11-27T01:37:00.000Z'),
    savedBy: 'b'.repeat(40),
    log: (_turn, message) => lines.push(message),
    post: async (save, meta) => {
      if (fail) throw new Error('status 500');
      posts.push({ text: saveText(save), meta });
      await new Promise<void>((done) => answers.push(done));
      return { captureId: meta.captureId, entry: `entry-${posts.length}` };
    }
  });
  const answer = () => answers.splice(0).forEach((done) => done());
  const settle = async (capture: Promise<void>) => {
    await new Promise((r) => setTimeout(r, 0));
    answer();
    await capture;
  };
  return { capturer, lines, posts, answer, settle };
}

const on = { on: true, intervalMs: 120_000, save: 'slot-1', scenario: null, session: '1a2b3c4d' };

describe('the ledger capture in the sim worker', () => {
  it('writes the snapshot a save holds with its keys sorted and the pathfinding fields left off each tile', () => {
    const text = saveText(encodeState(state));
    expect(JSON.parse(text)).toEqual(toSnapshot(state));
    expect(text).toMatch(/^\{"v":1,"dynamic":\{"generatedBy":/);
    expect(text).toContain('[{"resources":{},"subType":"grass","terrainType":"grassland","type":"land","walkable":true,"x":0,"y":0},');
  });

  it('hashes to the world id of the state, the id the store gives it', async () => {
    const save = encodeState(state);
    expect(sha(save)).toBe(worldId({ ...toSnapshot(state) }));
    expect((await packSave(save)).worldId).toBe(worldId({ ...toSnapshot(state) }));
  });

  it('gives a loaded save, captured before it runs, the world id of the save file', () => {
    const file = JSON.parse(JSON.stringify(toSnapshot(state)));
    const loaded = fromSnapshot(file);
    expect(sha(encodeState(loaded))).toBe(worldId(file));
  });

  it('packs the save gzipped under the sha256 of the gzipped bytes', async () => {
    const save = encodeState(state);
    const packed = await packSave(save);
    expect(packed.blob).toBe(sha(packed.gz));
    expect(gunzipSync(packed.gz).toString('utf8')).toBe(saveText(save));
    expect(packed.bytes).toBe(saveSize(save));
  });

  it('grows its buffer past a size hint that was too small and keeps text that is not ASCII', () => {
    const rows = Array.from({ length: 20 }, (_, y) =>
      Array.from({ length: 40 }, (_, x) => ({ ...tile(x), y, subType: `grass ᚠᚢᚦ 🜂 ${x}` }))
    );
    const named = { ...state, worldMap: rows, culture: { name: 'Hjörvarðr' } } as unknown as GameState;
    const save = encodeState(named, 8);
    expect(save.length).toBeGreaterThan(1 << 16);
    expect(JSON.parse(saveText(save))).toEqual(toSnapshot(named));
    expect(sha(save)).toBe(worldId({ ...toSnapshot(named) }));
  });

  it('sends the whole state as a snapshot the headless loader reads back', async () => {
    const { capturer, posts, settle } = rig();
    capturer.configure(on);
    await settle(capturer.capture('session'));
    const back = fromSnapshot(JSON.parse(posts[0].text));
    expect(back.turn).toBe(30058);
    expect(back.mobs).toHaveLength(2);
    expect(back.worldMap[0]).toHaveLength(3);
    expect(posts[0].meta).toMatchObject({
      captureId: '1a2b3c4d-0',
      session: '1a2b3c4d',
      sessionAt: '2026-11-27T01:37:00.000Z',
      reason: 'session',
      turn: 30058,
      seed: 4242,
      map: '3x2',
      pawns: 1,
      mobs: 2,
      speed: 4,
      save: 'slot-1',
      generatedBy: state.generatedBy?.commit,
      savedBy: 'b'.repeat(40)
    });
    expect(posts[0].meta).not.toHaveProperty('parent');
  });

  it('logs the capture with its id, turn, start time and stall the moment it is taken, before the server answers', async () => {
    const { capturer, lines, posts, settle } = rig();
    capturer.configure(on);
    const capture = capturer.capture('session');
    expect(lines).toEqual([
      `ledger save cap=1a2b3c4d-0 reason=session turn=30058 at=2026-11-27T01:37:00.000Z ms=7 speed=4x bytes=${saveSize(encodeState(state))}`
    ]);
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toHaveLength(1);
    await settle(capture);
    expect(lines).toHaveLength(1);
  });

  it('numbers the captures of a session in order and starts again for the next session', async () => {
    const { capturer, posts, settle } = rig();
    capturer.configure(on);
    await settle(capturer.capture('session'));
    await settle(capturer.capture('manual', 'slot-2'));
    capturer.configure({ ...on, session: '99887766' });
    await settle(capturer.capture('session'));
    expect(posts.map((p) => p.meta.captureId)).toEqual(['1a2b3c4d-0', '1a2b3c4d-1', '99887766-0']);
    expect(posts[1].meta).toMatchObject({ reason: 'manual', save: 'slot-2', session: '1a2b3c4d' });
  });

  it('posts captures one at a time, in the order they were taken, across sessions', async () => {
    const { capturer, posts, answer } = rig();
    capturer.configure(on);
    const first = capturer.capture('session');
    capturer.configure({ ...on, session: '99887766' });
    const second = capturer.capture('session');
    await new Promise((r) => setTimeout(r, 0));
    expect(posts.map((p) => p.meta.captureId)).toEqual(['1a2b3c4d-0']);
    answer();
    await first;
    await new Promise((r) => setTimeout(r, 0));
    answer();
    await second;
    expect(posts.map((p) => [p.meta.session, p.meta.captureId])).toEqual([
      ['1a2b3c4d', '1a2b3c4d-0'],
      ['99887766', '99887766-0']
    ]);
  });

  it('captures periodically only once the game has run for the whole interval', async () => {
    const { capturer, posts, answer } = rig();
    capturer.configure(on);
    capturer.ran(60_000);
    capturer.ran(59_000);
    expect(posts).toHaveLength(0);
    capturer.ran(1_000);
    await new Promise((r) => setTimeout(r, 0));
    answer();
    expect(posts.map((p) => p.meta.reason)).toEqual(['periodic']);
  });

  it('captures nothing when switched off, and no periodic capture with a zero interval', async () => {
    const { capturer, posts } = rig();
    capturer.configure({ ...on, on: false });
    await capturer.capture('session');
    capturer.configure({ ...on, intervalMs: 0 });
    capturer.ran(10_000_000);
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toHaveLength(0);
  });

  it('stops capturing and forgets the running time once reset for a new world', async () => {
    const { capturer, posts, lines } = rig();
    capturer.configure(on);
    capturer.ran(119_000);
    capturer.reset();
    capturer.ran(119_000);
    await capturer.capture('manual');
    capturer.configure(on);
    capturer.ran(119_000);
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });

  it('logs a capture that could not be spooled under its capture id', async () => {
    const { capturer, lines } = rig(true);
    capturer.configure(on);
    await capturer.capture('periodic');
    expect(lines[1]).toBe('ledger failed cap=1a2b3c4d-0 error="status 500"');
  });
});
