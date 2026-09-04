import woundsRaw from '../../database/pawns/wounds.json';
import { PART_DEF_MAP, boneBreakBudget } from './bodyParts';
import { rng } from '../util/rng';
import type { DamageType } from '../types';
import type { Injury, LimbState, BodyPartId } from '../types/health';

export interface WoundDef {
  id: string;
  name: string;
  fromDamageType: string;
  bleedMod: number;
  painPerDamage: number;
  healDifficulty: number;
  structural?: boolean;
  canScar?: boolean;
  scarChanceMult?: number;
  scarType?: string;
}

export interface ScarringConfig {
  baseChanceBySeverity: Record<'minor' | 'serious' | 'critical', number>;
  tendReduction: number;
  infectedMult: number;
  chanceCap: number;
  damageFrac: Record<WoundSeverity, number>;
  pain: Record<WoundSeverity, number>;
}

export interface HealingConfig {
  baseHealPerTick: number;
  sleepingMultiplier: number;
  wellFedHunger: number;
  wellFedMultiplier: number;
  goodMood: number;
  goodMoodMultiplier: number;
}

export interface CareConfig {
  tendIntervalTicks: number;
  treatmentDurationTicks: number;
  treatedHealMultiplier: number;
  minTendQuality: number;
  infectionIncubationTicks: number;
  infectionRiskPerWound: number;
  infectionRiskMax: number;
  infectionRecovery: number;
  infectionTreatment: number;
  immuneResistBase: number;
}

const data = woundsRaw as unknown as {
  healing: HealingConfig;
  care: CareConfig;
  scarring: ScarringConfig;
  wounds: WoundDef[];
};

export const WOUND_DEFS: WoundDef[] = data.wounds;
export const HEALING_CONFIG: HealingConfig = data.healing;
export const CARE_CONFIG: CareConfig = data.care;
export const SCARRING_CONFIG: ScarringConfig = data.scarring;

const BY_DAMAGE_TYPE = new Map<string, WoundDef>(WOUND_DEFS.map((w) => [w.fromDamageType, w]));
const BY_ID = new Map<string, WoundDef>(WOUND_DEFS.map((w) => [w.id, w]));

export function woundForDamageType(dt: DamageType): WoundDef {
  return BY_DAMAGE_TYPE.get(dt) ?? BY_DAMAGE_TYPE.get('blunt') ?? WOUND_DEFS[0];
}

export function woundById(id: string): WoundDef | undefined {
  return BY_ID.get(id);
}

export type WoundSeverity = 'minor' | 'serious' | 'critical' | 'destroyed';

export function isUncareable(w: Pick<Injury, 'permanent' | 'severity' | 'bleeding'>): boolean {
  return w.permanent === true || (w.severity === 'destroyed' && w.bleeding <= 0);
}

export function severityFromFrac(frac: number): WoundSeverity {
  if (frac >= 1.0) return 'destroyed';
  if (frac >= 0.7) return 'critical';
  if (frac >= 0.4) return 'serious';
  return 'minor';
}

const SEVERITY_RANK: Record<WoundSeverity, number> = {
  minor: 0,
  serious: 1,
  critical: 2,
  destroyed: 3
};
export function maxSeverity(a: WoundSeverity, b: WoundSeverity): WoundSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export function makeScarInjury(
  partId: BodyPartId,
  baseType: Injury['type'],
  peak: WoundSeverity,
  maxHp: number,
  inflictedAt = 0
): Injury {
  const scarType = (woundById(baseType)?.scarType ?? baseType) as Injury['type'];
  const damage = Math.round(maxHp * (SCARRING_CONFIG.damageFrac[peak] ?? 0) * 10) / 10;
  return {
    bodyPart: partId,
    type: scarType,
    severity: peak,
    peakSeverity: peak,
    damage,
    bleeding: 0,
    painContribution: SCARRING_CONFIG.pain[peak] ?? 0,
    infected: false,
    clotProgress: 3,
    inflictedAt,
    permanent: true
  };
}

