import { describe, it, expect } from 'vitest';
import type { DroppedItem } from '$lib/game/core/types';
import type { WebGLRenderer } from '$lib/webgl/renderer';
import { stackBadges } from '$lib/components/UI/canvas/stackBadges';
import { drawnItemTile, hoveredDrop } from '$lib/components/UI/canvas/drawnSelection';

const drop = (resourceId: string, x: number, y: number, quantity: number) =>
  ({ id: `${resourceId}@${x},${y}`, resourceId, x, y, quantity }) as DroppedItem;
const view = { viewX: 10, viewY: 20, tileWidth: 32, tileHeight: 32 };

describe('stack counts on the map', () => {
  it('writes the total of a tile at its lower right corner, and nothing for a single item', () => {
    const drops = [drop('oak_log', 11, 21, 4), drop('iron_bar', 11, 21, 3), drop('saw', 12, 21, 1)];
    expect(stackBadges(drops, view, 640, 480)).toEqual([{ label: '7', x: 63, y: 63 }]);
  });

  it('moves with a prop drawn off its tile, by the offset of the prop in base pixels', () => {
    const drops = [drop('steel_longsword', 11, 21, 2)];
    const offset = (x: number, y: number) => (x === 11 && y === 21 ? { x: -8, y: -15 } : undefined);
    expect(stackBadges(drops, view, 640, 480, offset)).toEqual([{ label: '2', x: 47, y: 33 }]);
  });

  it('caps the label and skips tiles outside the canvas and a map zoomed far out', () => {
    expect(stackBadges([drop('oak_log', 11, 21, 5000)], view, 640, 480)[0].label).toBe('999+');
    expect(stackBadges([drop('oak_log', 60, 21, 5)], view, 640, 480)).toEqual([]);
    expect(stackBadges([drop('oak_log', 11, 21, 5)], { ...view, tileWidth: 8 }, 640, 480)).toEqual(
      []
    );
  });
});

describe('the drop under the cursor', () => {
  const drops = [drop('steel_longsword', 11, 21, 1), drop('oak_log', 12, 21, 9)];
  const drawing = (layer: string, x: number, y: number) =>
    ({ drawnAt: () => ({ layer, x, y }) }) as unknown as WebGLRenderer;

  it('is the one whose prop the cursor is over, even from the tile next to it', () => {
    const over = drawnItemTile(drawing('item', 11, 21), 70, 40, view);
    expect(over).toBe('11,21');
    expect(hoveredDrop(drops, 12, 21, over)!.resourceId).toBe('steel_longsword');
  });

  it('is the one lying on the hovered tile when the cursor is over no prop', () => {
    expect(drawnItemTile(drawing('building', 11, 21), 70, 40, view)).toBe('');
    expect(drawnItemTile(null, 70, 40, view)).toBe('');
    expect(hoveredDrop(drops, 12, 21, '')!.resourceId).toBe('oak_log');
    expect(hoveredDrop(drops, 14, 21, '')).toBeNull();
  });

  it('is nothing once the cursor has left the map', () => {
    expect(hoveredDrop(drops, -1, -1, '11,21')).toBeNull();
  });
});
