import { describe, it, expect } from 'vitest';
import { FLOW_RES, riverField, type RiverInput } from '$lib/webgl/painted/riverFlow';
import { riverTiles } from '$lib/webgl/painted/riverGrid';
import { riverKey } from '$lib/webgl/painted/riverTextures';

const W = 48;
const H = 30;
const ROW = 12;
const MOUTH = 30;
const EAST = 5;
const SOUTH = 7;
const UNITS = 16;

function map(opts: { tributary?: boolean } = {}): RiverInput {
  const n = W * H;
  const water = new Uint8Array(n);
  const tiles = riverTiles(n);
  for (let y = 0; y < H; y++)
    for (let x = MOUTH; x < W; x++) if (Math.abs(y - ROW) < 10) water[y * W + x] = 1;
  for (let x = 0; x < MOUTH; x++)
    for (let dy = -1; dy <= 1; dy++) {
      water[(ROW + dy) * W + x] = 1;
      tiles.river[(ROW + dy) * W + x] = 1;
    }
  for (let x = 0; x < MOUTH; x++) {
    const i = ROW * W + x;
    tiles.down[i] = EAST;
    tiles.discharge[i] = 2 + x * 0.2;
    tiles.slope[i] = 0.002;
  }
  if (opts.tributary)
    for (let y = 0; y < ROW; y++) {
      const i = y * W + 14;
      water[i] = 1;
      tiles.river[i] = 1;
      tiles.down[i] = SOUTH;
      tiles.discharge[i] = 1.5;
      tiles.slope[i] = 0.002;
    }
  return { w: W, h: H, water, tiles, unitsPerTile: UNITS };
}

function flowAt(flow: Uint8Array, x: number, y: number) {
  const t = (Math.floor(y * FLOW_RES) * W * FLOW_RES + Math.floor(x * FLOW_RES)) * 4;
  return {
    dx: (flow[t] - 127.5) / 127.5,
    dy: (flow[t + 1] - 127.5) / 127.5,
    sp: flow[t + 2],
    mask: flow[t + 3]
  };
}

function streamAt(stream: Float32Array, x: number, y: number) {
  const t = (y * W + x) * 4;
  return { along: stream[t], across: stream[t + 1], ux: stream[t + 2], uy: stream[t + 3] };
}

describe('the river flow field', () => {
  const field = riverField(map())!;

  it('runs downstream along the course and fills the river mask', () => {
    for (const x of [4, 12, 20, 26]) {
      const f = flowAt(field.flow, x + 0.5, ROW + 0.5);
      expect(f.dx).toBeGreaterThan(0.9);
      expect(Math.abs(f.dy)).toBeLessThan(0.2);
      expect(f.mask).toBeGreaterThan(240);
      expect(f.sp).toBeGreaterThan(0);
    }
  });

  it('runs slower at the banks than on the centreline', () => {
    const mid = flowAt(field.flow, 15.5, ROW + 0.5).sp;
    const bank = flowAt(field.flow, 15.5, ROW - 1.25).sp;
    expect(bank).toBeLessThan(mid);
  });

  it('leaves land far from the river and the far lake still', () => {
    expect(flowAt(field.flow, 10.5, ROW + 10.5).mask).toBe(0);
    expect(flowAt(field.flow, W - 1.5, ROW - 8.5).mask).toBe(0);
  });

  it('carries a plume a few tiles into the lake past the mouth', () => {
    const f = flowAt(field.flow, MOUTH + 2.5, ROW + 0.5);
    expect(f.mask).toBeGreaterThan(64);
    expect(f.dx).toBeGreaterThan(0.8);
  });

  it('lays the stream out as distance along and across the course', () => {
    let last = -Infinity;
    for (let x = 2; x < MOUTH; x += 3) {
      const s = streamAt(field.stream, x, ROW);
      expect(s.along).toBeGreaterThan(last);
      last = s.along;
      expect(Math.abs(s.across)).toBeLessThan(1);
      expect(s.ux).toBeGreaterThan(0);
      expect(Math.abs(s.uy)).toBeLessThan(1e-3);
    }
    const north = streamAt(field.stream, 15, ROW - 1).across;
    const south = streamAt(field.stream, 15, ROW + 1).across;
    expect(Math.sign(north)).toBe(-Math.sign(south));
    expect(Math.abs(north)).toBeCloseTo(UNITS, 0);
  });

  it('keeps the stream continuous where a tributary joins', () => {
    const joined = riverField(map({ tributary: true }))!;
    const into = streamAt(joined.stream, 14, ROW - 1).along;
    const at = streamAt(joined.stream, 14, ROW).along;
    const step = Math.abs(streamAt(joined.stream, 15, ROW).along - at);
    expect(Math.abs(at - into)).toBeLessThan(step * 3);
    expect(at).toBeGreaterThan(into);
  });

  it('builds nothing on a map with no river', () => {
    const plain = map();
    plain.tiles.down.fill(-1);
    expect(riverField(plain)).toBeNull();
  });
});

describe('the river field key', () => {
  it('only changes when the river or the water around it changes', () => {
    const input = map();
    const field = riverField(input)!;
    const key = riverKey(input, field.active);
    expect(riverKey(map(), field.active)).toBe(key);
    const far = map();
    far.water[(H - 1) * W] = 1;
    expect(field.active[(H - 1) * W]).toBe(0);
    expect(riverKey(far, field.active)).toBe(key);
    const bank = map();
    bank.water[(ROW + 2) * W + 10] = 1;
    expect(riverKey(bank, field.active)).not.toBe(key);
    const slower = map();
    slower.tiles.slope[ROW * W + 5] = 0.004;
    expect(riverKey(slower, field.active)).not.toBe(key);
  });
});
