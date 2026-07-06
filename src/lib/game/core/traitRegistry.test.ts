import { describe, it, expect } from 'vitest';
import { TRAIT_DATABASE } from './Race';
import { getTransientConditionDef } from './needs';
import raritiesData from '../database/rarities.jsonc';
import type { Trait } from './types';

// Every trait + legendary sub-capability.
const ALL: Trait[] = TRAIT_DATABASE.flatMap((t) => [t, ...(t.subCapabilities ?? [])]);
const RARITY_IDS = new Set((raritiesData as { id: string }[]).map((r) => r.id));
const KINDS = new Set(['stat', 'attribute', 'naturalGear', 'passive', 'wound']);
const STAT_KEYS = new Set([
  'strengthBonus', 'dexterityBonus', 'intelligenceBonus', 'perceptionBonus', 'charismaBonus',
  'constitutionBonus', 'strengthPenalty', 'dexterityPenalty', 'intelligencePenalty',
  'perceptionPenalty', 'charismaPenalty', 'constitutionPenalty'
]);

describe('TRAIT-SYSTEM-V2 trait registry', () => {
  it('every trait has a valid rarity + kind', () => {
    for (const t of ALL) {
      if (t.rarity) expect(RARITY_IDS.has(t.rarity), `${t.id} rarity ${t.rarity}`).toBe(true);
      expect(KINDS.has(t.kind ?? ''), `${t.id} kind ${t.kind}`).toBe(true);
    }
  });

  it('kind matches payload: stat = core-stats only, naturalGear links a granting condition', () => {
    for (const t of ALL) {
      if (t.kind === 'stat') {
        for (const k of Object.keys(t.effects ?? {}))
          expect(STAT_KEYS.has(k), `${t.id} stat-kind but has effect ${k}`).toBe(true);
      }
      if (t.kind === 'naturalGear') {
        expect(t.selfCondition, `${t.id} naturalGear needs selfCondition`).toBeTruthy();
        const cond = getTransientConditionDef(t.selfCondition!);
        const grants = !!(cond?.grantsNaturalWeapon?.length || cond?.grantsNaturalArmor);
        expect(grants, `${t.id} → ${t.selfCondition} grants nothing`).toBe(true);
      }
    }
  });

  it('rarity budget: rare/epic are a real capability; legendary is a bundle', () => {
    for (const t of TRAIT_DATABASE) {
      if (t.rarity === 'rare' || t.rarity === 'epic') {
        const capable =
          !!t.selfCondition || !!t.onHitEffect || !!t.weaponBonus || (t.subCapabilities?.length ?? 0) > 0;
        expect(capable, `${t.id} (${t.rarity}) carries no capability`).toBe(true);
      }
      if (t.rarity === 'legendary')
        expect((t.subCapabilities?.length ?? 0) > 0, `${t.id} legendary needs subCapabilities`).toBe(true);
    }
    // every evolvesTo target exists
    const ids = new Set(ALL.map((t) => t.id));
    for (const t of ALL) if (t.evolvesTo) expect(ids.has(t.evolvesTo), `evolvesTo ${t.evolvesTo}`).toBe(true);
  });

  it('§6 gamification purge: the illogical work bonuses are gone', () => {
    const byId = Object.fromEntries(ALL.filter((t) => t.id).map((t) => [t.id!, t]));
    const ws = (id: string) => (byId[id]?.effects as { workSpeed?: Record<string, number> })?.workSpeed;
    expect(ws('iron-skin')?.mining).toBeUndefined(); // metallic skin ≠ mining
    expect(ws('frost-born')?.fishing).toBeUndefined(); // cold resistance ≠ fishing skill
    expect(ws('strong-backed')?.mining).toBeUndefined();
    expect(ws('feathered')?.foraging).toBeUndefined();
    expect(ws('berserker-blood')?.hunting).toBeUndefined();
    expect(ws('nocturnal')?.hunting).toBeUndefined();
    // amphibious→fishing is LOGICAL and stays
    expect(ws('amphibious')?.fishing).toBeGreaterThan(1);
  });
});