function rollScarOnHeal(w: Injury, maxHp: number): Injury | null {
  const wd = woundById(w.type);
  if (!wd?.canScar) return null;
  const peak = w.peakSeverity ?? w.severity;
  const base = SCARRING_CONFIG.baseChanceBySeverity[peak as 'minor' | 'serious' | 'critical'];
  if (!base) return null;
  const tendFactor = 1 - SCARRING_CONFIG.tendReduction * (w.treatmentQuality ?? 0);
  const infectFactor = w.infected ? SCARRING_CONFIG.infectedMult : 1;
  const chance = Math.min(
    SCARRING_CONFIG.chanceCap,
    base * (wd.scarChanceMult ?? 1) * tendFactor * infectFactor
  );
  if (rng.random() >= chance) return null;
  return makeScarInjury(w.bodyPart, w.type, peak, maxHp, w.inflictedAt);
}

export function isTended(w: Injury, turn: number): boolean {
  if (w.treatedAt == null) return false;
  return turn - w.treatedAt < CARE_CONFIG.treatmentDurationTicks * (w.treatmentQuality ?? 0);
}

const BLEED_CONSTANT = 32;
const SEVERED_STUMP_BLEED_MOD = 2.5;
function bleedSizeScale(partDef: { maxHp: number } | undefined, maxHp: number): number {
  return partDef && partDef.maxHp > 0 ? maxHp / partDef.maxHp : 1;
}
function clotsNeeded(severity: Injury['severity']): number {
  return severity === 'minor' ? 1 : severity === 'serious' ? 2 : 3;
}
function clotRemaining(
  w: Pick<Injury, 'severity' | 'clotProgress' | 'treatedAt' | 'bloodletting'>
): number {
  if (w.treatedAt != null) return 0;
  const need = clotsNeeded(w.severity) + (w.bloodletting ? 1 : 0);
  return Math.max(0, (need - (w.clotProgress ?? 0)) / need);
}
export const CLOT_ROLL_INTERVAL = 2250;
export const BASE_CLOT_CHANCE = 0.4;
export const MOB_CLOT_ROLL_INTERVAL = 750;
export const MOB_BASE_CLOT_CHANCE = 0.7;
export const MOB_BLOODLETTING_CLOT_FACTOR = 0.5;

export function recomputeWound(
  bodyPart: BodyPartId,
  type: Injury['type'],
  accumDamage: number,
  prev?: Pick<
    Injury,
    | 'infected'
    | 'treatedAt'
    | 'treatmentQuality'
    | 'inflictedAt'
    | 'clotProgress'
    | 'permanent'
    | 'bloodletting'
    | 'peakSeverity'
  >,
  turn?: number,
  maxHpOverride?: number
): Injury {
  const partDef = PART_DEF_MAP[bodyPart];
  const wd = woundById(type);
  const maxHp = maxHpOverride ?? partDef?.maxHp ?? 1;
  const denom = wd?.structural ? boneBreakBudget(partDef, maxHp) : maxHp;
  const frac = denom > 0 ? Math.min(accumDamage / denom, 1) : 0;
  const severity = severityFromFrac(frac);
  const peakSeverity = maxSeverity(prev?.peakSeverity ?? severity, severity);
  const clotProgress = prev?.clotProgress ?? 0;
  const remaining = clotRemaining({
    severity,
    clotProgress,
    treatedAt: prev?.treatedAt,
    bloodletting: prev?.bloodletting
  });
  return {
    bodyPart,
    type,
    severity,
    damage: accumDamage,
    bleeding: partDef
      ? Math.round(
          partDef.bleedRatio *
            BLEED_CONSTANT *
            (severity === 'destroyed'
              ? Math.max(wd?.bleedMod ?? 0, SEVERED_STUMP_BLEED_MOD)
              : (wd?.bleedMod ?? 0)) *
            frac *
            remaining *
            bleedSizeScale(partDef, maxHp) *
            100
        ) / 100
      : 0,
    painContribution:
      Math.round(
        frac *
          (partDef?.maxHp ?? maxHp) *
          (wd?.painPerDamage ?? 0.5) *
          (partDef?.isVital ? 2 : 1) *
          10
      ) / 10,
    infected: prev?.infected ?? false,
    treatedAt: prev?.treatedAt,
    treatmentQuality: prev?.treatmentQuality,
    clotProgress,
    inflictedAt: prev?.inflictedAt ?? turn,
    permanent: prev?.permanent,
    bloodletting: prev?.bloodletting,
    peakSeverity
  };
}

