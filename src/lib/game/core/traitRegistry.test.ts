import { describe, it, expect } from 'vitest';
import { TRAIT_DATABASE } from './Race';
import { getTransientConditionDef } from './needs';
import { PART_DEF_MAP } from './BodyParts';
import raritiesData from '../database/rarities.jsonc';
import type { Trait } from './types';

// Every trait + legendary sub-capability.
const ALL: Trait[] = TRAIT_DATABASE.flatMap((t) => [t, ...(t.subCapabilities ?? [])]);
const RARITY_IDS = new Set((raritiesData as { id: string }[]).map((r) => r.id));
const KINDS = new Set(['stat', 'attribute', 'naturalGear', 'passive', 'wound', 'bodyMod']);
const STAT_KEYS = new Set([
  'strengthBonus', 'dexterityBonus', 'intelligenceBonus', 'perceptionBonus', 'charismaBonus',
  'constitutionBonus', 'strengthPenalty', 'dexterityPenalty', 'intelligencePenalty',
  'perceptionPenalty', 'charismaPenalty', 'constitutionPenalty'
]);
// ADR-028 NAMING LAW: a stat/attribute trait's NAME must not evoke a natural weapon/armor or a losable
// body part — those imply a body-model mechanic the abstract trait lacks. Only body-touching kinds
// (bodyMod/naturalGear/passive/wound) may carry an anatomical name.
const ANATOMY_NAME_RE =
  /\b(bone|boned|skin|skinned|hide|scale|scaled|shell|carapace|claw|clawed|horn|horned|fang|fanged|tusk|eyed|one-eyed|ear|winged|feather|feathered|furred|scaled)\b/i;

describe('TRAIT-SYSTEM-V2 trait registry', () => {
  it('every trait has a valid rarity + kind', () => {
    for (const t of ALL) {
      if (t.rarity) expect(RARITY_IDS.has(t.rarity), `${t.id} rarity ${t.rarity}`).toBe(true);
      expect(KINDS.has(t.kind ?? ''), `${t.id} kind ${t.kind}`).toBe(true);
    }
  });

  it('ADR-028 strict separation: stat = core-stats only, attribute = derived only (no core-stat rider)', () => {
    for (const t of ALL) {
      if (t.kind === 'stat') {
        for (const k of Object.keys(t.effects ?? {}))
          expect(STAT_KEYS.has(k), `${t.id} stat-kind but has non-core effect ${k}`).toBe(true);
      }
      if (t.kind === 'attribute') {
        for (const k of Object.keys(t.effects ?? {}))
          expect(STAT_KEYS.has(k), `${t.id} attribute-kind carries core-stat rider ${k}`).toBe(false);
      }
    }
  });

  it('ADR-028 naming law: a stat/attribute name never evokes a body part / natural gear', () => {
    for (const t of ALL) {
      if (t.kind === 'stat' || t.kind === 'attribute')
        expect(
          ANATOMY_NAME_RE.test(t.name),
          `${t.id} (${t.kind}) name "${t.name}" evokes anatomy — rename or make it a body kind`
        ).toBe(false);
    }
  });

  it('kind matches payload: bodyMod modifies the body, naturalGear links a granting condition', () => {
    for (const t of ALL) {
      if (t.kind === 'bodyMod') {
        expect(t.bodyMods?.length, `${t.id} bodyMod needs bodyMods[]`).toBeGreaterThan(0);
        expect(Object.keys(t.effects ?? {}), `${t.id} bodyMod must carry no effects`).toEqual([]);
        for (const m of t.bodyMods ?? [])
          expect(
            m.target === 'skeleton' || m.target === 'flesh' || !!PART_DEF_MAP[m.target],
            `${t.id} bodyMod target ${m.target} unknown`
          ).toBe(true);
      }
      if (t.kind === 'naturalGear') {
        expect(t.selfCondition, `${t.id} naturalGear needs selfCondition`).toBeTruthy();
        const cond = getTransientConditionDef(t.selfCondition!);
        const grants = !!(cond?.grantsNaturalWeapon?.length || cond?.grantsNaturalArmor);
        expect(grants, `${t.id} → ${t.selfCondition} grants nothing`).toBe(true);
        // §3 natural armor IS gear: it must carry a weight (→ encumbrance) and a worn-gear mode.
        if (cond?.grantsNaturalArmor) {
          expect(cond.weightKg ?? 0, `${t.selfCondition} armor needs weightKg`).toBeGreaterThan(0);
          expect(['replace', 'stack'], `${t.selfCondition} armor needs mode`).toContain(cond.mode);
        }
      }
      if (t.kind === 'wound') {
        // §4: the affliction IS the injury — a wounds payload, no stat fudge riding along.
        expect(t.wounds?.length, `${t.id} wound-kind needs wounds[]`).toBeGreaterThan(0);
        expect(Object.keys(t.effects ?? {}), `${t.id} wound-kind must carry no effects`).toEqual([]);
        for (const w of t.wounds ?? []) {
          const def = PART_DEF_MAP[w.part];
          expect(def, `${t.id} wound part ${w.part} not in limbmap`).toBeTruthy();
          // Non-lethal at spawn: never stamp a vital/critical part.
          expect(def?.isVital || def?.isCritical, `${t.id} targets vital ${w.part}`).toBeFalsy();
        }
      }
    }
  });

  it('rarity budget: rare/epic are a real capability; legendary is a bundle', () => {
    for (const t of TRAIT_DATABASE) {
      if (t.rarity === 'rare' || t.rarity === 'epic') {
        const capable =
          !!t.selfCondition ||
          !!t.onHitEffect ||
          !!t.weaponBonus ||
          (t.subCapabilities?.length ?? 0) > 0 ||
          (t.bodyMods?.length ?? 0) > 0; // an epic body transformation (stone bones) is a capability
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

  it('§2 contrast layer: the six "shitty" commons exist as clean negative pulls', () => {
    const byId = Object.fromEntries(TRAIT_DATABASE.filter((t) => t.id).map((t) => [t.id!, t]));
    for (const id of [
      'sluggard',
      'slow-mending',
      'night-blind',
      'thin-blooded',
      'pox-marked',
      'stiff-jointed'
    ]) {
      const t = byId[id];
      expect(t, `${id} missing`).toBeTruthy();
      expect(t.rarity ?? 'common', `${id} must be common`).toBe('common');
      // Kind-clean (no mixing — asserted globally above); carries at least one debuff.
      const negatives = Object.entries(t.effects ?? {}).filter(([k, v]) =>
        typeof v === 'number'
          ? (k.endsWith('Penalty') && v > 0) || (!k.endsWith('Penalty') && v < 0)
          : Object.values(v as Record<string, number>).some((m) => m < 1)
      );
      expect(negatives.length, `${id} needs a debuff`).toBeGreaterThanOrEqual(1);
    }
  });
});
