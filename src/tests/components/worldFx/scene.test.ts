import { describe, expect, it } from 'vitest';
import { collectScene, type FxWorld, type MoveAim } from '$lib/components/UI/canvas/worldFx/scene';
import type { Pawn } from '$lib/game/core/types';

const on = { marks: false, work: false, health: false, draft: true };
const ground = (x: number, y: number) => [Math.round((x + 0.5) * 32), (y + 1) * 32 - 4];

function world(pawns: Pawn[], aim: MoveAim | null = null): FxWorld {
  return {
    pawns,
    mobs: [],
    pawnPos: new Map(),
    mobPos: new Map(),
    renderer: null,
    hidden: () => false,
    mobsDrawn: true,
    aim,
    view: [0, 0, 40, 40]
  };
}

const walker = (path: { x: number; y: number }[], pathIndex: number): Pawn =>
  ({
    id: 'p1',
    position: { x: 5, y: 5 },
    drafted: true,
    draftTarget: { type: 'move', x: 9, y: 2 },
    path,
    pathIndex,
    limbs: []
  }) as unknown as Pawn;

describe('draft lines', () => {
  it('follow the path the sim will walk, from where the pawn is now', () => {
    const path = [
      { x: 5, y: 5 },
      { x: 5, y: 4 },
      { x: 6, y: 3 },
      { x: 7, y: 3 },
      { x: 8, y: 2 },
      { x: 9, y: 2 }
    ];
    const [r] = collectScene(world([walker(path, 2)]), on).routes;
    expect(r.pts.slice(1, 5)).toEqual(path.slice(2).map((t) => ground(t.x, t.y)));
    expect(r.pts.at(-1)).toEqual(ground(9, 2));
  });

  it('preview the whole area a group will spread into while a move is aimed', () => {
    const slots = [
      { x: 10, y: 8 },
      { x: 12, y: 8 },
      { x: 11, y: 10 }
    ];
    const [r] = collectScene(world([], { from: [10, 8], to: [12, 8], slots }), on).routes;
    expect(r.stops).toEqual(slots.map((t) => ground(t.x, t.y)));
    expect(r.even).toBe(true);
    const [x0, y0, x1, y1] = r.boxes[0];
    for (const [x, y] of r.stops) {
      expect(x).toBeGreaterThan(x0);
      expect(x).toBeLessThan(x1);
      expect(y).toBeGreaterThan(y0);
      expect(y).toBeLessThan(y1);
    }
  });
});
