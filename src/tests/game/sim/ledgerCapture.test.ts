import { describe, it, expect } from 'vitest';
import { LedgerCapturer, type LedgerCaptureMeta } from '$lib/game/sim/ledgerCapture';
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
    resources: {},
    ascii: '.',
    gCost: 3,
    hCost: 3,
    fCost: 6,
    parent: null
  }) as unknown as WorldTile;

const state = {
  turn: 30058,
  seed: 4242,
  pawns: [{ id: 'p1' }],
  mobs: [{ id: 'm1' }, { id: 'm2' }],
  worldMap: [[tile(0), tile(1), tile(2)]],
  generatedBy: { commit: 'a96826d3'.padEnd(40, '0'), branch: 'test/look-overhaul', dirty: 0 }
} as unknown as GameState;

function rig(fail = false) {
  const lines: string[] = [];
  const posts: { text: string; meta: LedgerCaptureMeta }[] = [];
  let clock = 1000;
  const capturer = new LedgerCapturer({
    state: () => state,
    speed: () => 4,
    now: () => (clock += 7),
    clock: () => new Date('2026-11-27T01:37:00.000Z'),
    savedBy: 'b'.repeat(40),
    log: (_turn, message) => lines.push(message),
    post: async (body, meta) => {
      if (fail) throw new Error('status 500');
      posts.push({ text: await body.text(), meta });
      return { save: `world-${posts.length}`, entry: `entry-${posts.length}` };
    }
  });
  return { capturer, lines, posts };
}

const on = { on: true, intervalMs: 120_000, save: 'slot-1', scenario: null };

describe('the ledger capture in the sim worker', () => {
  it('sends the whole state as a snapshot the headless loader reads back', async () => {
    const { capturer, posts } = rig();
    capturer.configure(on);
    await capturer.capture('session');
    const back = fromSnapshot(JSON.parse(posts[0].text));
    expect(back.turn).toBe(30058);
    expect(back.mobs).toHaveLength(2);
    expect(back.worldMap[0]).toHaveLength(3);
    expect(posts[0].meta).toMatchObject({
      reason: 'session',
      turn: 30058,
      seed: 4242,
      map: '3x1',
      pawns: 1,
      mobs: 2,
      speed: 4,
      save: 'slot-1',
      generatedBy: state.generatedBy?.commit,
      savedBy: 'b'.repeat(40),
      parent: null
    });
  });

  it('logs the world id with the turn, the start time and how long the capture held the sim', async () => {
    const { capturer, lines, posts } = rig();
    capturer.configure(on);
    await capturer.capture('session');
    expect(lines).toEqual([
      `ledger save=world-1 reason=session turn=30058 at=2026-11-27T01:37:00.000Z ms=7 speed=4x bytes=${posts[0].text.length} entry=entry-1`
    ]);
  });

  it('captures periodically only once the game has run for the whole interval', async () => {
    const { capturer, posts } = rig();
    capturer.configure(on);
    capturer.ran(60_000);
    capturer.ran(59_000);
    expect(posts).toHaveLength(0);
    capturer.ran(1_000);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(posts.map((p) => p.meta.reason)).toEqual(['periodic']);
  });

  it('ties later captures of a session to the capture the session began with', async () => {
    const { capturer, posts } = rig();
    capturer.configure(on);
    await capturer.capture('session');
    await capturer.capture('manual', 'slot-2');
    expect(posts[1].meta).toMatchObject({ reason: 'manual', save: 'slot-2', parent: 'entry-1' });
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

  it('logs a capture that could not be spooled', async () => {
    const { capturer, lines } = rig(true);
    capturer.configure(on);
    await capturer.capture('periodic');
    expect(lines[0]).toMatch(/^ledger failed reason=periodic turn=30058 .* error="status 500"$/);
  });
});
