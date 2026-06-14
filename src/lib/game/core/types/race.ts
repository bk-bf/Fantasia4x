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
  name: string;
  description: string;
  effects: {
    // Stat bonuses/penalties
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
    workSpeed?: Record<string, number>; // workType -> *_speed multiplier
    workYield?: Record<string, number>; // workType -> *_yield multiplier
    workQuality?: Record<string, number>; // workType -> *_quality multiplier

    // Needs modifiers
    hungerRate?: number;
    fatigueRate?: number;
    sleepEfficiency?: number;

    // Resistances and special abilities
    fireResistance?: number;
    coldResistance?: number;
    poisonResistance?: number;
    diseaseResistance?: number;
    magicResistance?: number;
    mentalResistance?: number;
    /** General damage reduction applied before type-specific resistances. */
    damageReduction?: number;
    /** Physical damage resistances (0–1; stacks with damageReduction). */
    blunt_resistance?: number;
    cutting_resistance?: number;
    piercing_resistance?: number;

    // Movement and physical
    movementSpeed?: number;
    swimmingSpeed?: number;

    // Special abilities
    nightVision?: number;
    tremorsense?: number;
    waterBreathing?: number;
    telepathicRange?: number;

    // Social and mental
    intimidation?: number;
    groupBonus?: number;
    groupPenalty?: number;
    isolationPenalty?: number;

    // Misc effects
    healingRate?: number;
    experienceGain?: number;
    productionBonus?: number;
    adaptability?: number;
    memoryBonus?: number;
    errorReduction?: number;
    dangerSense?: number;

    // Time-based effects
    daytimePenalty?: number;
    sunlightDependency?: number;

    // Combat effects
    combatRage?: number;

    // Environmental dependencies and sensitivities
    heatSensitivity?: number;
  };
}

export interface Race {
  id: string;
  name: string;

  // NEW: Stat ranges instead of fixed stats
  statRanges: Record<string, [number, number]>; // stat name -> [min, max]

  // NEW: Physical trait ranges
  physicalTraits: {
    heightRange: [number, number]; // in cm
    weightRange: [number, number]; // in kg
    size: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  };

  // NEW: Typed racial traits
  racialTraits: RacialTrait[];

  population: number;
}

export interface Equipment {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'accessory';
  stats: Partial<EntityStats>;
  magical?: boolean;
}
