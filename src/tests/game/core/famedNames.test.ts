import { describe, it, expect } from 'vitest';
import { mulberry32 } from '$lib/game/core/util/rng';
import {
  rollFamed,
  rollFamedStatMult,
  rollFamedEnchants,
  generateFamedName,
  generateFamedHistory,
  rollFamedIdentity,
  FAMED_ENCHANT_POOL
} from '$lib/game/core/gen/famedNames';

const NAME_ROOTS = [
  'Bitter',
  'Grim',
  'Dawn',
  'Doom',
  'Sorrow',
  'Iron',
  'Ash',
  'Storm',
  'Blood',
  'Frost',
  'Wyrm',
  'Star',
  'Night',
  'Ember',
  'Gloom',
  'Thorn'
];
const NAME_SUFFIXES = [
  'mourn',
  'bane',
  'fang',
  'song',
  'rend',
  'guard',
  'reaver',
  'light',
  'fall',
  'wail',
  'bite',
  'ward'
];
const EPITHETS = [
  "the Widow's Answer",
  'Kingsfall',
  'the Last Word',
  'Oathkeeper',
  'the Pale Edge',
  "Sorrow's End",
  'the Dawnbreaker',
  'Wolfsbane',
  'the Quiet Death',
  'Ruin of Kings',
  'the Long Vigil',
  "Winter's Due"
];
const ROOT_SUFFIX_COMBOS = new Set<string>();
for (const r of NAME_ROOTS) for (const s of NAME_SUFFIXES) ROOT_SUFFIX_COMBOS.add(r + s);

describe('famed items (§I) — procedural identity + roll math', () => {
  it('generates a non-empty name and multi-clause history', () => {
    const rand = mulberry32(42);
    const name = generateFamedName(rand);
    const history = generateFamedHistory(rand);
    expect(name).toMatch(/, /);
    expect(name.length).toBeGreaterThan(5);
    expect(history).toMatch(/Forged by/);
    expect(history).toMatch(/It slew .+ at .+\./);
    expect(history.length).toBeGreaterThan(10);
  });

  it('root/suffix/epithet each come from their respective pools', () => {
    const rand = mulberry32(55);
    for (let i = 0; i < 300; i++) {
      const name = generateFamedName(rand);
      const [rootSuffix, epithet] = name.split(', ');
      expect(EPITHETS, name).toContain(epithet);
      expect(ROOT_SUFFIX_COMBOS.has(rootSuffix), rootSuffix).toBe(true);
    }
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
      expect(new Set(e).size).toBe(e.length);
      for (const id of e) expect(FAMED_ENCHANT_POOL).toContain(id);
    }
  });

  it('rollFamed is impossible below the master skill floor', () => {
    const rand = mulberry32(1);
    for (let i = 0; i < 5000; i++) expect(rollFamed(1.5, true, rand)).toBe(false);
  });

  it('the 1.7 floor is exact: zero just below it, nonzero at and above it', () => {
    const randBelow = mulberry32(3);
    for (let i = 0; i < 5000; i++) expect(rollFamed(1.699999, true, randBelow)).toBe(false);

    const randAt = mulberry32(4);
    let hitsAt = 0;
    const N = 100000;
    for (let i = 0; i < N; i++) if (rollFamed(1.7, true, randAt)) hitsAt++;
    expect(hitsAt).toBeGreaterThan(0);

    const randAbove = mulberry32(5);
    let hitsAbove = 0;
    for (let i = 0; i < N; i++) if (rollFamed(1.71, true, randAbove)) hitsAbove++;
    expect(hitsAbove).toBeGreaterThan(0);
  });

  it('arcaneStation applies exactly a 2.5x multiplier to the roll rate', () => {
    const N = 300000;
    const skill = 2.0;
    let withStation = 0;
    const randA = mulberry32(11);
    for (let i = 0; i < N; i++) if (rollFamed(skill, true, randA)) withStation++;
    let withoutStation = 0;
    const randB = mulberry32(12);
    for (let i = 0; i < N; i++) if (rollFamed(skill, false, randB)) withoutStation++;

    expect(withoutStation).toBeGreaterThan(0);
    const ratio = withStation / withoutStation;
    expect(ratio).toBeGreaterThan(2.1);
    expect(ratio).toBeLessThan(2.9);
  });

  it('rollFamed is vanishingly rare even for a master at an arcane station, but reachable', () => {
    const rand = mulberry32(2024);
    let famed = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) if (rollFamed(2.0, true, rand)) famed++;
    const rate = famed / N;
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(0.05);
  });
});
