import { describe, it, expect } from 'vitest';
import { mulberry32, SeededRng, rng, freshSeed } from '$lib/game/core/rng';

describe('rng (P0-2 seeded determinism)', () => {
  it('mulberry32 is deterministic for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toEqual(b());
  });

  it('mulberry32 stays within [0, 1)', () => {
    const r = mulberry32(999);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('SeededRng.reseed replays the same sequence', () => {
    const r = new SeededRng(42);
    const first = [r.random(), r.random(), r.random()];
    r.reseed(42);
    const second = [r.random(), r.random(), r.random()];
    expect(first).toEqual(second);
  });

  it('int() is inclusive of both bounds and within range', () => {
    const r = new SeededRng(7);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('pick() returns an element of the array', () => {
    const r = new SeededRng(7);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(arr).toContain(r.pick(arr));
  });

  it('the shared sim rng singleton is reseedable and reproducible', () => {
    rng.reseed(2026);
    const a = [rng.random(), rng.random()];
    rng.reseed(2026);
    const b = [rng.random(), rng.random()];
    expect(a).toEqual(b);
  });

  it('freshSeed returns a uint32', () => {
    const s = freshSeed();
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(s)).toBe(true);
  });
});
