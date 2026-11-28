import { describe, it, expect } from 'vitest';
import {
  resolveSpriteLights,
  SPRITE_LIGHT_MARGIN,
  type EmitSource
} from '$lib/webgl/painted/spriteLights';
import type { PointLight } from '$lib/webgl/painted/lightGrade';

const emit = {
  x: 12,
  y: 30,
  rad: 40,
  col: [1, 0.6, 0.2] as [number, number, number],
  flicker: true
};

function countingGrid(at: Array<[number, number]>) {
  let lookups = 0;
  const hit = new Set(at.map(([x, y]) => `${x},${y}`));
  const grid: EmitSource = {
    getTile(x, y) {
      lookups++;
      return hit.has(`${x},${y}`) ? { painted: { emit } } : undefined;
    }
  };
  return { grid, lookups: () => lookups };
}

const light = (x: number, y: number): PointLight => ({
  x,
  y,
  color: [1, 1, 1],
  radius: 3,
  intensity: 1
});
const view = { x: 100, y: 100, w: 20, h: 12 };

describe('resolveSpriteLights', () => {
  it('gives a light in view its sprite art', () => {
    const { grid } = countingGrid([[105, 105]]);
    const [out] = resolveSpriteLights([light(105, 105)], [grid], view);
    expect(out).toMatchObject({
      color: emit.col,
      flicker: true,
      art: { x: 12, y: 30, rad: 40, night: false }
    });
  });

  it('looks up no tile for a light far outside the view', () => {
    const { grid, lookups } = countingGrid([[5, 5]]);
    const far = light(5, 5);
    const [out] = resolveSpriteLights([far], [grid], view);
    expect(out).toBe(far);
    expect(lookups()).toBe(0);
  });

  it('still resolves a light just outside the view whose glow reaches in', () => {
    const edge = light(view.x - 3 - SPRITE_LIGHT_MARGIN, 105);
    const { grid } = countingGrid([[edge.x, edge.y]]);
    const [out] = resolveSpriteLights([edge], [grid], view);
    expect(out.art).toBeDefined();
  });

  it('keeps every light in its place, so flicker indices do not shift', () => {
    const lights = [light(5, 5), light(105, 105), light(900, 900)];
    const { grid } = countingGrid([[105, 105]]);
    const out = resolveSpriteLights(lights, [grid], view);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(lights[0]);
    expect(out[2]).toBe(lights[2]);
  });

  it('takes the first layer that has art at the tile', () => {
    const first = countingGrid([]);
    const second = countingGrid([[105, 105]]);
    const [out] = resolveSpriteLights([light(105, 105)], [null, first.grid, second.grid], view);
    expect(out.art?.rad).toBe(40);
  });
});
