import type { EquipmentSlot } from './items';

export interface EntityStats {
  strength: number;
  dexterity: number;
  intelligence: number;
  perception: number;
  charisma: number;
  constitution: number;
}

export type StatKey = keyof EntityStats;

export interface GrowthOffer {
  kind: 'season' | 'birthday';
  rolls: Partial<Record<StatKey, number>>;
}

export interface LineagePath {
  condition: string;
  lineage: string;
  deed: string;
  target: number;
  value: number;
  seen: number;
  lastFedDay: number;
}

export interface OnHitCondition {
  condition?: string;
  chance: number;
  durationHours?: number;
  resist?: string;
  bloodDrain?: number;
  bleedMult?: number;
}

export interface OnHitWound {
  wound: 'bloodletting' | 'infected';
  chance: number;
}

export interface Trait {
  id?: string;
  name: string;
  description: string;
  flavorLine?: string;
  scope?: 'cultural' | 'personal';
  rarity?: 'negative' | 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic' | 'legendary';
  kind?: 'stat' | 'attribute' | 'naturalGear' | 'passive' | 'wound' | 'bodyMod';
  bodyMods?: Array<{
    target: 'skeleton' | 'flesh' | string;
    hpMult?: number;
    weightKg?: number;
  }>;
  wounds?: Array<{
    part: string;
    severity: 'minor' | 'serious' | 'critical' | 'destroyed';
    type?: 'cut' | 'fracture' | 'puncture' | 'crush' | 'burn' | 'frostbite' | 'scorch';
    amputate?: boolean;
  }>;
  evolvesTo?: string;
  mood?: string;
  lineage?: string[];
  lineageExclusive?: boolean;
  awakens?: string[];
  lineageParent?: string;
  lineageName?: string;
  lineageDescription?: string;
  awakenDefs?: { id: string; deed: string; range: [number, number]; label: string }[];
  conflictGroup?: string;
  dietRestriction?: 'carnivore' | 'aquatic';
  bloodNeed?: 'carcass' | 'humanoid';
  stage?: 1 | 2 | 3;
  grafts?: Array<{ limb: string; parts: string[] }>;
  armorMods?: Array<{ target: string; defense: number }>;
  naturalArmor?: number;
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
  aura?: {
    condition: string;
    radius: number;
    affects: 'allies' | 'foes' | 'all';
    lingerSeconds?: number;
  };
  requires?: {
    minWeightKg?: number;
    maxWeightKg?: number;
    minHeightCm?: number;
    maxHeightCm?: number;
    minBuild?: number;
    maxBuild?: number;
  };
  selfCondition?: string;
  naturalWeapons?: string[];
  naturalWeaponsWhen?: string;
  carryPenalty?: number;
  triggeredCondition?: string;
  blocksSlots?: EquipmentSlot[];
  effects: {
    strengthBonus?: number;
    dexterityBonus?: number;
    intelligenceBonus?: number;
    perceptionBonus?: number;
    charismaBonus?: number;
    constitutionBonus?: number;

    workSpeed?: Record<string, number>;
    workYield?: Record<string, number>;
    workQuality?: Record<string, number>;

    combatMods?: Record<string, number>;

    fireResistance?: number;
    coldResistance?: number;
    poisonResistance?: number;
    diseaseResistance?: number;
    mentalResistance?: number;
    lightningResistance?: number;
    shadowResistance?: number;
    wetnessResistance?: number;
    healRate?: number;

    blunt_resistance?: number;
    cutting_resistance?: number;
    piercing_resistance?: number;

    nightVision?: number;

    stealth?: number;
  };
}

export interface CultureLore {
  epithet: string;
  origin: string;
  homeland: string;
  temperament: string;
  belief: string;
  description: string;
}

export interface CultureRelation {
  a: string;
  b: string;
  score: number;
  disposition: 'allied' | 'friendly' | 'neutral' | 'wary' | 'hostile';
}

export interface Culture {
  id: string;
  name: string;

  archetype: string;

  statRanges: Record<string, [number, number]>;

  physicalTraits: {
    heightRange: [number, number];
    weightRange: [number, number];
    size: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  };

  guaranteedTraits: Trait[];
  culturalTraitPool: Trait[];

  lore: CultureLore;

  discovered?: boolean;
  discoveredVia?: string;

  population: number;
}

export interface Equipment {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'accessory';
  stats: Partial<EntityStats>;
  magical?: boolean;
}
