import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { pathfinderService, patchPathfindingWalkable } from '$lib/game/services/PathfinderService';
import { setSimLogSink, simLog, type SimLogSink } from '$lib/game/core/util/logSink';
import type { Pawn } from '$lib/game/core/types';

type Entry = Parameters<SimLogSink['logActivity']>[0];

const W = 24;
const H = 24;
const restore: Array<() => void> = [];

afterEach(() => {
  restore.splice(0).forEach((undo) => undo());
  vi.restoreAllMocks();
});

async function session(count: number): Promise<HeadlessSession> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: 17,
      map: { w: W, h: H },
      pawns: [{ count, drafted: true }],
      needsDisabled: ['hunger', 'fatigue', 'thirst'],
      seedEntities: false
    })
  );
  return s;
}

function wallColumn(s: HeadlessSession, x: number): void {
  const map = s.getState().worldMap;
  for (let y = 0; y < H; y++) {
    map[y][x].walkable = false;
    patchPathfindingWalkable(x, y, false);
  }
}

function blockedEntries(): Entry[] {
  const entries: Entry[] = [];
  const prev = simLog;
  setSimLogSink({
    ...prev,
    logActivity: (e: Entry) => {
      if (e.action === 'Blocked') entries.push(e);
      return '';
    }
  });
  restore.push(() => setSimLogSink(prev));
  return entries;
}

function searchesTo(spy: { mock: { calls: unknown[][] } }, x: number, y: number): number {
  return spy.mock.calls.filter((a) => a[6] === x && a[7] === y).length;
}

const farX = (pawns: Pawn[]) => Math.max(...pawns.map((p) => p.position!.x));

describe('a move order to a tile the pawn cannot reach', () => {
  it('is refused before any path search, with one chronicle entry', async () => {
    const s = await session(1);
    s.tick(5);
    const pawn = s.getState().pawns[0];
    const { x, y } = pawn.position!;
    wallColumn(s, x + 3);
    const entries = blockedEntries();
    const search = vi.spyOn(pathfinderService, 'findPath');

    s.command({
      type: 'setPawnDraftTarget',
      payload: { pawnId: pawn.id, target: { type: 'move', x: x + 6, y } }
    } as never);
    s.tick(200);

    const searches = searchesTo(search, x + 6, y);
    console.log(
      `[MOVE unreachable] 200 ticks, searches to the target ${searches}, chronicle entries ${entries.length}`
    );
    expect(searches).toBe(0);
    expect(s.getState().pawns[0].draftTarget).toBeUndefined();
    expect(entries).toHaveLength(1);
    expect(entries[0].entityIds).toEqual([pawn.id]);
  });

  it('still walks a move on its own side of the wall', async () => {
    const s = await session(1);
    const pawn = s.getState().pawns[0];
    const { x, y } = pawn.position!;
    wallColumn(s, x + 3);
    const entries = blockedEntries();
    const goal = { x: x - 4, y: y + 2 };

    s.command({
      type: 'setPawnDraftTarget',
      payload: { pawnId: pawn.id, target: { type: 'move', ...goal } }
    } as never);
    const at = () => s.getState().pawns[0].position!;
    let ticks = 0;
    for (; ticks < 1000 && !(at().x === goal.x && at().y === goal.y); ticks += 50) s.tick(50);

    console.log(`[MOVE reachable] arrived at ${JSON.stringify(at())} within ${ticks} ticks`);
    expect(at()).toEqual(goal);
    expect(entries).toHaveLength(0);
  });

  it.each([
    ['movePawnsFormation', (ids: string[], x: number, y: number) => ({ ids, x, y })],
    [
      'movePawnsLine',
      (ids: string[], x: number, y: number) => ({ ids, ax: x, ay: y - 1, bx: x, by: y + 1 })
    ]
  ])('%s refuses every pawn it cannot bring across', async (type, payload) => {
    const s = await session(3);
    const pawns = s.getState().pawns;
    const ids = pawns.map((p) => p.id);
    const x = farX(pawns);
    const y = pawns[0].position!.y;
    wallColumn(s, x + 2);
    const entries = blockedEntries();

    s.command({ type, payload: payload(ids, x + 5, y) } as never);
    s.tick(50);

    expect(s.getState().pawns.map((p) => p.draftTarget)).toEqual([undefined, undefined, undefined]);
    expect(entries.map((e) => e.entityIds?.[0]).sort()).toEqual([...ids].sort());
  });
});
