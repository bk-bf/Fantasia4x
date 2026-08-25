import type {
  EntityCondition,
  ConditionDef,
  ConditionStage,
  ConditionModifiers,
  TransientConditionDef,
  LimbState
} from '../../types';
import conditionsData from '../../../database/pawns/conditions.jsonc';
import { PART_DEF_MAP, boneBreakBudget } from '../../defs/bodyParts';
import { woundById } from '../../defs/wounds';
import { perTick } from '../../util/time';
import { simLog } from '../../util/logSink';

const CONDITIONS_DB = conditionsData as unknown as ConditionDef[];
const ALL_CONDITION_DEFS = conditionsData as unknown as Array<ConditionDef | TransientConditionDef>;
const TRANSIENT_BY_ID = new Map<string, TransientConditionDef>(
  (
    ALL_CONDITION_DEFS.filter(
      (d) => (d as TransientConditionDef).transient === true
    ) as TransientConditionDef[]
  ).map((d) => [d.id, d])
);

export const COLLAPSE_CONSCIOUSNESS = 0.3;
export const RECOVER_CONSCIOUSNESS = 0.32;

export function transientNeedOnset(id: string): { need: string; atOrAbove: number } | undefined {
  return TRANSIENT_BY_ID.get(id)?.needOnset;
}

export function getTransientConditionDef(id: string): TransientConditionDef | undefined {
  return TRANSIENT_BY_ID.get(id);
}

export const FSM_STATE_BY_CONDITION: Record<string, string> = Object.fromEntries(
  [...TRANSIENT_BY_ID.values()].filter((d) => d.fsmState).map((d) => [d.id, d.fsmState!])
);

const CONDITION_BY_ID = new Map<string, ConditionDef | TransientConditionDef>(
  ALL_CONDITION_DEFS.map((d) => [d.id, d])
);
export function getConditionDefById(id: string): ConditionDef | TransientConditionDef | undefined {
  return CONDITION_BY_ID.get(id);
}

export const CONDITION_IDS_WITH_TRIGGERS: ReadonlySet<string> = new Set(
  ALL_CONDITION_DEFS.filter((d) => (d.triggers?.length ?? 0) > 0).map((d) => d.id)
);

export function conditionPriority(id: string): number {
  return TRANSIENT_BY_ID.get(id)?.priority ?? 0;
}

export const TIRED_FATIGUE_THRESHOLD = transientNeedOnset('tired')?.atOrAbove ?? 100;

export function getConditionFloater(id: string): { name: string; color: string } | undefined {
  const def = ALL_CONDITION_DEFS.find((d) => d.id === id);
  if (!def || !(def as TransientConditionDef).floater) return undefined;
  return { name: def.name, color: (def as TransientConditionDef).color ?? '#dddddd' };
}

export function conditionsSig(conds: EntityCondition[]): string {
  if (conds.length === 0) return '';
  let s = '';
  for (let i = 0; i < conds.length; i++) s += conds[i].id + ':' + conds[i].severity + ';';
  return s;
}

export const SHOCK_PAIN_ONSET = 40;
export const SHOCK_BLOOD_ONSET = 0.35;

function setReflectedSeverity(conditions: EntityCondition[], id: string, severity: number): void {
  const sev = Math.min(0.99, Math.max(0, severity));
  const idx = conditions.findIndex((c) => c.id === id);
  if (sev > 0) {
    if (idx === -1) conditions.push({ id, severity: sev });
    else conditions[idx] = { ...conditions[idx], severity: sev };
  } else if (idx !== -1) {
    conditions.splice(idx, 1);
  }
}

export function applyShock(conditions: EntityCondition[], pain: number, bloodLossFrac = 0): void {
  const feltPain = pain * conditionPainMultiplier({ conditions });
  const painSev = (feltPain - SHOCK_PAIN_ONSET) / (100 - SHOCK_PAIN_ONSET);
  const bloodSev = (bloodLossFrac - SHOCK_BLOOD_ONSET) / (1 - SHOCK_BLOOD_ONSET);
  setReflectedSeverity(conditions, 'pain_shock', painSev);
  setReflectedSeverity(conditions, 'hypovolemia', bloodSev);
}

const INTOX_DECAY_PER_SEC = 0.002;

export function decayIntoxication(conditions: EntityCondition[]): void {
  const idx = conditions.findIndex((c) => c.id === 'intoxicated');
  if (idx === -1) return;
  const next = conditions[idx].severity - perTick(INTOX_DECAY_PER_SEC);
  if (next <= 0) conditions.splice(idx, 1);
  else conditions[idx] = { ...conditions[idx], severity: next };
}

