import type { Aptitudes } from '../rules/body/aptitudes';
import type { EntityStats, StatKey, GrowthOffer, LineagePath } from './culture';
import type { EntityNeeds, EntityCondition, Injury, LimbState } from './health';
import type { PawnInventory, PawnEquipment, EquipmentSlot } from './items';
import type { Trait } from './culture';
import type { KinTie, MoodModifier, SocialBreak, EventMemory } from './social';

export type MobState =
  | 'Wander'
  | 'Alerted'
  | 'Attacking'
  | 'Fleeing'
  | 'Traveling'
  | 'Grazing'
  | 'Startled'
  | 'Exhausted'
  | 'Tamed'
  | 'Sleeping'
  | 'Foraging'
  | 'Hunting'
  | 'Eating'
  | 'Collapsed'
  | 'Corpse';

export interface Mob {
  id: string;
  debugId?: number;
  creatureId: string;
  name?: string;
  entityClass: 'mob' | 'animal';
  age?: number;
  sex?: 'male' | 'female';
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  state: MobState;
  stateSince: number;
  targetPawnId?: string;
  path?: { x: number; y: number }[];
  pathIndex?: number;
  nextCellCostLeft?: number;
  diedAt?: number;
  needs: EntityNeeds;
  conditions?: EntityCondition[];
  stats: EntityStats;
  aptitudes?: Aptitudes;
  eatProgress?: number;
  huntTargetId?: string;
  carcassTargetId?: string;
  huntCooldownUntil?: number;
  forageCooldownUntil?: number;
  lastThinkTick?: number;
  fleeDest?: { x: number; y: number };
  chaseAnchorX?: number;
  chaseAnchorY?: number;
  lastSeenX?: number;
  lastSeenY?: number;
  stealthChecks?: Record<string, { at: number; detected: boolean }>;
  alertedPawn?: boolean;
  blockedTicks?: number;
  limbs?: LimbState[];
  bloodVolume?: number;
  maxBloodVolume?: number;
  transientConditions?: string[];
  isAlive?: boolean;
  intactness?: number;
  skills: Record<string, number>;
  stamina?: number;
  maxStamina?: number;
  physicalTraits?: {
    height: number;
    weight: number;
    size: string;
  };
  injuries?: Injury[];
  pain?: number;
  effectiveLight?: number;
  aggroRange?: number;
  attackCooldown?: number;
  conditionTimers?: Record<string, number>;
  hideWear?: Record<string, number>;
  hideWearAt?: number;
  equipment?: PawnEquipment;
  naturalArmorOverride?: number;
  traits?: Trait[];
  markedForHunt?: boolean;
  marked?: boolean;
  lairId?: string;
  lairX?: number;
  lairY?: number;
  lairRange?: number;
  kingdomId?: string;
  partyId?: string;
  partyRole?: 'trader' | 'guard' | 'visitor' | 'pack';
  worldKinRelation?: string;
  travelGoalX?: number;
  travelGoalY?: number;
}

export interface TamedAnimal {
  id: string;
  creatureId: string;
  ownerPawnId: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
}

export interface PawnState {
  mood: number;
  health?: number;
  isWorking: boolean;
  isSleeping: boolean;
  isEating: boolean;
}

export type PawnOrder =
  | { type: 'move'; x: number; y: number }
  | {
      type: 'attack';
      targetId: string;
      targetType: 'pawn' | 'mob';
      mode?: 'ranged' | 'melee';
    }
  | { type: 'haul'; x: number; y: number }
  | { type: 'equip'; dropId: string; x: number; y: number; slot?: EquipmentSlot | 'inventory' }
  | { type: 'rescue'; victimId: string; auto?: boolean }
  | { type: 'tend'; patientId: string; nextTendTurn?: number }
  | { type: 'forceJob'; jobId: string }
  | { type: 'forceConsume'; dropId: string; x: number; y: number }
  | { type: 'drink'; x: number; y: number };

export interface Pawn {
  id: string;
  debugId?: number;
  name: string;
  inventory: PawnInventory;
  equipment: PawnEquipment;
  pinnedItems?: string[];
  stats: EntityStats;
  aptitudes?: Aptitudes;

  maxStats?: EntityStats;
  favStats?: StatKey[];
  sex?: 'male' | 'female';
  age?: number;
  birthDayOfYear?: number;
  lastGrowthSeason?: number;
  pendingGrowth?: GrowthOffer[];
  deeds?: Record<string, number>;
  lineagePaths?: LineagePath[];
  bloodNeedKind?: 'carcass' | 'humanoid';
  silkSpinner?: boolean;

  physicalTraits: {
    height: number;
    weight: number;
    size: string;
  };

  needs: EntityNeeds;
  state: PawnState;

  cultureId?: string;
  cultureName?: string;

  homeKingdomId?: string;
  childhoodId?: string;
  adulthoodId?: string;
  basePrestige?: number;

  familyId?: string;
  kin?: KinTie[];
  lastSeenTurn?: number;
  moodModifiers?: MoodModifier[];
  memories?: EventMemory[];
  socialBreak?: SocialBreak;

  traits: Trait[];

  skills: Record<string, number>;
  skillXp?: Record<string, number>;
  workStyle?: number;
  currentWork?: string;
  workLocation?: string;

  position?: { x: number; y: number };
  path?: { x: number; y: number }[];
  pathIndex?: number;
  isMoving?: boolean;
  hasReachedDestination?: boolean;
  nextCellCostLeft?: number;
  blockedTicks?: number;

  transientConditions?: string[];

  conditions?: EntityCondition[];
  limbs?: LimbState[];
  bloodVolume?: number;
  maxBloodVolume?: number;
  isAlive?: boolean;
  corpseDropped?: boolean;

  injuries?: Injury[];
  pain?: number;
  effectiveLight?: number;
  attackCooldown?: number;
  aggroRange?: number;
  conditionTimers?: Record<string, number>;
  stamina?: number;
  maxStamina?: number;

  combatStance?: 'aggressive' | 'defensive' | 'flee';

  restPolicy?: 'never' | 'shelter' | 'always';
  medicineTierCap?: number;

  forceWork?: boolean;

  huntTargetId?: string;

  drafted?: boolean;
  draftTarget?: PawnOrder;

  manualQueue?: PawnOrder[];

  tendProgress?: number;

  carriedBy?: string;

  currentState?: string;
  jobQueue?: string[];

  carryingForOrder?: string;

  carriedUnitConditions?: Record<string, number[]>;

  activeJob?: {
    type:
      | 'harvest'
      | 'construct'
      | 'craft'
      | 'haul'
      | 'fetch'
      | 'need'
      | 'deconstruct'
      | 'plant'
      | 'rescue';
    jobId?: string;
    targetX: number;
    targetY: number;
    patientId?: string;
    resourceId?: string;
    droppedItemId?: string;
    buildingId?: string;
    craftQueueId?: string;
    progress: number;
    timeRequired: number;
    startedTurn?: number;
    targetState?: string;
    turnsInState?: number;
    hungerToRecover?: number;
    drinkRelief?: number;
    depositX?: number;
    depositY?: number;
    toolFetch?: { itemId: string; siteX: number; siteY: number };
  };
}
