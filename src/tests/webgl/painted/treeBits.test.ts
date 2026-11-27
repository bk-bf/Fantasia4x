import { describe, it, expect } from 'vitest';
import sway from '../../../../static/tilesets/painted/sway.json';
import { BIT_FLOATS, SHAPE, TreeBits, windLevel } from '$lib/webgl/painted/treeBits';
import type { PaintedSprite, TreeFx } from '$lib/webgl/painted/manifest';

const FX = sway.fx as unknown as Record<string, TreeFx>;
const sprite = (id: string): PaintedSprite & { fx: TreeFx } => ({
  u1: 0,
  v1: 0,
  u2: 0.1,
  v2: 0.1,
  ox: -1,
  oy: -5,
  w: 3,
  h: 6,
  sway: 3.4,
  fx: FX[id]
});

const wind = (strength: number) => ({
  dir: { x: 1, y: 0 },
  scroll: 0,
  idle: 1,
  clock: 3,
  strength,
  scale: Math.min(2.2, strength / 0.45)
});

function seeded() {
  let s = 7;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function run(id: string, strength: number, seconds: number) {
  const bits = new TreeBits(seeded());
  const frame = {
    view: { x: 0, y: 0, w: 10, h: 10 },
    artTile: 32,
    fxAt: (x: number, y: number) => (x === 4 && y === 6 ? sprite(id) : undefined)
  };
  for (let t = 0; t < seconds; t += 0.05) bits.step(0.05, wind(strength), frame);
  const out = bits.pack(wind(strength), frame);
  const shapes = Array.from({ length: out.length / BIT_FLOATS }, (_, i) => out[i * BIT_FLOATS + 9]);
  return { bits, shapes };
}

describe('the bits a magical tree sheds', () => {
  it('reads the wind words of the mockup from the weather strength', () => {
    expect([0, 0.36, 0.6, 0.95].map(windLevel)).toEqual([0, 1, 2, 3]);
  });

  it('licks flame along an emberwood crown every frame, and none along an oak', () => {
    const ember = run('trees/emberwood/mature/summer/0', 0.36, 0.1);
    expect(ember.shapes.filter((s) => s === SHAPE.dot).length).toBeGreaterThan(20);
    expect(FX['trees/oak/mature/summer/0']).toBeUndefined();
  });

  it('sheds more snow from a frostheart in a gale than in a breeze', () => {
    const breeze = run('trees/frostheart/mature/winter/0', 0.36, 6);
    const gale = run('trees/frostheart/mature/winter/0', 0.95, 6);
    const puffs = (r: ReturnType<typeof run>) => r.bits.bits.filter((b) => b.k === 'puff').length;
    expect(puffs(gale)).toBeGreaterThan(puffs(breeze));
  });

  it('hangs the moonwood orbs on the crown as crosses of light', () => {
    const moon = run('trees/moonwood/mature/summer/0', 0.36, 0.1);
    expect(moon.shapes.filter((s) => s === SHAPE.plus).length).toBe(
      FX['trees/moonwood/mature/summer/0'].orbs!.length / 3
    );
  });

  it('lets every apple land on the ground below the tree and stay there', () => {
    const apples = run('trees/apple/mature/summer/0', 0.36, 30).bits.bits.filter(
      (b) => b.k === 'apple'
    );
    expect(apples.length).toBeGreaterThan(0);
    for (const a of apples) if (a.age > 3) expect(a.y).toBeLessThanOrEqual(a.floor!);
  });
});
