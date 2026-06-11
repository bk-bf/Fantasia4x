// Wounds.ts — loads wounds.jsonc and resolves wound types + severity (data-driven).
// Combat maps each hit's damage type to a wound here; severity escalates with the
// wound's accumulated damage relative to the struck part's max HP.
import woundsRaw from '../database/wounds.jsonc';
import type { DamageType } from './types';

export interface WoundDef {
  id: string;
  name: string;
  fromDamageType: string;
  /** 0–1 scale on open-wound bleed (cutting 1.0, piercing 0.5, blunt/burn 0). */
  bleedMod: number;
  /** Pain per accumulated HP of this wound (doubled on a vital part). */
  painPerDamage: number;
  /** Multiplier on heal time — higher mends slower. */
  healDifficulty: number;
}

export interface HealingConfig {
  /** Part HP recovered per tick, per wound, at heal_rate 1.0. */
  baseHealPerTick: number;
  sleepingMultiplier: number;
  wellFedHunger: number;
  wellFedMultiplier: number;
  goodMood: number;
  goodMoodMultiplier: number;
}

export interface CareConfig {
  /** Ticks between tend attempts on a patient. */
  tendIntervalTicks: number;
  /** Base treatment lifespan (scaled by quality). */
  treatmentDurationTicks: number;
  /** Treated wounds heal up to this much faster (× quality). */
  treatedHealMultiplier: number;
  /** A tend below this rolled quality fails (no treatment applied). */
  minTendQuality: number;
  /** Infection pressure per tick per untended open wound. */
  infectionRiskPerWound: number;
  /** Infection severity recovered per tick when pressure is suppressed. */
  infectionRecoveryPerTick: number;
  /** Base immune resistance (added to CON scaling). */
  immuneResistBase: number;
}

const data = woundsRaw as unknown as {
  healing: HealingConfig;
  care: CareConfig;
  wounds: WoundDef[];
};

export const WOUND_DEFS: WoundDef[] = data.wounds;
export const HEALING_CONFIG: HealingConfig = data.healing;
export const CARE_CONFIG: CareConfig = data.care;

const BY_DAMAGE_TYPE = new Map<string, WoundDef>(WOUND_DEFS.map((w) => [w.fromDamageType, w]));
const BY_ID = new Map<string, WoundDef>(WOUND_DEFS.map((w) => [w.id, w]));

/** The wound a given damage type inflicts (falls back to crush/blunt). */
export function woundForDamageType(dt: DamageType): WoundDef {
  return BY_DAMAGE_TYPE.get(dt) ?? BY_DAMAGE_TYPE.get('blunt') ?? WOUND_DEFS[0];
}

export function woundById(id: string): WoundDef | undefined {
  return BY_ID.get(id);
}

export type WoundSeverity = 'minor' | 'serious' | 'critical' | 'destroyed';

/** Severity from a wound's accumulated damage as a fraction of the part's max HP. */
export function severityFromFrac(frac: number): WoundSeverity {
  if (frac >= 1.0) return 'destroyed';
  if (frac >= 0.7) return 'critical';
  if (frac >= 0.4) return 'serious';
  return 'minor';
}
