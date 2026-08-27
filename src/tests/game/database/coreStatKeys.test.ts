import { describe, it, expect } from 'vitest';
import statsData from '$lib/game/database/pawns/stats.jsonc';
import itemsData from '$lib/game/database/items/items.jsonc';
import conditionsData from '$lib/game/database/pawns/conditions.jsonc';
import loreData from '$lib/game/database/social/culture-lore.jsonc';
import { CORE_STAT_KEYS, type StatKey } from '$lib/game/core/types';

const isCoreStat = (k: string): k is StatKey => (CORE_STAT_KEYS as readonly string[]).includes(k);

describe('core stat keys are validated against the roster, not typo-tolerant', () => {
  it('every stats.jsonc primaryStat is a real core stat', () => {
    for (const s of statsData as { id: string; primaryStat?: string }[]) {
      if (s.primaryStat == null) continue;
      expect(isCoreStat(s.primaryStat), `${s.id} primaryStat ${s.primaryStat}`).toBe(true);
    }
  });

  it('every weapon powerStat and wieldRequirement key is a real core stat', () => {
    type Weapon = {
      powerStat?: string;
      wieldRequirement?: Record<string, number>;
    };
    for (const item of itemsData as { id: string; weaponProperties?: Weapon }[]) {
      const wp = item.weaponProperties;
      if (!wp) continue;
      if (wp.powerStat != null) {
        expect(isCoreStat(wp.powerStat), `${item.id} powerStat ${wp.powerStat}`).toBe(true);
      }
      for (const k of Object.keys(wp.wieldRequirement ?? {})) {
        expect(isCoreStat(k), `${item.id} wieldRequirement key ${k}`).toBe(true);
      }
    }
  });

  it('every culture archetype statFocus/statDump entry is a real core stat', () => {
    const archetypes = (loreData as { archetypes: { name: string; statFocus: string[]; statDump: string[] }[] })
      .archetypes;
    for (const a of archetypes) {
      for (const k of [...a.statFocus, ...a.statDump]) {
        expect(isCoreStat(k), `${a.name} names ${k}`).toBe(true);
      }
    }
  });

  it('every conditions.jsonc `modifiers` key is a real core stat or a known non-stat modifier', () => {
    const NON_STAT_MODIFIER_KEYS = new Set([
      'workEfficiency',
      'moveSpeed',
      'dodge',
      'hitChance',
      'hungerRate',
      'fatigueRate',
      'thirstRate',
      'hygieneRate',
      'relaxationRate',
      'pain',
      'consciousness',
      'attackSpeed',
      'weaponDamage',
      'critChance',
      'block'
    ]);
    (function walk(o: unknown, path: string): void {
      if (Array.isArray(o)) {
        o.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (k === 'modifiers' && v && typeof v === 'object' && !Array.isArray(v)) {
          for (const mk of Object.keys(v as Record<string, unknown>)) {
            expect(
              isCoreStat(mk) || NON_STAT_MODIFIER_KEYS.has(mk),
              `${path} modifiers key ${mk}`
            ).toBe(true);
          }
        }
        walk(v, `${path}.${k}`);
      }
    })(conditionsData, 'conditions');
  });
});
