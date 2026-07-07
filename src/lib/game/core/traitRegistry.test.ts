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
  /\b(bone|boned|skin|skinned|hide|scale|scaled|shell|carapace|claw|clawed|horn|horned|fang|fanged|tusk|eyed|one-eyed|ear|winged|feather|feathered|furred|joint|jointed)\b/i;

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
        // §3e: UTILITY gear grants no weapon/armor — it's a host-gated benefit (wings → moveSpeed
        // while a wing survives). Valid iff the condition binds host parts AND carries modifiers.
        const utility =
          !!cond?.hostParts?.length && Object.keys(cond?.modifiers ?? {}).length > 0;
        const grants = !!(cond?.grantsNaturalWeapon?.length || cond?.grantsNaturalArmor) || utility;
        expect(grants, `${t.id} → ${t.selfCondition} grants nothing`).toBe(true);
        // §3 natural armor IS gear: it eats a carry-capacity fraction (0<p<1) and has a worn-gear mode.
        if (cond?.grantsNaturalArmor) {
          const p = cond.carryPenalty ?? 0;
          expect(p, `${t.selfCondition} armor needs a carryPenalty`).toBeGreaterThan(0);
          expect(p, `${t.selfCondition} carryPenalty must stay < 1`).toBeLessThan(1);
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

  it('rarity budget: rare/epic/mythic are a real capability; heritage bundles carry subCapabilities', () => {
    for (const t of TRAIT_DATABASE) {
      if (t.rarity === 'rare' || t.rarity === 'epic' || t.rarity === 'mythic') {
        const capable =
          !!t.selfCondition ||
          !!t.onHitEffect ||
          !!t.weaponBonus ||
          !!t.aura || // §6a: an aura is a capability
          (t.grafts?.length ?? 0) > 0 || // §3d: growing a real limb is a capability
          (t.subCapabilities?.length ?? 0) > 0 ||
          (t.bodyMods?.length ?? 0) > 0 || // an epic body transformation (stone bones) is a capability
          // TRAIT-LIBRARY-EXPANSION §1/§2: a SIGNIFICANT stat/attribute payload (the ±3/±5 rungs and
          // the significant combos deliberately sit at rare/epic) is a legitimate high-rarity pull.
          ((t.kind === 'stat' || t.kind === 'attribute') && Object.keys(t.effects ?? {}).length > 0);
        expect(capable, `${t.id} (${t.rarity}) carries no capability`).toBe(true);
      }
      // A legendary/mythic PASSIVE banner is a rolled bundle; the §2d grand STAT pulls
      // (Paragon Blood / Godtouched) are deliberate single traits — exempt.
      if ((t.rarity === 'legendary' || t.rarity === 'mythic') && t.kind !== 'stat')
        expect((t.subCapabilities?.length ?? 0) > 0, `${t.id} ${t.rarity} needs subCapabilities`).toBe(true);
    }
    // every evolvesTo target exists
    const ids = new Set(ALL.map((t) => t.id));
    for (const t of ALL) if (t.evolvesTo) expect(ids.has(t.evolvesTo), `evolvesTo ${t.evolvesTo}`).toBe(true);
    // §3a stage chains are ordered: a staged trait's evolvesTo target is the NEXT stage.
    const byId = new Map(ALL.map((t) => [t.id, t]));
    for (const t of ALL) {
      if (t.stage && t.evolvesTo) {
        const next = byId.get(t.evolvesTo);
        expect(next?.stage, `${t.id} (S${t.stage}) evolvesTo ${t.evolvesTo} must be S${t.stage + 1}`).toBe(t.stage + 1);
      }
    }
  });

  it('TRAIT-LIBRARY-EXPANSION resistance-sourcing rule: an abstract attribute trait never grants a resistance', () => {
    // Resistances come only from §3 coverings (naturalGear) and passive affinities — a plain
    // attribute combo drives work/combat stats, nightVision or healRate, never a resistance.
    const RESISTANCE_KEYS = [
      'fireResistance', 'coldResistance', 'poisonResistance', 'diseaseResistance',
      'mentalResistance', 'lightningResistance', 'shadowResistance', 'wetnessResistance',
      'blunt_resistance', 'cutting_resistance', 'piercing_resistance'
    ];
    for (const t of ALL) {
      if (t.kind !== 'attribute') continue;
      for (const k of RESISTANCE_KEYS)
        expect(
          (t.effects as Record<string, unknown>)?.[k],
          `${t.id} (attribute) grants resistance ${k} — make it a covering or passive affinity`
        ).toBeUndefined();
    }
  });

  it('§1 combatMods only name real combat stats; §6a auras name real conditions with finite radius', () => {
    const COMBAT_STAT_IDS = new Set([
      'melee_damage', 'armor_damage', 'hit_chance', 'dodge', 'knockdown_resistance', 'vision_range',
      'attack_speed', 'crit_chance', 'aim_accuracy', 'aim_speed', 'reload_speed', 'aim_range', 'ranged_damage'
    ]);
    for (const t of ALL) {
      for (const k of Object.keys(t.effects?.combatMods ?? {}))
        expect(COMBAT_STAT_IDS.has(k), `${t.id} combatMods names unknown combat stat ${k}`).toBe(true);
      if (t.aura) {
        expect(getTransientConditionDef(t.aura.condition), `${t.id} aura condition ${t.aura.condition} missing`).toBeTruthy();
        expect(t.aura.radius, `${t.id} aura radius must be finite and small`).toBeGreaterThan(0);
        expect(t.aura.radius, `${t.id} aura radius must be finite and small`).toBeLessThanOrEqual(6);
      }
      // §3d grafts reference real limbmap parts.
      for (const g of t.grafts ?? [])
        for (const pid of g.parts)
          expect(PART_DEF_MAP[pid], `${t.id} grafts unknown part ${pid}`).toBeTruthy();
    }
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
    // waterborn→fishing is LOGICAL and stays (the mundane water-affinity trait forked off amphibious)
    expect(ws('waterborn')?.fishing).toBeGreaterThan(1);
  });

  it('flaw tier: every negative-rarity trait is a pure downside (no upside effect)', () => {
    for (const t of ALL) {
      if (t.rarity !== 'negative') continue;
      // A flaw's effects must contain NO positive term (no *Bonus, no >1 mult, no positive resistance).
      for (const [k, v] of Object.entries(t.effects ?? {})) {
        if (typeof v === 'number')
          expect(
            k.endsWith('Bonus') ? false : k.endsWith('Penalty') ? true : v <= 0,
            `${t.id} (flaw) has an upside: ${k}=${v}`
          ).toBe(true);
        else
          for (const m of Object.values(v as Record<string, number>))
            expect(m, `${t.id} (flaw) work mult ${m} is an upside`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('flaw tier: the marquee flaws (afflictions + shitty commons) are rarity negative', () => {
    const byId = Object.fromEntries(TRAIT_DATABASE.filter((t) => t.id).map((t) => [t.id!, t]));
    for (const id of [
      'frail', 'clumsy', 'dull', 'one-eyed', 'hard-of-hearing', 'bad-back',
      'sluggard', 'slow-mending', 'night-blind', 'thin-blooded', 'pox-marked', 'stiff-jointed'
    ]) {
      expect(byId[id]?.rarity, `${id} must be a flaw`).toBe('negative');
    }
  });
});
