import { describe, it, expect } from 'vitest';
import { mulberry32, makeSeededRng, SeededRng, rng, freshSeed } from '$lib/game/core/util/rng';

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

  it('SeededRng.random() stays within [0, 1) and advances the stream', () => {
    const r = new SeededRng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = r.random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      seen.add(v);
    }
    expect(seen.size).toBeGreaterThan(400);
  });

  it('makeSeededRng is deterministic for a seed, diverges across seeds, and stays within [0, 1)', () => {
    const a = makeSeededRng(4242);
    const b = makeSeededRng(4242);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);

    const c = makeSeededRng(9999);
    expect(seqA[0]).not.toBe(c());

    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range() covers the whole [min, max) span, not just a slice of it', () => {
    const r = new SeededRng(31);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 2000; i++) {
      const v = r.range(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(7);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeLessThan(3.5);
    expect(max).toBeGreaterThan(6.5);
  });

  it('int() is inclusive of both bounds, reaches the upper bound, and stays in range', () => {
    const r = new SeededRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect(seen.has(6)).toBe(true);
    expect(seen.has(3)).toBe(true);
  });

  it('chance() is never true at p<=0 and never false at p>=1', () => {
    const r = new SeededRng(19);
    for (let i = 0; i < 200; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });

  it('chance(p) fires at roughly the rate p over many draws', () => {
    const r = new SeededRng(19);
    let hits = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (r.chance(0.3)) hits++;
    expect(hits / n).toBeGreaterThan(0.25);
    expect(hits / n).toBeLessThan(0.35);
  });

  it('pick() reaches more than one element and is deterministic for a seed', () => {
    const r = new SeededRng(7);
    const arr = ['a', 'b', 'c'];
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const v = r.pick(arr);
      expect(arr).toContain(v);
      seen.add(v);
    }
    expect(seen.size).toBeGreaterThan(1);

    const r1 = new SeededRng(7);
    const r2 = new SeededRng(7);
    expect(r1.pick(arr)).toBe(r2.pick(arr));
  });

  it('gaussian() is centred on its mean, not always on 0', () => {
    const r = new SeededRng(5);
    const n = 3000;
    let sumZero = 0;
    for (let i = 0; i < n; i++) sumZero += r.gaussian(0, 1);
    expect(sumZero / n).toBeCloseTo(0, 0);

    const r2 = new SeededRng(5);
    let sumShifted = 0;
    for (let i = 0; i < n; i++) sumShifted += r2.gaussian(10, 1);
    expect(sumShifted / n).toBeGreaterThan(9.5);
    expect(sumShifted / n).toBeLessThan(10.5);
  });

  it('the shared sim rng singleton is reseedable and reproducible', () => {
    rng.reseed(2026);
    const a = [rng.random(), rng.random()];
    rng.reseed(2026);
    const b = [rng.random(), rng.random()];
    expect(a).toEqual(b);
  });

  it('freshSeed returns a uint32 and differs between calls', () => {
    const s = freshSeed();
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(s)).toBe(true);

    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) seen.add(freshSeed());
    expect(seen.size).toBeGreaterThan(1);
  });
});
