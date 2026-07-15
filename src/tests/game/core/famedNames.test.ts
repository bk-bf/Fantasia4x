import { describe, it, expect } from 'vitest';
import { mulberry32 } from '$lib/game/core/rng';
import {
  rollFamed,
  rollFamedStatMult,
  rollFamedEnchants,
  generateFamedName,
  generateFamedHistory,
  rollFamedIdentity,
  FAMED_ENCHANT_POOL
} from '$lib/game/core/famedNames';

// PRODUCTION-CHAIN-III §I — the pure, deterministic core of the Famed-item feature.
describe('famed items (§I) — procedural identity + roll math', () => {
  it('generates a non-empty name and multi-clause history', () => {
    const rand = mulberry32(42);
    const name = generateFamedName(rand);
    const history = generateFamedHistory(rand);
    expect(name).toMatch(/, /); // "<Name>, <epithet>"
    expect(name.length).toBeGreaterThan(5);
    expect(history).toMatch(/Forged by/);
    expect(history.length).toBeGreaterThan(10);
  });

  it('is deterministic for a given seed', () => {
    expect(generateFamedName(mulberry32(7))).toBe(generateFamedName(mulberry32(7)));
    expect(rollFamedIdentity(mulberry32(7))).toEqual(rollFamedIdentity(mulberry32(7)));
  });

  it('stat-explosion multiplier stays within ×2–5', () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const m = rollFamedStatMult(rand);
      expect(m).toBeGreaterThanOrEqual(2);
      expect(m).toBeLessThanOrEqual(5);
    }
  });

  it('rolls 1–3 distinct enchants from the pool', () => {
    const rand = mulberry32(123);
    for (let i = 0; i < 500; i++) {
      const e = rollFamedEnchants(rand);
      expect(e.length).toBeGreaterThanOrEqual(1);
      expect(e.length).toBeLessThanOrEqual(3);
      expect(new Set(e).size).toBe(e.length); // distinct
      for (const id of e) expect(FAMED_ENCHANT_POOL).toContain(id);
    }
  });

  it('rollFamed is impossible below the master skill floor', () => {
    const rand = mulberry32(1);
    for (let i = 0; i < 5000; i++) expect(rollFamed(1.5, true, rand)).toBe(false);
  });

  it('rollFamed is vanishingly rare even for a master at an arcane station, but reachable', () => {
    const rand = mulberry32(2024);
    let famed = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) if (rollFamed(2.0, true, rand)) famed++;
    const rate = famed / N;
    expect(rate).toBeGreaterThan(0); // reachable
    expect(rate).toBeLessThan(0.05); // but a rare jackpot, not a tier you target
  });
});
