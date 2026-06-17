// Race, stats, and racial-trait types. Split out of core/types.ts (P-4); re-exported via the barrel.

export interface EntityStats {
  strength: number;
  dexterity: number;
  intelligence: number;
  perception: number;
  charisma: number;
  constitution: number;
}

export interface RacialTrait {
  /** Stable kebab-case id (referenced by archetype themes + conflict groups). */
  id?: string;
  name: string;
  description: string;
  /** Hand-authored evocative fragment woven into a race's procedural description
   *  (see Race.generateRaceDescription). Carries the prose flavour — e.g.
   *  "their skin sets hard as weathered stone". */
  flavorLine?: string;
  /** Only fields below are actually consumed somewhere — pawn-gen stat bonuses,
   *  PawnStatService work mults + resistance stats, and Combat damage reduction.
   *  The old grab-bag of unread effect keys (nightVision, telepathicRange, memoryBonus…)
   *  was pruned in the Race overhaul. */
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

    // Resistance stats — added on top of the *_resistance formula by
    // PawnStatService.evaluateStat, so they flow into condition onset
    // (cold→hypothermia, fire→heat_stroke) and combat mitigation.
    fireResistance?: number;
    coldResistance?: number;
    poisonResistance?: number;
    diseaseResistance?: number;
    mentalResistance?: number;

    // Combat — consumed by Combat.getRacialResistance.
    /** General damage reduction applied before type-specific resistances. */
    damageReduction?: number;
    /** Physical damage resistances (0–1; stacks with damageReduction). */
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

  // Typed racial traits
  racialTraits: RacialTrait[];

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
