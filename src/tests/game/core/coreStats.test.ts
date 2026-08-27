import { describe, it, expect } from 'vitest';
import { CORE_STATS, CORE_STAT_KEYS, CORE_STAT_ABBR, type StatKey } from '$lib/game/core/types';
import type { Pawn } from '$lib/game/core/types';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import statsData from '$lib/game/database/pawns/stats.jsonc';

const DEFS = (statsData as { id: string; formula?: string }[]).filter((d) => d.formula);
const token = (k: StatKey) => k.toUpperCase();
const names = (formula: string, word: string) => new RegExp(`\\b${word}\\b`).test(formula);
const coreTokensIn = (formula: string) => CORE_STAT_KEYS.filter((k) => names(formula, token(k)));

function probePawn(over: Partial<Record<StatKey, number>> = {}): Pawn {
  return {
    id: 'probe',
    name: 'Probe',
    isAlive: true,
    stats: { ...Object.fromEntries(CORE_STAT_KEYS.map((k) => [k, 10])), ...over },
    physicalTraits: { weight: 70, height: 170, size: 'medium' },
    limbs: [],
    injuries: [],
    conditions: [],
    traits: [],
    equipment: {},
    skills: {},
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100
  } as unknown as Pawn;
}

const valuesFor = (pawn: Pawn) =>
  new Map(DEFS.map((d) => [d.id, pawnStatService.evaluateStat(d.id, pawn)]));

describe('the core-stat roster is a single declaration', () => {
  it('CORE_STAT_KEYS and CORE_STAT_ABBR cover exactly the CORE_STATS roster, in order', () => {
    const ids = CORE_STATS.map((s) => s.id);
    expect(CORE_STAT_KEYS).toEqual(ids);
    expect(Object.keys(CORE_STAT_ABBR)).toEqual(ids);
    for (const s of CORE_STATS) expect(CORE_STAT_ABBR[s.id]).toBe(s.abbr);
  });

  it('every entry carries a display name and a distinct three-letter abbreviation', () => {
    const abbrs = CORE_STATS.map((s) => s.abbr);
    expect(new Set(abbrs).size).toBe(abbrs.length);
    for (const s of CORE_STATS) {
      expect(s.abbr).toMatch(/^[A-Z]{3}$/);
      expect(s.name.length).toBeGreaterThan(0);
    }
  });

  it('the shared lookup answers for every stat and invents nothing else', () => {
    for (const s of CORE_STATS) expect(CORE_STAT_ABBR[s.id]).toBe(s.abbr);
    expect(Object.values(CORE_STAT_ABBR)).toEqual(CORE_STATS.map((s) => s.abbr));
  });
});

describe('the formula argument list is positionally bound to the roster', () => {
  const base = valuesFor(probePawn());

  for (const k of CORE_STAT_KEYS) {
    const own = DEFS.filter((d) => coreTokensIn(d.formula!).includes(k)).map((d) => d.id);
    const foreign = DEFS.filter((d) => {
      const t = coreTokensIn(d.formula!);
      return t.length > 0 && !t.includes(k) && !names(d.formula!, 'POWER');
    }).map((d) => d.id);

    it(`raising ${k} moves the stats that name ${token(k)} and no others`, () => {
      const raised = valuesFor(probePawn({ [k]: 30 }));
      const moved = own.filter((id) => raised.get(id) !== base.get(id));
      expect(moved.length, `no stat naming ${token(k)} responded to it`).toBeGreaterThan(0);
      for (const id of foreign) {
        expect(raised.get(id), `${id} does not name ${token(k)} but moved with it`).toBe(
          base.get(id)
        );
      }
    });
  }

  it('the derivation readout reports the same core-stat values the formula was fed', () => {
    const pawn = probePawn(
      Object.fromEntries(CORE_STAT_KEYS.map((k, i) => [k, 11 + i * 3])) as Record<StatKey, number>
    );
    const stats = pawn.stats as unknown as Record<StatKey, number>;
    let checked = 0;
    for (const d of DEFS) {
      for (const k of coreTokensIn(d.formula!)) {
        const v = pawnStatService.describeStat(pawn, d.id).vars.find((x) => x.name === token(k));
        expect(v, `${d.id} names ${token(k)} but does not report it`).toBeDefined();
        expect(Number(v!.value), `${d.id} reports the wrong ${token(k)}`).toBe(stats[k]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(CORE_STAT_KEYS.length);
  });
});
