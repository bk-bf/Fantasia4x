// Race, stats, and racial-trait types. Split out of core/types.ts (P-4); re-exported via the barrel.

import type { EquipmentSlot } from './items';

export interface EntityStats {
  strength: number;
  dexterity: number;
  intelligence: number;
  perception: number;
  charisma: number;
  constitution: number;
}

/** A core-attribute key — the six fields of {@link EntityStats}. */
export type StatKey = keyof EntityStats;

/**
 * PAWN-GROWTH: one unresolved "growth" offer awaiting the player's pick-two. A pawn banks these as it
 * survives seasons (4/year, on a random day within each season) plus a guaranteed one on its birthday
 * (rolls DOUBLED). Every core stat gets an independent 0..+3 roll (0..+6 on a birthday), biased upward
 * on the pawn's two favoured stats; the player then ACCEPTS two of them, each capped at that stat's
 * `maxStats`. Battle-Brothers-style: talent stars mark the stats that roll big.
 */
export interface GrowthOffer {
  /** 'season' (4/year) or 'birthday' (guaranteed, doubled). Drives the offer's flavour + doubled math. */
  kind: 'season' | 'birthday';
  /** Per-stat rolled gain on offer (already doubled for a birthday). Player accepts exactly two. */
  rolls: Partial<Record<StatKey, number>>;
}

/** ADR-029: on-hit CONDITION proc — the ONE shape shared by a trait's `onHitCondition` (procs on any
 *  landed hit, "rides your steel") and a weapon item's `onHitCondition` (rides that weapon's swings).
 *  Combat collects both into one list and applies them through one path. */
export interface OnHitCondition {
  /** Transient condition id inflicted on a landed hit. Optional (TRAIT-LIBRARY-EXPANSION §3b): a
   *  feeding weapon may carry only a `bloodDrain` — the roll still gates the drain (and the attacker's
   *  `feasted` buff), it just stamps no condition on the target (the physical bleed-wound is the mark). */
  condition?: string;
  /** 0–1 base trigger chance, cut by the target's `resist` stat. */
  chance: number;
  /** Duration in in-game hours (converted to ticks on apply). */
  durationHours?: number;
  /** `*_resistance` stat id that reduces the trigger chance (and blood drain). */
  resist?: string;
  /** Optional bloodVolume drain on trigger (feeding / bleed weapons). */
  bloodDrain?: number;
}
/** @deprecated ADR-029 rename — use {@link OnHitCondition}. */
export type TraitOnHitEffect = OnHitCondition;

/** ADR-029: on-hit WOUND proc — flags the physical wound a landed hit opened (parallel to
 *  `OnHitCondition`, but writes to the INJURY layer, not conditionTimers). `wound` names an
 *  `Injury` flag: `bloodletting` (never self-clots until dressed) / `infected` (festers). */
export interface OnHitWound {
  wound: 'bloodletting' | 'infected';
  /** 0–1 chance per landed OPEN wound. */
  chance: number;
}

