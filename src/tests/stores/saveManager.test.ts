import { describe, it, expect, vi, afterEach } from 'vitest';
import { installFakeIndexedDb } from './fakeIndexedDb';
import type { GameState, WorldTile } from '$lib/game/core/types';

vi.mock('$app/environment', () => ({
  browser: true,
  dev: false,
  building: false,
  version: 'test'
}));

const stored = installFakeIndexedDb();
const { setActiveSave, scheduleSave, saveGameNow, loadSave } =
  await import('$lib/stores/saveManager');

const tile = (x: number, extra: Partial<WorldTile> = {}): WorldTile =>
  ({
    x,
    y: 0,
    type: 'land',
    terrainType: 'mountain',
    subType: 'granite',
    walkable: false,
    movementCost: 1,
    resources: {},
    ascii: '#',
    gCost: 7,
    hCost: 7,
    fCost: 14,
    parent: { x: 0, y: 0 },
    ...extra
  }) as unknown as WorldTile;

const world = (): GameState =>
  ({
    turn: 0,
    seed: 5,
    pawns: [],
    worldMap: [[tile(0), tile(1, { subType: 'cliff' })]]
  }) as unknown as GameState;

afterEach(() => vi.useRealTimers());

describe('autosave', () => {
  it('writes the world map with the rest of the save once the debounce elapses', async () => {
    vi.useFakeTimers();
    setActiveSave('auto-1');
    scheduleSave(world());
    await vi.advanceTimersByTimeAsync(2500);
    vi.useRealTimers();
    expect(stored.has('world:auto-1')).toBe(true);
    const loaded = await loadSave('auto-1');
    expect(loaded?.worldMap[0]).toHaveLength(2);
  });
});

describe('loading a save', () => {
  it('rebuilds the pathfinding fields the save leaves out', async () => {
    setActiveSave('load-1');
    await saveGameNow(world());
    const loaded = await loadSave('load-1');
    expect(loaded?.worldMap[0][0]).toMatchObject({
      ascii: ' ',
      gCost: 0,
      hCost: 0,
      fCost: 0,
      parent: null
    });
  });

  it('turns a retired cliff tile into a walkable cave', async () => {
    setActiveSave('load-2');
    await saveGameNow(world());
    const loaded = await loadSave('load-2');
    expect(loaded?.worldMap[0][1].subType).toBe('cave');
    expect(loaded?.worldMap[0][1].walkable).toBe(true);
  });
});