export function recomputeWoundInPlace(
  w: Injury,
  accumDamage: number,
  turn?: number,
  maxHpOverride?: number
): void {
  const partDef = PART_DEF_MAP[w.bodyPart];
  const wd = woundById(w.type);
  const maxHp = maxHpOverride ?? partDef?.maxHp ?? 1;
  const denom = wd?.structural ? boneBreakBudget(partDef, maxHp) : maxHp;
  const frac = denom > 0 ? Math.min(accumDamage / denom, 1) : 0;
  const sev = severityFromFrac(frac);
  w.peakSeverity = maxSeverity(w.peakSeverity ?? sev, sev);
  w.severity = sev;
  w.damage = accumDamage;
  const remaining = clotRemaining(w);
  const effBleedMod =
    w.severity === 'destroyed'
      ? Math.max(wd?.bleedMod ?? 0, SEVERED_STUMP_BLEED_MOD)
      : (wd?.bleedMod ?? 0);
  w.bleeding = partDef
    ? Math.round(
        partDef.bleedRatio *
          BLEED_CONSTANT *
          effBleedMod *
          frac *
          remaining *
          bleedSizeScale(partDef, maxHp) *
          100
      ) / 100
    : 0;
  w.painContribution =
    Math.round(
      frac *
        (partDef?.maxHp ?? maxHp) *
        (wd?.painPerDamage ?? 0.5) *
        (partDef?.isVital ? 2 : 1) *
        10
    ) / 10;
  if (w.inflictedAt == null) w.inflictedAt = turn;
}

export function rollWoundClotting(
  limbs: LimbState[],
  clotChance: number,
  turn: number,
  bloodlettingFactor = 0
): boolean {
  let changed = false;
  for (const limb of limbs) {
    let limbChanged = false;
    for (const part of limb.parts ?? []) {
      for (const w of part.injuries) {
        if (w.bleeding <= 0 || w.treatedAt != null) continue;
        const chance = w.bloodletting ? clotChance * bloodlettingFactor : clotChance;
        if (chance <= 0) continue;
        if ((w.clotProgress ?? 0) >= clotsNeeded(w.severity) + (w.bloodletting ? 1 : 0)) continue;
        if (rng.random() < chance) {
          w.clotProgress = (w.clotProgress ?? 0) + 1;
          recomputeWoundInPlace(w, w.damage, turn);
          limbChanged = true;
        }
      }
    }
    if (limbChanged) {
      limb.bleedRate = (limb.parts ?? []).reduce(
        (s, p) => s + p.injuries.reduce((ps, x) => ps + x.bleeding, 0),
        0
      );
      changed = true;
    }
  }
  return changed;
}

const UNTENDED_SERIOUS_HEAL_MUL = 0.15;