export interface Trait {
  /** Stable kebab-case id (referenced by archetype themes + conflict groups). */
  id?: string;
  name: string;
  description: string;
  /** Hand-authored evocative fragment woven into a race's procedural description
   *  (see Race.generateRaceDescription). Carries the prose flavour — e.g.
   *  "their skin sets hard as weathered stone". */
  flavorLine?: string;
  /** Where the trait comes from (ADR-023). Absent ⇒ `racial`.
   *  `racial`: physiology drawn from a race's pool (may be a shared identity trait).
   *  `personal`: temperament/aptitude an INDIVIDUAL pawn carries regardless of race. */
  scope?: 'racial' | 'personal';
  /** Rarity on the `rarities.jsonc` scale (TRAIT-SYSTEM-V2 §2). Absent ⇒ `common`. It is a BUDGET:
   *  how many attribute categories a trait may touch and its polarity — common/uncommon are the mundane
   *  pool, rare/epic are the rare race-identity capabilities, legendary is a rolled bundle. It also
   *  drives the trait-card accent colour. */
  rarity?: 'negative' | 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic' | 'legendary';
  /** Trait category (TRAIT-SYSTEM-V2 §1) — determines the payload shape + validator path:
   *  `stat` (core-stat deltas) · `attribute` (derived stats.jsonc, breadth gated by rarity) ·
   *  `naturalGear` (a natural weapon/armor condition) · `passive` (aura/affinity/proc condition) ·
   *  `wound` (a real injury at generation) · `bodyMod` (modifies the limbmap body directly — bone/flesh
   *  HP + body weight, so a dense-boned pawn genuinely fractures harder, not a `blunt_resistance` fudge).
   *  Reserved (TODO): `behavioral` · `needs` · `transformation`. */
  kind?: 'stat' | 'attribute' | 'naturalGear' | 'passive' | 'wound' | 'bodyMod';
  /** `bodyMod`-kind payload (TRAIT-SYSTEM-V2 §1 amendment): intrinsic structural changes stamped onto the
   *  pawn's own limb tree at generation (`applyTraitBodyMods`), so the effect flows through the real body
   *  model (fracture threshold, wound tolerance, blood pool, encumbrance) — never an abstract stat mult.
   *  `target`: `'skeleton'` (all bones), `'flesh'` (all outer soft parts), or a specific limbmap part id. */
  bodyMods?: Array<{
    target: 'skeleton' | 'flesh' | string;
    /** Scale matching parts' maxHp — skeleton ⇒ fracture budget (dense/brittle bone), flesh ⇒ how much
     *  damage the padding takes before a wound escalates (thick/thin hide). Full health preserved. */
    hpMult?: number;
    /** Added to the pawn's body weight (kg) — feeds the blood pool + the `encumbered` load, so heavy
     *  bones slow the pawn emergently rather than via a hand-tuned DEX penalty. */
    weightKg?: number;
  }>;
  /** `wound`-kind payload (TRAIT-SYSTEM-V2 §4): PERMANENT healed-over injuries stamped at pawn-gen
   *  (one-eyed → a destroyed eye) by `applyTraitWounds`, capped non-lethal. `part` is a limbmap part
   *  id; a paired part (leftEye) may flip to its twin for variety. Effects flow through the body
   *  model (capacities), never a stat fudge. */
  wounds?: Array<{
    part: string;
    severity: 'minor' | 'serious' | 'critical' | 'destroyed';
    /** Wound type from wounds.jsonc (default 'cut'); 'crush' reads as degenerative (bad back);
     *  'burn'/'frostbite' are the elemental scar variants (TRAIT-LIBRARY-EXPANSION §5b). */
    type?: 'cut' | 'fracture' | 'puncture' | 'crush' | 'burn' | 'frostbite' | 'scorch';
    /** §5a lost limbs: destroy the WHOLE parent limb (a true old amputation — every part missing,
     *  limb.isMissing), not just the named part. Refused on limbs holding a vital organ. */
    amputate?: boolean;
  }>;
  /** GROUNDWORK for trait evolution (not yet a runtime mechanic): the id of the higher-tier trait this
   *  one can grow into — e.g. mundane `frost-loving` → supernatural `frost-born`, `adrenaline` →
   *  `berserker-blood`. Lets a future system upgrade a pawn's trait along its line. */
  evolvesTo?: string;
  /** TRAIT-LIBRARY-EXPANSION §3a: this trait's rung on its 3-stage natural-gear line (S1 budding →
   *  S3 apex), chained by `evolvesTo`. Data flag only for now — a later age/ritual system walks it. */
  stage?: 1 | 2 | 3;
  /** §3d à-la-carte body composition: limbs (with their parts, from the GLOBAL limbmap part catalog —
   *  any plan's parts are addressable) GRAFTED onto the pawn's body tree at generation
   *  (`applyTraitGrafts`). A grafted wing/tail/beak is a REAL limb: hittable, losable, and the host
   *  for the trait's natural gear (`hostParts`), so shearing the wing removes the benefit. */
  grafts?: Array<{ limb: string; parts: string[] }>;
  /** ADR-029: per-part natural armour. `target` = a limbmap part id, a limb-group id, or `'all'`;
   *  `defense` adds absolute soak to those parts (subtractive, layered under worn gear). Unified with
   *  `CreatureDefinition.armorMods`; the scalar `naturalArmor` is sugar for `[{target:'all', defense:n}]`. */
  armorMods?: Array<{ target: string; defense: number }>;
  /** ADR-029 sugar: uniform natural armour = `armorMods: [{target:'all', defense:n}]`. */
  naturalArmor?: number;
  /** TRAITS §0a — typed resistances carried by a natural covering / affinity, in a DEDICATED field (the
   *  §0-legal home; a resistance in the generic `effects` bag is forbidden). Each is a 0–1 fraction (may
   *  be negative — a covering can be a heat trap) that adds on top of the matching `*_resistance` stat,
   *  exactly as the old `effects.*Resistance` riders did — so it feeds BOTH combat mitigation AND
   *  condition onset (cold→hypothermia, fire→heat-stroke). Physically tied to the granting trait: present
   *  it when the trait is present, gone with the trait. Read by PawnStatService.traitResistanceBonus. */
  resistances?: {
    cold?: number;
    fire?: number;
    poison?: number;
    disease?: number;
    mental?: number;
    lightning?: number;
    shadow?: number;
    wetness?: number;
    cutting?: number;
    piercing?: number;
    blunt?: number;
  };
  /** §6a auras: while this trait's bearer stands, pawns/mobs within `radius` tiles carry `condition`.
   *  Applied on a THROTTLED cadence with a linger tail (the condition is stamped as a timer of
   *  `lingerSeconds`, so it fades a few seconds after leaving the zone — and the pass never runs
   *  per-tick). Aura traits sit in one mutual-exclusion conflict group (≤1 aura per pawn). */
  aura?: {
    condition: string;
    radius: number;
    affects: 'allies' | 'foes' | 'all';
    /** Seconds the stamped condition lingers per application (default 8). */
    lingerSeconds?: number;
  };
  /** PHYSIQUE PREREQUISITE (ADR-028): the trait may only be drawn onto a pawn whose ROLLED physique fits
   *  — so a physically contradictory trait can't land (Gaunt = "wasted, spare" never on a 250 kg mass;
   *  Stocky = "short, broad" never on a wisp). Checked per-pawn in `drawPawnTraits` against the base
   *  physicalTraits; a failing trait is skipped from that pawn's draw. `build` is weight ÷ height (kg/cm)
   *  — the lean↔heavy axis (see Race.buildBucket). Absent ⇒ no physical gate. */
  requires?: {
    minWeightKg?: number;
    maxWeightKg?: number;
    minHeightCm?: number;
    maxHeightCm?: number;
    /** Min/max build density (weight ÷ height, kg/cm): lean builds ~0.3–0.45, heavyset ~0.7+. */
    minBuild?: number;
    maxBuild?: number;
  };
  /** Trigger-gated condition id kept on the pawn while this trait is present AND its gate holds —
   *  `activateWhen`-gated (photosynthesis/hydro_vigor) or host-part-gated (wings' gliding_membrane).
   *  ADR-029: natural weapons/armour no longer route through here — they live on the trait itself
   *  (`naturalWeapons` / `naturalArmor` / `armorMods`), so a condition always has a dynamic trigger. */
  selfCondition?: string;
  /** ADR-029: natural-weapon item ids this body swings (mirror of `CreatureDefinition.naturalWeapons`).
   *  Anatomy-gated for free: each id must be listed in a surviving part's `weapons` (limbmap) —
   *  lose the jaw and the bite goes with it. Rolled per swing alongside the fists/kick defaults. */
  naturalWeapons?: string[];
  /** ADR-029: fraction (0–1) of carry capacity a permanent natural covering consumes (was the armour
   *  condition's `carryPenalty`). */
  carryPenalty?: number;
  /** A meter-triggered timed condition (NOT always-on): when the bearer's `meter` (e.g. `pain`) reaches
   *  `atOrAbove`, stamp `condition` for `durationHours` in-game hours — a rising-edge one-shot that won't
   *  re-fire while the condition (or its `onExpiry` aftermath) is still active. Drives berserker rage:
   *  pain → `berserk`. Stamped by `stampTriggeredConditions` in the per-tick condition pass. */
  triggeredCondition?: { condition: string; meter: string; atOrAbove: number; durationHours: number };
  /** Equipment slots the body forbids — greyed in the gear tab, blocked at equip. */
  blocksSlots?: EquipmentSlot[];
  /** Procs on ANY landed melee hit regardless of held weapon ("rides your steel"). */
  onHitCondition?: OnHitCondition;
  /** Applies only while a weapon is equipped (Giant's Grip, Duelist's Blood). */
  weaponBonus?: { damage?: number };
  /** legendary only: sub-capabilities, each rolled independently PER PAWN at pawn-gen so two
   *  legendary-blooded pawns are never identical. Expanded into the pawn's trait list. */
  subCapabilities?: Trait[];
  /** Only fields below are actually consumed somewhere — pawn-gen stat bonuses,
   *  PawnStatService work mults + resistance stats + heal_rate, and Combat resistances.
   *  The old grab-bag of unread effect keys (telepathicRange, memoryBonus…) was pruned. */
  effects: {
    // Stat bonuses/penalties — applied at pawn generation (applyRacialTraitBonuses).
    strengthBonus?: number;
    dexterityBonus?: number;
    intelligenceBonus?: number;
    perceptionBonus?: number;
    charismaBonus?: number;
    constitutionBonus?: number;
    strengthPenalty?: number;
    dexterityPenalty?: number;
    intelligencePenalty?: number;
    perceptionPenalty?: number;
    charismaPenalty?: number;
    constitutionPenalty?: number;

    // Work modifiers — each maps a workType (or "all") to a multiplier applied
    // directly to the matching stats.jsonc output (see traits.jsonc header).
    // Consumed by PawnStatService.traitWorkMult.
    workSpeed?: Record<string, number>; // workType -> *_speed multiplier
    workYield?: Record<string, number>; // workType -> *_yield multiplier
    workQuality?: Record<string, number>; // workType -> *_quality multiplier

    /** TRAIT-LIBRARY-EXPANSION §1: combat-stat multipliers — combat statId (hit_chance, dodge,
     *  knockdown_resistance, attack_speed, hit_precision, aim_speed, reload_speed, aim_range) → a
     *  multiplier on the matching stats.jsonc combat output, exactly as `workSpeed` multiplies a work
     *  stat. Consumed by PawnStatService.evaluateStat (combat-category stats only). */
    combatMods?: Record<string, number>;

    // Resistance / rate stats — added on top of the matching stat formula by
    // PawnStatService.evaluateStat (RESISTANCE_TRAIT_KEY), so they flow into condition
    // onset (cold→hypothermia, fire→heat_stroke), combat mitigation, and wound healing.
    fireResistance?: number;
    coldResistance?: number;
    poisonResistance?: number;
    diseaseResistance?: number;
    mentalResistance?: number;
    /** Elemental resistances realigned with stats.jsonc (lightning/shadow/wetness). */
    lightningResistance?: number;
    shadowResistance?: number;
    wetnessResistance?: number;
    /** Wound-heal rate bonus, added on top of the `heal_rate` formula (Regeneration). */
    healRate?: number;

    /** Physical damage resistances (0–1), folded into the *_resistance stat in combat. */
    blunt_resistance?: number;
    cutting_resistance?: number;
    piercing_resistance?: number;

    /** Darkness immunity 0–1 (0 = full night penalty, 1 = sees in the dark as by day).
     *  Summed across traits by core/vision.ts; also un-penalises night work. */
    nightVision?: number;
  };
}

