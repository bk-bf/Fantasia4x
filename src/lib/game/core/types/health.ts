import type { KinTie } from './social';

export interface EntityNeeds {
  hunger: number;
  fatigue: number;
  sleep: number;
  lastSleep: number;
  lastMeal: number;
  thirst?: number;
  hygiene?: number;
  lastDrink?: number;
  lastWash?: number;
  wetness?: number;
  coldExposure?: number;
  heatExposure?: number;
  bloodHunger?: number;
  relaxation?: number;
  lastSocialise?: number;
  comfort?: number;
  lastLounge?: number;
}

export interface TransientConditionDef extends ConditionGraphFields {
  id: string;
  name: string;
  transient: true;
  description: string;
  color: string;
  charSpans?: Array<{ sheet?: string; id?: number; from?: number; to?: number; literal?: string }>;
  hidden?: boolean;
  magical?: boolean;
  floater?: boolean;
  audio?: string;
  hostParts?: string[];
  needOnset?: { need: string; atOrAbove: number };
  priority?: number;
  fsmState?: string;
  onExpiry?: { to: string; durationHours: number };
  selfTrigger?: { meter: 'pain'; atOrAbove: number; durationHours: number };
  grants?: { nightVision?: number };
  stages?: ConditionStage[];
  modifiers: ConditionModifiers;
}

export interface EntityCondition {
  id: string;
  severity: number;
}

export type LimbId = string;

export const CRITICAL_LIMBS: LimbId[] = ['head', 'torso'];

export type DamageType = 'cutting' | 'piercing' | 'blunt' | 'fire' | 'frost' | 'lightning';

export type BodyPartId = string;

export interface Injury {
  bodyPart: BodyPartId;
  type:
    | 'cut'
    | 'fracture'
    | 'puncture'
    | 'crush'
    | 'burn'
    | 'frostbite'
    | 'scorch'
    | 'cut_scar'
    | 'puncture_scar'
    | 'crush_scar'
    | 'fracture_scar'
    | 'burn_scar'
    | 'frostbite_scar'
    | 'scorch_scar';
  severity: 'minor' | 'serious' | 'critical' | 'destroyed';
  peakSeverity?: 'minor' | 'serious' | 'critical' | 'destroyed';
  damage: number;
  bleeding: number;
  painContribution: number;
  infected: boolean;
  treatedAt?: number;
  inflictedAt?: number;
  treatmentQuality?: number;
  clotProgress?: number;
  permanent?: boolean;
  bloodletting?: boolean;
}

export interface BodyPartState {
  id: BodyPartId;
  health: number;
  maxHp: number;
  isMissing: boolean;
  boneBroken?: boolean;
  injuries: Injury[];
}

export interface LimbState {
  id: LimbId;
  health: number;
  isMissing: boolean;
  bleedRate: number;
  parts?: BodyPartState[];
}

export interface ConditionModifiers {
  strength?: number;
  dexterity?: number;
  constitution?: number;
  perception?: number;
  intelligence?: number;
  workEfficiency?: number;
  moveSpeed?: number;
  hungerRate?: number;
  fatigueRate?: number;
  thirstRate?: number;
  hygieneRate?: number;
  consciousness?: number;
  dodge?: number;
  hitChance?: number;
  pain?: number;
  [key: string]: number | undefined;
}

export interface ConditionStage {
  label: string;
  minSeverity: number;
  color: string;
  lifeThreatening?: boolean;
  modifiers: ConditionModifiers;
}

export interface ConditionDriver {
  need?: string;
  source?: 'cold' | 'heat';
  onset: number;
  safe: number;
  rateCritical: number;
  rateMax: number;
  recovery: number;
  onsetDelay?: number;
}

export interface ConditionPredicate {
  need?: string;
  meter?: 'bloodFrac' | 'pain' | 'ambientLight' | 'severity';
  atOrAbove?: number;
  atOrBelow?: number;
  unsheltered?: boolean;
  fullMoon?: boolean;
  hasCondition?: string;
  lacksCondition?: string;
}

export interface ConditionTrigger {
  to: string;
  when?: ConditionPredicate;
  chance?: number;
  severity?: number;
  durationHours?: number;
  per?: 'tick' | 'onset';
}

export interface ConditionGraphFields {
  flags?: string[];
  mood?: string;
  triggers?: ConditionTrigger[];
  activateWhen?: ConditionPredicate;
}

export interface ConditionDef extends ConditionGraphFields {
  id: string;
  name: string;
  transient?: false;
  description: string;
  charSpans?: Array<{ sheet?: string; id?: number; from?: number; to?: number; literal?: string }>;
  lethalSeverity: number;
  stages: ConditionStage[];
  driver?: ConditionDriver;
  floater?: boolean;
  audio?: string;
}

export interface DeadPawnRecord {
  name: string;
  cause:
    | 'malnutrition'
    | 'dehydration'
    | 'blood_loss'
    | 'critical_limb'
    | 'combat'
    | 'exhaustion_cascade'
    | 'infection'
    | 'hypothermia'
    | 'heat_stroke'
    | 'burning';
  turn: number;
  stats: { strength: number; dexterity: number; intelligence: number };
  id?: string;
  kin?: KinTie[];
}
