import { describe, it, expect } from 'vitest';
import { TRAIT_DATABASE } from '$lib/game/core/Culture';
import { getTransientConditionDef } from '$lib/game/core/needs';
import { PART_DEF_MAP, BOUND_NATURAL_WEAPONS } from '$lib/game/core/BodyParts';
import raritiesData from '$lib/game/database/items/rarities.jsonc';
import type { Trait } from '$lib/game/core/types';

// Every trait + legendary sub-capability.
// The catalog is FLAT since the LINEAGES-II heritage flatten (no nested bundles).
const ALL: Trait[] = TRAIT_DATABASE;
const RARITY_IDS = new Set((raritiesData as { id: string }[]).map((r) => r.id));
const KINDS = new Set(['stat', 'attribute', 'naturalGear', 'passive', 'wound', 'bodyMod']);
const STAT_KEYS = new Set([
  'strengthBonus',
  'dexterityBonus',
  'intelligenceBonus',
  'perceptionBonus',
  'charismaBonus',
  'constitutionBonus',
  'strengthPenalty',
  'dexterityPenalty',
  'intelligencePenalty',
  'perceptionPenalty',
  'charismaPenalty',
  'constitutionPenalty'
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
          expect(STAT_KEYS.has(k), `${t.id} attribute-kind carries core-stat rider ${k}`).toBe(
            false
          );
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
        // A bodyMod reshapes the body — either by tuning existing parts (bodyMods[]) or by GRAFTING
        // new limbs/parts (grafts[], e.g. Spider Eyes). Needs at least one of the two.
        expect(
          (t.bodyMods?.length ?? 0) + (t.grafts?.length ?? 0),
          `${t.id} bodyMod needs bodyMods[] or grafts[]`
        ).toBeGreaterThan(0);
        expect(Object.keys(t.effects ?? {}), `${t.id} bodyMod must carry no effects`).toEqual([]);
        for (const m of t.bodyMods ?? [])
          expect(
            m.target === 'skeleton' || m.target === 'flesh' || !!PART_DEF_MAP[m.target],
            `${t.id} bodyMod target ${m.target} unknown`
          ).toBe(true);
      }
      if (t.kind === 'naturalGear') {
        // ADR-029: gear lives on the TRAIT — a natural weapon list, an armour magnitude (scalar or
        // per-part armorMods), or a host-gated UTILITY selfCondition (wings → moveSpeed while a wing
        // survives). The old condition indirection (grantsNaturalWeapon/grantsNaturalArmor) is retired.
        const utilityCond = t.selfCondition ? getTransientConditionDef(t.selfCondition) : undefined;
        const utility =
          !!utilityCond?.hostParts?.length && Object.keys(utilityCond?.modifiers ?? {}).length > 0;
        const grants =
          !!t.naturalWeapons?.length || !!t.naturalArmor || !!t.armorMods?.length || utility;
        expect(grants, `${t.id} naturalGear grants nothing`).toBe(true);
        // §3 natural armor IS gear: it eats a carry-capacity fraction (0<p<1).
        if (t.naturalArmor || t.armorMods?.length) {
          const p = t.carryPenalty ?? 0;
          expect(p, `${t.id} armor needs a carryPenalty`).toBeGreaterThan(0);
          expect(p, `${t.id} carryPenalty must stay < 1`).toBeLessThan(1);
        }
        // ADR-029: every natural weapon id must be a real item AND be bound to a limbmap part
        // (part.weapons is the source + host-gate — an unbound id would be un-hosted/ungated).
        for (const id of t.naturalWeapons ?? []) {
          expect(BOUND_NATURAL_WEAPONS.has(id), `${t.id} weapon ${id} not bound to any part`).toBe(
            true
          );
        }
      }
      if (t.kind === 'wound') {
        // §4: the affliction IS the injury — a wounds payload, no stat fudge riding along.
        expect(t.wounds?.length, `${t.id} wound-kind needs wounds[]`).toBeGreaterThan(0);
        expect(Object.keys(t.effects ?? {}), `${t.id} wound-kind must carry no effects`).toEqual(
          []
        );
        for (const w of t.wounds ?? []) {
          const def = PART_DEF_MAP[w.part];
          expect(def, `${t.id} wound part ${w.part} not in limbmap`).toBeTruthy();
          // Non-lethal at spawn: never stamp a vital/critical part.
          expect(def?.isVital || def?.isCritical, `${t.id} targets vital ${w.part}`).toBeFalsy();
        }
      }
    }
  });

  it('rarity budget: rare/epic/mythic are a real capability; legendary/mythic are lineage markers', () => {
    for (const t of TRAIT_DATABASE) {
      if (t.rarity === 'rare' || t.rarity === 'epic' || t.rarity === 'mythic') {
        const capable =
          !!t.selfCondition ||
          !!t.triggeredCondition || // a meter-triggered condition (berserker rage) is a capability
          !!t.lineage?.length || // LINEAGES: a marker's capability is the tree it opens
          !!t.naturalWeapons?.length || // ADR-029: a natural weapon is a capability
          !!t.naturalArmor ||
          !!t.armorMods?.length ||
          !!t.aura || // §6a: an aura is a capability
          (t.grafts?.length ?? 0) > 0 || // §3d: growing a real limb is a capability
          (t.bodyMods?.length ?? 0) > 0 || // an epic body transformation (stone bones) is a capability
          // TRAIT-LIBRARY-EXPANSION §1/§2: a SIGNIFICANT stat/attribute payload (the ±3/±5 rungs and
          // the significant combos deliberately sit at rare/epic) is a legitimate high-rarity pull —
          // as is an affinity passive's payload (nocturnal's night sight) or a covering/affinity's typed
          // resistances (ever-warm), now that those live on the TRAIT (effects / the resistances block).
          ((t.kind === 'stat' || t.kind === 'attribute' || t.kind === 'passive') &&
            (Object.keys(t.effects ?? {}).length > 0 ||
              Object.keys(t.resistances ?? {}).length > 0));
        expect(capable, `${t.id} (${t.rarity}) carries no capability`).toBe(true);
      }
      // LINEAGES flat model: a legendary/mythic non-stat trait must be a lineage MARKER (`lineage`
      // set — the tree it opens IS the capability). The §2d grand STAT pulls (Paragon Blood /
      // Godtouched) are deliberate single traits — exempt. Nested bundles no longer exist.
      if ((t.rarity === 'legendary' || t.rarity === 'mythic') && t.kind !== 'stat')
        expect(!!t.lineage?.length, `${t.id} ${t.rarity} must be a lineage marker`).toBe(true);
    }
    // every evolvesTo target exists
    const ids = new Set(ALL.map((t) => t.id));
    for (const t of ALL)
      if (t.evolvesTo) expect(ids.has(t.evolvesTo), `evolvesTo ${t.evolvesTo}`).toBe(true);
    // §3a stage chains are ordered: a staged trait's evolvesTo target is the NEXT stage.
    const byId = new Map(ALL.map((t) => [t.id, t]));
    for (const t of ALL) {
      if (t.stage && t.evolvesTo) {
        const next = byId.get(t.evolvesTo);
        expect(
          next?.stage,
          `${t.id} (S${t.stage}) evolvesTo ${t.evolvesTo} must be S${t.stage + 1}`
        ).toBe(t.stage + 1);
      }
    }
  });

  it('TRAITS §0: resistances live in the `resistances` block, never in `effects`', () => {
    // §0a: a resistance is carried by the dedicated `resistances` block on coverings/affinities — NEVER
    // smuggled into the generic `effects` bag (where it read as a free-floating pawn-wide stat rider).
    const RESISTANCE_KEYS = [
      'fireResistance',
      'coldResistance',
      'poisonResistance',
      'diseaseResistance',
      'mentalResistance',
      'lightningResistance',
      'shadowResistance',
      'wetnessResistance',
      'blunt_resistance',
      'cutting_resistance',
      'piercing_resistance'
    ];
    for (const t of ALL)
      for (const k of RESISTANCE_KEYS)
        expect(
          (t.effects as Record<string, unknown>)?.[k],
          `${t.id} carries resistance ${k} in effects — move it to the \`resistances\` block`
        ).toBeUndefined();
  });

  it('TRAITS §0: a granter kind carries NO effects — the granted object has the numbers (claw family exempt)', () => {
    // Owner exemption: a hand-REPLACEMENT's manipulation cost/benefit stays on the gear trait (claws,
    // pincers, plating) — everything else routes through the weapon item / condition / part grants.
    const EXEMPT = new Set([
      'rending-claws',
      'ripping-talons',
      'crushing-claws',
      'burrowing-claws',
      'chitin-plating'
    ]);
    for (const t of ALL) {
      if (!['naturalGear', 'passive', 'wound', 'bodyMod'].includes(t.kind ?? '')) continue;
      if (EXEMPT.has(t.id ?? '')) continue;
      expect(
        Object.keys(t.effects ?? {}),
        `${t.id} (${t.kind}) carries effects — move them onto the granted object`
      ).toEqual([]);
    }
  });

  it('TRAITS §0: a trait never carries a weapon proc or a raw damage rider (procs live on the weapon item)', () => {
    // §0 forbidden fields: the old trait-level `onHitCondition` (venom/flame "rides your steel" — a
    // double-proc that duplicated the fang weapon's own proc) and `weaponBonus` (folded into
    // `combatMods.melee_damage`). The Trait type no longer declares them; assert no DATA smuggles them.
    for (const t of ALL) {
      const raw = t as unknown as Record<string, unknown>;
      expect(
        'onHitCondition' in raw,
        `${t.id} carries a trait onHitCondition — procs belong on the weapon item`
      ).toBe(false);
      expect(
        'weaponBonus' in raw,
        `${t.id} carries weaponBonus — fold it into combatMods.melee_damage`
      ).toBe(false);
    }
  });

  it('§1 combatMods only name real combat stats; §6a auras name real conditions with finite radius', () => {
    const COMBAT_STAT_IDS = new Set([
      'melee_damage',
      'armor_damage',
      'hit_chance',
      'dodge',
      'knockdown_resistance',
      'vision_range',
      'attack_speed',
      'hit_precision',
      'aim_accuracy',
      'aim_speed',
      'reload_speed',
      'aim_range',
      'ranged_damage'
    ]);
    for (const t of ALL) {
      for (const k of Object.keys(t.effects?.combatMods ?? {}))
        expect(COMBAT_STAT_IDS.has(k), `${t.id} combatMods names unknown combat stat ${k}`).toBe(
          true
        );
      if (t.aura) {
        expect(
          getTransientConditionDef(t.aura.condition),
          `${t.id} aura condition ${t.aura.condition} missing`
        ).toBeTruthy();
        expect(t.aura.radius, `${t.id} aura radius must be finite and small`).toBeGreaterThan(0);
        expect(t.aura.radius, `${t.id} aura radius must be finite and small`).toBeLessThanOrEqual(
          6
        );
      }
      // §3d grafts reference real limbmap parts.
      for (const g of t.grafts ?? [])
        for (const pid of g.parts)
          expect(PART_DEF_MAP[pid], `${t.id} grafts unknown part ${pid}`).toBeTruthy();
    }
  });

  it('§6 gamification purge: the illogical work bonuses are gone', () => {
    const byId = Object.fromEntries(ALL.filter((t) => t.id).map((t) => [t.id!, t]));
    const ws = (id: string) =>
      (byId[id]?.effects as { workSpeed?: Record<string, number> })?.workSpeed;
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
      'frail',
      'clumsy',
      'dull',
      'one-eyed',
      'hard-of-hearing',
      'bad-back',
      'sluggard',
      'slow-mending',
      'night-blind',
      'thin-blooded',
      'pox-marked',
      'stiff-jointed'
    ]) {
      expect(byId[id]?.rarity, `${id} must be a flaw`).toBe('negative');
    }
  });
});
