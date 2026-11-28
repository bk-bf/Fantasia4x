import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorldTile } from '$lib/game/core/types';

const flags = vi.hoisted(() => ({ painted: false }));

vi.mock('$lib/webgl/painted/flag.js', async (actual) => ({
  ...(await actual<object>()),
  get PAINTED_TILES() {
    return flags.painted;
  }
}));

const snowy = (x: number, y: number): WorldTile =>
  ({
    x,
    y,
    type: 'grass',
    subType: 'grass',
    walkable: true,
    snow: 90,
    ice: 40,
    resources: {}
  }) as unknown as WorldTile;

const map = [0, 1].map((y) => [0, 1].map((x) => snowy(x, y)));

async function build() {
  const { fullRebuildTerrain } = await import('$lib/components/UI/canvas/terrainPaint');
  return fullRebuildTerrain(map, [], () => '');
}

describe('ground snow cover', () => {
  beforeEach(() => vi.resetModules());

  it('paints snow and ice over the ground in the glyph look', async () => {
    flags.painted = false;
    const { snowGrid } = await build();
    expect(snowGrid?.getTile(0, 0)).toBeTruthy();
  });

  it('leaves the painted ground bare while snow lies on it', async () => {
    flags.painted = true;
    const { snowGrid, terrainGrid } = await build();
    expect(snowGrid).toBeNull();
    expect(terrainGrid.getTile(0, 0)).toBeTruthy();
  });
});
