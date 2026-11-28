import type { ConditionView } from '$lib/components/util/conditionInfo';
import type { ItemPillView } from '../widget/ItemPills.svelte';
import type { StatPillView } from '../widget/StatPills.svelte';

export interface EntityStat {
  label: string;
  value: string | number;
  warn?: boolean;
}

export interface EntityBar {
  label: string;
  value: number;
  max?: number;
  warn?: boolean;
  color?: string;
  valueText?: string;
  title?: string;
}

export interface EntityButton {
  label: string;
  onClick: () => void;
  active?: boolean;
}

export interface SelectedEntityModel {
  name: string;
  flavor?: string;
  status?: string;
  selected?: boolean;
  dismissable?: boolean;
  mood?: number;
  stats?: EntityStat[];
  conditionViews?: ConditionView[];
  itemPills?: ItemPillView[];
  bars?: EntityBar[];
  job?: { text: string; idle?: boolean };
  progress?: number;
  note?: string;
  pos?: { x: number; y: number };
  posMeta?: string;
  lines?: string[];
  growthPct?: number;
  buttons?: EntityButton[];
  health?: HealthModel;
  armor?: ArmorModel;
  onSelect?: () => void;
}

export interface MoodContribution {
  label: string;
  value: number;
}

export interface MoodModel {
  mood: number;
  target: number;
  contributions: MoodContribution[];
}

export interface HealthWound {
  text: string;
  warn?: boolean;
  treated?: boolean;
}

export interface HealthPart {
  label: string;
  health: number;
  maxHp: number;
  missing?: boolean;
  bleedRate?: number;
  wounds: HealthWound[];
}

export interface HealthLimb {
  label: string;
  health: number;
  missing?: boolean;
  bleedRate?: number;
  parts: HealthPart[];
}

export interface HealthModel {
  blood?: { current: number; max: number };
  bleedRate?: number;
  pain?: number;
  coldExposure?: number;
  heatExposure?: number;
  pills?: StatPillView[];
  limbs: HealthLimb[];
}

export interface ArmorPart {
  label: string;
  armor: number;
  weak?: boolean;
}

export interface ArmorLimb {
  label: string;
  parts: ArmorPart[];
}

export interface ArmorModel {
  limbs: ArmorLimb[];
}
