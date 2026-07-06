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

/** On-hit condition proc carried by a trait (`onHitEffect`) or a natural-weapon item.
 *  Same shape as an item's `onHitEffect` so Combat can apply either through one path. */
export interface TraitOnHitEffect {
  /** Transient condition id inflicted on a landed hit. */
  condition: string;
  /** 0–1 base trigger chance, cut by the target's `resist` stat. */
  chance: number;
  /** Duration in in-game hours (converted to ticks on apply). */
  durationHours: number;
  /** `*_resistance` stat id that reduces the trigger chance (and blood drain). */
  resist?: string;
  /** Optional bloodVolume drain on trigger (feeding / bleed weapons). */
  bloodDrain?: number;
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
  /** INTERNAL rarity tier controlling SELECTION only — never surfaced as a user-facing label.
   *  Absent ⇒ `mundane`. `supernatural`/`legendary` are rare race-identity powers. */
  tier?: 'mundane' | 'supernatural' | 'legendary';
  /** GROUNDWORK for trait evolution (not yet a runtime mechanic): the id of the higher-tier trait this
   *  one can grow into — e.g. mundane `frost-loving` → supernatural `frost-born`, `adrenaline` →
   *  `berserker-blood`. Lets a future system upgrade a pawn's trait along its line. */
  evolvesTo?: string;
  /** Permanent (or environment-gated) condition id kept on the pawn while this trait is present — its
   *  legible pill in the health panel AND the hub for its combat capability: the linked condition def
   *  carries `grantsNaturalWeapon`/`grantsNaturalArmor` (single source of truth, no trait-side copy).
   *  `photosynthesis`/`light_sensitive` are environment-gated (pushed only when active). */
  selfCondition?: string;
  /** Equipment slots the body forbids — greyed in the gear tab, blocked at equip. */
  blocksSlots?: EquipmentSlot[];
  /** Procs on ANY landed melee hit regardless of held weapon ("rides your steel"). */
  onHitEffect?: TraitOnHitEffect;
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
    // directly to the matching stats.jsonc output (see racial-traits.jsonc header).
    // Consumed by PawnStatService.traitWorkMult.
    workSpeed?: Record<string, number>; // workType -> *_speed multiplier
    workYield?: Record<string, number>; // workType -> *_yield multiplier
    workQuality?: Record<string, number>; // workType -> *_quality multiplier

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