function conditionModifierProduct(
  entity: { conditions?: EntityCondition[]; transientConditions?: string[] },
  key: keyof ConditionModifiers
): number {
  const conds = entity.conditions;
  const tconds = entity.transientConditions;
  if ((!conds || conds.length === 0) && (!tconds || tconds.length === 0)) return 1;
  let mult = 1;
  for (const c of conds ?? []) {
    const v = getConditionCurrentStage(c)?.modifiers[key];
    if (v != null) mult *= v;
  }
  for (const id of tconds ?? []) {
    const v = TRANSIENT_BY_ID.get(id)?.modifiers[key];
    if (v != null) mult *= v;
  }
  return mult;
}

export function conditionPainMultiplier(entity: {
  conditions?: EntityCondition[];
  transientConditions?: string[];
}): number {
  return conditionModifierProduct(entity, 'pain');
}

export function conditionConsciousnessMultiplier(entity: {
  conditions?: EntityCondition[];
  transientConditions?: string[];
}): number {
  return conditionModifierProduct(entity, 'consciousness');
}

export function snapshotConditionStages(
  conditions: EntityCondition[]
): Map<string, string> | undefined {
  let snap: Map<string, string> | undefined;
  for (const c of conditions) {
    const def = CONDITIONS_DB.find((d) => d.id === c.id);
    if (!def?.floater) continue;
    const stage = getConditionCurrentStage(c);
    if (stage) (snap ??= new Map()).set(c.id, stage.label);
  }
  return snap;
}

export function emitPersistentConditionFloaters(
  prevStages: Map<string, string> | undefined,
  next: EntityCondition[],
  x: number,
  y: number
): void {
  if (x < 0 || y < 0) return;
  for (const c of next) {
    const def = CONDITIONS_DB.find((d) => d.id === c.id);
    if (!def?.floater) continue;
    const stage = getConditionCurrentStage(c);
    if (!stage || prevStages?.get(c.id) === stage.label) continue;
    simLog.pushCombatText({
      worldX: x,
      worldY: y,
      text: `${def.name} (${stage.label})`,
      kind: 'condition',
      color: stage.color
    });
  }
}

export function conditionAudio(id: string): string | undefined {
  return ALL_CONDITION_DEFS.find((d) => d.id === id)?.audio;
}

const VITAL_ALERT_IDS = new Set(['malnutrition', 'dehydration']);

export function snapshotVitalStages(
  conditions: EntityCondition[]
): Map<string, string> | undefined {
  let snap: Map<string, string> | undefined;
  for (const c of conditions) {
    if (!VITAL_ALERT_IDS.has(c.id)) continue;
    const stage = getConditionCurrentStage(c);
    if (stage) (snap ??= new Map()).set(c.id, stage.label);
  }
  return snap;
}

export function detectVitalEscalations(
  prevStages: Map<string, string> | undefined,
  next: EntityCondition[]
): { id: string; stageLabel: string }[] {
  const out: { id: string; stageLabel: string }[] = [];
  for (const c of next) {
    if (!VITAL_ALERT_IDS.has(c.id)) continue;
    const def = CONDITIONS_DB.find((d) => d.id === c.id);
    if (!def) continue;
    const stages = def.stages;
    let curIdx = -1;
    for (let i = 0; i < stages.length; i++) if (c.severity >= stages[i].minSeverity) curIdx = i;
    if (curIdx < 1) continue;
    const prevLabel = prevStages?.get(c.id);
    const prevIdx = prevLabel ? stages.findIndex((s) => s.label === prevLabel) : -1;
    if (curIdx > prevIdx) out.push({ id: c.id, stageLabel: stages[curIdx].label });
  }
  return out;
}

export function getConditionCurrentStage(condition: EntityCondition): ConditionStage | undefined {
  const def = CONDITIONS_DB.find((d) => d.id === condition.id);
  if (!def) return undefined;
  let active: ConditionStage | undefined;
  for (const stage of def.stages) {
    if (condition.severity >= stage.minSeverity) active = stage;
  }
  return active;
}

export function getConditionName(condition: EntityCondition): string {
  const def = CONDITIONS_DB.find((d) => d.id === condition.id);
  return def?.name ?? condition.id.replace(/_/g, ' ');
}

export function getConditionLabel(condition: EntityCondition): string {
  const def = CONDITIONS_DB.find((d) => d.id === condition.id);
  const name = def?.name ?? condition.id.replace(/_/g, ' ');
  const stage = getConditionCurrentStage(condition);
  return stage ? `${name} (${stage.label})` : name;
}

