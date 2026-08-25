import type { ItemInstance, ItemQuality } from './items';
import type { EntityStats } from './culture';

export type LaborLevel = 0 | 1 | 2 | 3 | 4;
export const LABOR_LEVEL = { DISABLED: 0, LOW: 1, NORMAL: 2, HIGH: 3, URGENT: 4 } as const;

export interface DroppedItem {
  id: string;
  resourceId: string;
  x: number;
  y: number;
  quantity: number;
  stored?: boolean;
  durability?: number;
  drying?: number;
  decayAcc?: number;
  unitConditions?: number[];
  instance?: ItemInstance;
  quality?: ItemQuality;
  matDur?: number;
  matWeight?: number;
  name?: string;
  reservedFor?: string;
  forbidden?: boolean;
  urgent?: boolean;
  rehaulCooldownUntil?: number;
}

export interface Job {
  id: string;
  type:
    | 'harvest'
    | 'construct'
    | 'haul'
    | 'fetch'
    | 'fill'
    | 'craft'
    | 'caretake'
    | 'rescue'
    | 'eat'
    | 'sleep'
    | 'light'
    | 'refuel'
    | 'repair'
    | 'deconstruct'
    | 'plant';
  targetX: number;
  targetY: number;
  patientId?: string;
  resourceId?: string;
  vesselInstanceId?: string;
  manual?: boolean;
  droppedItemId?: string;
  buildingId?: string;
  craftQueueId?: string;
  stationX?: number;
  stationY?: number;
  workRequired: number;
  workDone: number;
  claimedBy: string | null;
  urgent?: boolean;
}

export interface JobDef {
  id: string;
  label: string;
  workCategory?: string;
  workCategorySource?: 'designation' | 'recipe-output';
  claimGate?: 'harvestTool' | 'craftTool' | 'refuelAllowlist' | 'repairAllowlist';
  lightAffected?: boolean;
  audio?: string;
  disciplines?: DisciplineDef[];
}

export interface DisciplineDef {
  id: string;
  label: string;
  station?: string;
  subjobs?: DisciplineDef[];
}

export interface WorkCategory {
  id: string;
  name: string;
  description: string;
  color: string;

  toolsRequired?: string[];
  boostTools?: string[];
  skillRequired?: string;

  primaryStat: keyof EntityStats;
  secondaryStat?: keyof EntityStats;

  baseEfficiency: number;
}

export interface WorkAssignment {
  pawnId: string;
  workPriorities: Record<string, number>;
  laborSettings?: Record<string, LaborLevel>;
  currentWork?: string;
}
