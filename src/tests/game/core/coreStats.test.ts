import { describe, it, expect } from 'vitest';
import { CORE_STATS, CORE_STAT_KEYS, CORE_STAT_ABBR } from '$lib/game/core/types';

describe('the core-stat roster is a single declaration', () => {
  it('CORE_STAT_KEYS and CORE_STAT_ABBR cover exactly the CORE_STATS roster, in order', () => {
    const ids = CORE_STATS.map((s) => s.id);
    expect(CORE_STAT_KEYS).toEqual(ids);
    expect(Object.keys(CORE_STAT_ABBR).sort()).toEqual([...ids].sort());
    for (const s of CORE_STATS) expect(CORE_STAT_ABBR[s.id]).toBe(s.abbr);
  });

  it('every abbreviation is a distinct three-letter code', () => {
    const abbrs = CORE_STATS.map((s) => s.abbr);
    expect(new Set(abbrs).size).toBe(abbrs.length);
    for (const a of abbrs) expect(a).toMatch(/^[A-Z]{3}$/);
  });
});