export function healLimbs(
  limbs: LimbState[],
  baseHeal: number,
  turn: number,
  untendedSeriousStalls: boolean,
  canScar = false,
  boneHealFor?: (partId: string) => number
): LimbState[] {
  if (baseHeal <= 0) return limbs;
  let changed = false;
  const newLimbs = limbs.map((limb) => {
    const parts = limb.parts;
    if (!parts || !parts.some((p) => p.injuries.some((w) => !w.permanent))) return limb;
    const newParts = parts.map((part) => {
      if (part.isMissing || !part.injuries.some((w) => !w.permanent)) return part;
      let healed = 0;
      const newWounds: Injury[] = [];
      for (const w of part.injuries) {
        if (w.permanent) {
          newWounds.push(w);
          continue;
        }
        const tended = isTended(w, turn);
        const tendBoost = tended
          ? 1 + CARE_CONFIG.treatedHealMultiplier * (w.treatmentQuality ?? 0)
          : untendedSeriousStalls && w.severity !== 'minor'
            ? UNTENDED_SERIOUS_HEAL_MUL
            : 1;
        const wd = woundById(w.type);
        const splintBoost = wd?.structural && boneHealFor ? boneHealFor(part.id) : 1;
        const heal = (baseHeal / (wd?.healDifficulty ?? 1)) * tendBoost * splintBoost;
        const newDamage = w.damage - heal;
        if (newDamage <= 0.05) {
          const scar = canScar ? rollScarOnHeal(w, part.maxHp) : null;
          if (scar) {
            healed += w.damage - scar.damage;
            newWounds.push(scar);
          } else {
            healed += w.damage;
          }
          continue;
        }
        healed += heal;
        newWounds.push(recomputeWound(part.id, w.type, newDamage, w, turn, part.maxHp));
      }
      const permanentDamage = newWounds.reduce((s, w) => (w.permanent ? s + w.damage : s), 0);
      const health =
        newWounds.length === 0
          ? part.maxHp
          : Math.min(part.maxHp - permanentDamage, part.health + healed);
      const hasBone = PART_DEF_MAP[part.id]?.boneHp != null;
      const fractureW = newWounds.find((w) => woundById(w.type)?.structural);
      const boneBroken =
        hasBone &&
        fractureW != null &&
        fractureW.damage >= boneBreakBudget(PART_DEF_MAP[part.id], part.maxHp);
      return { ...part, health, injuries: newWounds, boneBroken };
    });
    const totalBleed = newParts.reduce(
      (s, p) => s + p.injuries.reduce((ps, w) => ps + w.bleeding, 0),
      0
    );
    const partMaxTotal = newParts.reduce((s, p) => s + p.maxHp, 0);
    const partHealthTotal = newParts.reduce((s, p) => s + p.health, 0);
    const rolledHealth =
      partMaxTotal > 0 ? Math.round((partHealthTotal / partMaxTotal) * 100) : limb.health;
    changed = true;
    return { ...limb, parts: newParts, health: rolledHealth, bleedRate: totalBleed };
  });
  return changed ? newLimbs : limbs;
}

export function healLimbsInPlace(
  limbs: LimbState[],
  baseHeal: number,
  turn: number,
  untendedSeriousStalls: boolean
): boolean {
  if (baseHeal <= 0) return false;
  let changed = false;
  for (const limb of limbs) {
    const parts = limb.parts;
    if (!parts || !parts.some((p) => p.injuries.some((w) => !w.permanent))) continue;
    for (const part of parts) {
      if (part.isMissing || !part.injuries.some((w) => !w.permanent)) continue;
      let healed = 0;
      let write = 0;
      const inj = part.injuries;
      for (let read = 0; read < inj.length; read++) {
        const w = inj[read];
        if (w.permanent) {
          inj[write++] = w;
          continue;
        }
        const tended = isTended(w, turn);
        const tendBoost = tended
          ? 1 + CARE_CONFIG.treatedHealMultiplier * (w.treatmentQuality ?? 0)
          : untendedSeriousStalls && w.severity !== 'minor'
            ? UNTENDED_SERIOUS_HEAL_MUL
            : 1;
        const heal = (baseHeal / (woundById(w.type)?.healDifficulty ?? 1)) * tendBoost;
        const newDamage = w.damage - heal;
        if (newDamage <= 0.05) {
          healed += w.damage;
          continue;
        }
        healed += heal;
        recomputeWoundInPlace(w, newDamage, turn, part.maxHp);
        inj[write++] = w;
      }
      if (write !== inj.length) inj.length = write;
      part.health = inj.length === 0 ? part.maxHp : Math.min(part.maxHp, part.health + healed);
      const hasBone = PART_DEF_MAP[part.id]?.boneHp != null;
      const fractureW = inj.find((w) => woundById(w.type)?.structural);
      part.boneBroken =
        hasBone &&
        fractureW != null &&
        fractureW.damage >= boneBreakBudget(PART_DEF_MAP[part.id], part.maxHp);
    }
    let totalBleed = 0;
    let partMaxTotal = 0;
    let partHealthTotal = 0;
    for (const p of parts) {
      for (const w of p.injuries) totalBleed += w.bleeding;
      partMaxTotal += p.maxHp;
      partHealthTotal += p.health;
    }
    limb.health =
      partMaxTotal > 0 ? Math.round((partHealthTotal / partMaxTotal) * 100) : limb.health;
    limb.bleedRate = totalBleed;
    changed = true;
  }
  return changed;
}