/** Procedurally-generated race lore — flavour only, no mechanical effect. */
export interface RaceLore {
  /** Short heroic byname, e.g. "the Stoneborn". */
  epithet: string;
  /** Origin myth fragment. */
  origin: string;
  /** Typical homeland / biome. */
  homeland: string;
  /** One-word-ish temperament summary. */
  temperament: string;
  /** Cultural belief / value. */
  belief: string;
  /** The immersive multi-sentence description (Race.generateRaceDescription). */
  description: string;
}

/** Stub inter-race relationship (data + pokédex display only this pass; no mood wiring). */
export interface RaceRelation {
  a: string; // race id
  b: string; // race id
  score: number; // -100 (hostile) .. +100 (allied), symmetric
  disposition: 'allied' | 'friendly' | 'neutral' | 'wary' | 'hostile';
}

export interface Race {
  /** Unique kebab-case slug (was hardcoded 'player' pre-overhaul). */
  id: string;
  name: string;

  /** Flavour archetype that biases stat ranges, size, and trait selection. */
  archetype: string;

  // Stat ranges instead of fixed stats — each pawn is rolled within these.
  statRanges: Record<string, [number, number]>; // stat name -> [min, max]

  // Physical trait ranges
  physicalTraits: {
    heightRange: [number, number]; // in cm
    weightRange: [number, number]; // in kg
    size: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  };

  /** Traits EVERY member of the race shares — its identity (ADR-023). Holds any rare
   *  supernatural/legendary the race rolled (the "scaled folk"), plus 0–1 signature mundane trait. */
  guaranteedTraits: Trait[];
  /** The menu of additional MUNDANE racial traits each pawn independently draws 1–2 from at
   *  generation, so same-race pawns vary. Weighted toward the race's archetype. */
  racialTraitPool: Trait[];

  /** Procedural lore (epithet, origin, immersive description …). */
  lore: RaceLore;

  /** Pokédex flag — true once the colony hosts this race or it's been encountered. */
  discovered?: boolean;

  population: number;
}

export interface Equipment {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'accessory';
  stats: Partial<EntityStats>;
  magical?: boolean;
}