export function applyConditionDriver(
  conditions: EntityCondition[],
  def: ConditionDef,
  needVal: number,
  recoveryMul = 1,
  tickScale = 1
): void {
  const d = def.driver!;
  const idx = conditions.findIndex((c) => c.id === def.id);
  if (needVal >= d.onset) {
    const rate = perTick(needVal >= 100 ? d.rateMax : d.rateCritical) * tickScale;
    if (idx === -1) {
      conditions.push({ id: def.id, severity: -(d.onsetDelay ?? 0) * d.rateMax + rate });
    } else
      conditions[idx] = {
        ...conditions[idx],
        severity: Math.min(1.0, conditions[idx].severity + rate)
      };
    return;
  }
  if (needVal < d.safe && idx !== -1) {
    const newSeverity = conditions[idx].severity - perTick(d.recovery) * recoveryMul * tickScale;
    if (newSeverity <= 0) conditions.splice(idx, 1);
    else conditions[idx] = { ...conditions[idx], severity: newSeverity };
  }
}

export function driveNeedConditions(
  conditions: EntityCondition[],
  needVals: Record<string, number> | undefined,
  tickScale = 1
): string | null {
  for (const def of CONDITIONS_DB) {
    if (!def.driver) continue;
    if (def.driver.source) continue;
    const needVal = needVals?.[def.driver.need!] ?? 0;
    applyConditionDriver(conditions, def, needVal, 1, tickScale);
    const current = conditions.find((c) => c.id === def.id);
    if (current && current.severity >= def.lethalSeverity) return def.id;
  }
  return null;
}

export function driveTemperatureConditions(
  conditions: EntityCondition[],
  coldExposure: number,
  heatExposure: number,
  recoveryMul = 1
): string | null {
  for (const def of CONDITIONS_DB) {
    const src = def.driver?.source;
    if (!src) continue;
    applyConditionDriver(
      conditions,
      def,
      src === 'heat' ? heatExposure : coldExposure,
      recoveryMul
    );
    const current = conditions.find((c) => c.id === def.id);
    if (current && current.severity >= def.lethalSeverity) return def.id;
  }
  return null;
}

export const LADEN_START = 0.6;
export const ENC_BURDEN_START = 1.0;
export const ENC_OVERLOAD_FULL = 1.4;

function setLoadCondition(conditions: EntityCondition[], id: string, sev: number): void {
  const idx = conditions.findIndex((c) => c.id === id);
  if (sev <= 0) {
    if (idx !== -1) conditions.splice(idx, 1);
    return;
  }
  if (idx === -1) conditions.push({ id, severity: sev });
  else if (Math.abs(conditions[idx].severity - sev) > 1e-3)
    conditions[idx] = { ...conditions[idx], severity: sev };
}

export function driveEncumbrance(conditions: EntityCondition[], loadRatio: number): void {
  const span = (lo: number, hi: number) => Math.min(1, Math.max(0, (loadRatio - lo) / (hi - lo)));
  setLoadCondition(conditions, 'laden', span(LADEN_START, ENC_BURDEN_START));
  setLoadCondition(conditions, 'encumbered', span(ENC_BURDEN_START, ENC_OVERLOAD_FULL));
}

export const WIELD_STRAIN_FULL = 14;

export function driveWieldStrain(conditions: EntityCondition[], shortfall: number): void {
  const sev = Math.min(1, Math.max(0, shortfall / WIELD_STRAIN_FULL));
  const idx = conditions.findIndex((c) => c.id === 'overmatched');
  if (sev <= 0) {
    if (idx !== -1) conditions.splice(idx, 1);
    return;
  }
  if (idx === -1) conditions.push({ id: 'overmatched', severity: sev });
  else if (Math.abs(conditions[idx].severity - sev) > 1e-3)
    conditions[idx] = { ...conditions[idx], severity: sev };
}

export const WIND_ONSET = 0.36;
export const WIND_FULL = 1.0;

export function driveWindchill(
  conditions: EntityCondition[],
  effWind: number,
  onset = WIND_ONSET,
  full = WIND_FULL
): void {
  const sev = Math.min(1, Math.max(0, (effWind - onset) / (full - onset)));
  const idx = conditions.findIndex((c) => c.id === 'windchilled');
  if (sev <= 0) {
    if (idx !== -1) conditions.splice(idx, 1);
    return;
  }
  if (idx === -1) conditions.push({ id: 'windchilled', severity: sev });
  else if (Math.abs(conditions[idx].severity - sev) > 1e-3)
    conditions[idx] = { ...conditions[idx], severity: sev };
}

export const COMFORT_MIN_DEFAULT = 5;
export const COMFORT_MAX_DEFAULT = 30;

