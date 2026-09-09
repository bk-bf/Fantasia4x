import creaturesData from '../../database/pawns/creatures.json';
import { resolveCharSpans, type CharSpan } from './terrains';
import type { DamageType } from '../types/health';
import { deriveCreatureStats } from '../rules/body/creatureStats';

export type EntityClass = 'mob' | 'animal';
export type EntityBehaviour = 'passive' | 'neutral' | 'aggressive';
export type EntityDiet = 'herbivore' | 'carnivore' | 'omnivore' | 'none';
export type FoodCategory = 'food' | 'meat' | 'organic';
export type EntityIntelligence = 'primitive' | 'sapient';

export interface CreatureStats {
  strength: number;
  dexterity: number;
  constitution: number;
  perception: number;
  health: number;
  speed: number;
  visionRange: number;
  fleeRange: number;
}

export interface CreatureLootEntry {
  itemId: string;
  chance: number;
  qty: [number, number];
}

export interface CreatureProduces {
  itemId: string;
  qty: number;
  intervalSeconds: number;
}

export interface CreatureDefinition {
  id: string;
  name: string;
  flavor?: string;
  entityClass: EntityClass;
  chars: string[];
  fg: [number, number, number];
  bg: [number, number, number];
  stats: CreatureStats;
  behaviour: EntityBehaviour;
  diet: EntityDiet;
  eats: FoodCategory[];
  grazes: boolean;
  predator: boolean;
  intelligence: EntityIntelligence;
  nocturnalAggro: boolean;
  nightOnly: boolean;
  pack: [number, number];
  tameable: boolean;
  tameResistance: number;
  mountable: boolean;
  huntable: boolean;
  canSteal: boolean;
  chargesWhenWounded: boolean;
  territorial: boolean;
  nightVision: number;
  produces?: CreatureProduces;
  carcassItemId?: string;
  biomeWeights: Record<string, number>;
  lootTable: CreatureLootEntry[];
  naturalWeapons: string[];
  traits?: string[];
  resistances?: Partial<Record<DamageType, number>>;
  naturalArmor?: number;
  armorMods?: Array<{ target: string; defense: number }>;
  statRanges?: Partial<
    Record<'strength' | 'dexterity' | 'constitution' | 'perception', [number, number]>
  >;
  naturalArmorRange?: [number, number];
  lootPool?: string;
  species?: string;
  tier?: number;
  variantOf?: string;
  bodyScale?: number;
  sex?: false;
  limbMap?: string;
  spawnsInMountain?: boolean;
  maxMountainDistance?: number;
  lair?: string;
  lairRange?: number;
  hungerRate?: number;
  foodOverflow?: number;
  audio?: string;
}

type RawCreature = Record<string, unknown>;

function defaultEatsForDiet(diet: EntityDiet): FoodCategory[] {
  switch (diet) {
    case 'herbivore':
      return ['food'];
    case 'carnivore':
      return ['meat', 'organic'];
    case 'none':
      return [];
    case 'omnivore':
    default:
      return ['food', 'meat', 'organic'];
  }
}

function toDefinition(raw: RawCreature): CreatureDefinition {
  const stats: CreatureStats = deriveCreatureStats(
    raw.stats as CreatureStats | undefined,
    raw.statRanges as CreatureDefinition['statRanges'] | undefined
  );
  const diet = (raw.diet as EntityDiet) ?? 'omnivore';
  const predator = (raw.predator as boolean) ?? false;
  return {
    id: raw.id as string,
    name: raw.name as string,
    flavor: (raw.flavor as string | undefined) ?? undefined,
    entityClass: raw.entityClass as EntityClass,
    chars: resolveCharSpans((raw.charSpans ?? []) as CharSpan[]),
    fg: raw.fg as [number, number, number],
    bg: (raw.bg as [number, number, number]) ?? [0, 0, 0],
    stats,
    behaviour: raw.behaviour as EntityBehaviour,
    diet,
    predator,
    eats: (raw.eats as FoodCategory[] | undefined) ?? defaultEatsForDiet(diet),
    grazes: (raw.grazes as boolean | undefined) ?? diet === 'herbivore',
    intelligence: (raw.intelligence as EntityIntelligence) ?? 'primitive',
    nocturnalAggro: (raw.nocturnalAggro as boolean) ?? false,
    nightOnly: (raw.nightOnly as boolean) ?? false,
    pack: (raw.pack as [number, number]) ?? [1, 1],
    tameable: (raw.tameable as boolean) ?? false,
    tameResistance: (raw.tameResistance as number) ?? 0.5,
    mountable: (raw.mountable as boolean) ?? false,
    huntable: (raw.huntable as boolean) ?? false,
    canSteal: (raw.canSteal as boolean) ?? false,
    chargesWhenWounded: (raw.chargesWhenWounded as boolean) ?? false,
    territorial: (raw.territorial as boolean) ?? true,
    nightVision: (raw.nightVision as number) ?? 0,
    produces: raw.produces as CreatureProduces | undefined,
    carcassItemId: (raw.carcassItemId as string) ?? undefined,
    biomeWeights: (raw.biomeWeights as Record<string, number>) ?? {},
    lootTable: (raw.lootTable as CreatureLootEntry[]) ?? [],
    naturalWeapons: (raw.naturalWeapons as string[]) ?? [],
    armorMods:
      (raw.armorMods as Array<{ target: string; defense: number }> | undefined) ?? undefined,
    statRanges: (raw.statRanges as CreatureDefinition['statRanges'] | undefined) ?? undefined,
    naturalArmorRange: (raw.naturalArmorRange as [number, number] | undefined) ?? undefined,
    lootPool: (raw.lootPool as string | undefined) ?? undefined,
    species: (raw.species as string | undefined) ?? undefined,
    tier: (raw.tier as number | undefined) ?? undefined,
    variantOf: (raw.variantOf as string | undefined) ?? undefined,
    traits: (raw.traits as string[] | undefined) ?? undefined,
    resistances: (raw.resistances as Partial<Record<DamageType, number>> | undefined) ?? undefined,
    naturalArmor: (raw.naturalArmor as number | undefined) ?? undefined,
    bodyScale: (raw.bodyScale as number | undefined) ?? undefined,
    sex: raw.sex === false ? false : undefined,
    limbMap: (raw.limbMap as string | undefined) ?? undefined,
    spawnsInMountain: (raw.spawnsInMountain as boolean | undefined) ?? undefined,
    maxMountainDistance: (raw.maxMountainDistance as number | undefined) ?? undefined,
    lair: (raw.lair as string | undefined) ?? undefined,
    lairRange: (raw.lairRange as number | undefined) ?? undefined,
    hungerRate: (raw.hungerRate as number | undefined) ?? undefined,
    foodOverflow: (raw.foodOverflow as number | undefined) ?? undefined,
    audio: (raw.audio as string | undefined) ?? undefined
  };
}

export const CREATURES: CreatureDefinition[] = (creaturesData as unknown as RawCreature[]).map(
  toDefinition
);

const CREATURES_BY_ID: Map<string, CreatureDefinition> = new Map(CREATURES.map((c) => [c.id, c]));

export function getCreatureById(id: string): CreatureDefinition | undefined {
  return CREATURES_BY_ID.get(id);
}

export function getCreaturesByClass(entityClass: EntityClass): CreatureDefinition[] {
  return CREATURES.filter((c) => c.entityClass === entityClass);
}