export function tempRange(traits: ReadonlyArray<{ name: string }> | undefined): {
  min: number;
  max: number;
} {
  let min = COMFORT_MIN_DEFAULT;
  let max = COMFORT_MAX_DEFAULT;
  if (traits) {
    for (let i = 0; i < traits.length; i++) {
      const name = traits[i].name;
      if (name === 'Cold Blooded') {
        min = 15;
        max = 40;
      } else if (name === 'Insulated') {
        min = -5;
        max = 25;
      }
    }
  }
  return { min, max };
}

export function conditionNeedMultipliers(conditions: EntityCondition[]): {
  hungerRate: number;
  fatigueRate: number;
  thirstRate: number;
  relaxationRate: number;
  hygieneRate: number;
} {
  let hungerRate = 1;
  let fatigueRate = 1;
  let thirstRate = 1;
  let relaxationRate = 1;
  let hygieneRate = 1;
  for (const c of conditions) {
    const stage = getConditionCurrentStage(c);
    if (stage) {
      hungerRate *= stage.modifiers.hungerRate ?? 1;
      fatigueRate *= stage.modifiers.fatigueRate ?? 1;
      thirstRate *= stage.modifiers.thirstRate ?? 1;
      relaxationRate *= stage.modifiers.relaxationRate ?? 1;
      hygieneRate *= stage.modifiers.hygieneRate ?? 1;
    }
  }
  return { hungerRate, fatigueRate, thirstRate, relaxationRate, hygieneRate };
}

export function transientNeedMultipliers(ids: ReadonlyArray<string>): {
  hungerRate: number;
  fatigueRate: number;
  thirstRate: number;
  hygieneRate: number;
} {
  let hungerRate = 1;
  let fatigueRate = 1;
  let thirstRate = 1;
  let hygieneRate = 1;
  for (const id of ids) {
    const m = TRANSIENT_BY_ID.get(id)?.modifiers;
    if (m) {
      hungerRate *= m.hungerRate ?? 1;
      fatigueRate *= m.fatigueRate ?? 1;
      thirstRate *= m.thirstRate ?? 1;
      hygieneRate *= m.hygieneRate ?? 1;
    }
  }
  return { hungerRate, fatigueRate, thirstRate, hygieneRate };
}

export interface StatMultipliers {
  strength: number;
  dexterity: number;
  constitution: number;
  perception: number;
  intelligence: number;
}
const NO_STAT_MULT: StatMultipliers = Object.freeze({
  strength: 1,
  dexterity: 1,
  constitution: 1,
  perception: 1,
  intelligence: 1
});

export function conditionStatMultipliers(entity: {
  conditions?: EntityCondition[];
  transientConditions?: string[];
}): StatMultipliers {
  const conds = entity.conditions;
  const tconds = entity.transientConditions;
  if ((!conds || conds.length === 0) && (!tconds || tconds.length === 0)) return NO_STAT_MULT;
  const out: StatMultipliers = {
    strength: 1,
    dexterity: 1,
    constitution: 1,
    perception: 1,
    intelligence: 1
  };
  const apply = (m?: ConditionModifiers) => {
    if (!m) return;
    if (m.strength != null) out.strength *= m.strength;
    if (m.dexterity != null) out.dexterity *= m.dexterity;
    if (m.constitution != null) out.constitution *= m.constitution;
    if (m.perception != null) out.perception *= m.perception;
    if (m.intelligence != null) out.intelligence *= m.intelligence;
  };
  for (const c of conds ?? []) apply(getConditionCurrentStage(c)?.modifiers);
  for (const id of tconds ?? []) apply(TRANSIENT_BY_ID.get(id)?.modifiers);
  return out;
}

export function syncFractureConditions(conditions: EntityCondition[], limbs: LimbState[]): void {
  let worst = 0;
  for (const l of limbs) {
    if (l.isMissing) continue;
    for (const p of l.parts ?? []) {
      if (p.isMissing) continue;
      if (PART_DEF_MAP[p.id]?.boneHp == null) continue;
      const frac = p.injuries.find((w) => woundById(w.type)?.structural);
      if (!frac) continue;
      const breakAt = boneBreakBudget(PART_DEF_MAP[p.id], p.maxHp);
      const sev = breakAt > 0 ? Math.min(1, frac.damage / breakAt) : 0;
      if (sev > worst) worst = sev;
    }
  }
  const idx = conditions.findIndex((c) => c.id === 'fractured');
  if (worst > 0) {
    if (idx >= 0) conditions[idx] = { ...conditions[idx], severity: worst };
    else conditions.push({ id: 'fractured', severity: worst });
  } else if (idx >= 0) {
    conditions.splice(idx, 1);
  }
}
