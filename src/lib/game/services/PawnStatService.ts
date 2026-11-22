import type {
  Pawn,
  Mob,
  BodyPartState,
  LimbState,
  ConditionDef,
  TransientConditionDef,
  Item,
  ItemInstance,
  Trait
} from '../core/types';
import { CORE_STAT_KEYS, type StatKey } from '../core/types';
import statsData from '../database/pawns/stats.json';
import conditionsData from '../database/pawns/conditions.json';
import itemsData from '../database/items/items.json';
import { WORK_CATEGORIES } from '../core/defs/work';
import { getNightVision } from '../core/rules/body/vision';
import { getStealth } from '../core/rules/body/stealth';
import { vlog } from '../core/util/logSink';
import { combinedQualityMultiplier } from '../core/rules/gear/itemQuality';
import { powerStatOf, powerToken, STAT_SCALE } from '../core/rules/body/powerScale';
import { aptitudeOf } from '../core/rules/body/aptitudes';
import {
  conditionStatMultipliers,
  type StatMultipliers,
  conditionPainMultiplier,
  conditionConsciousnessMultiplier,
  conditionModifierSum,
  conditionModifierContributions,
  tempRange,
  getTransientConditionDef,
  RECOVER_CONSCIOUSNESS
} from '../core/rules/body/conditions';
import { equippedTemperatureSources, type WornThermalSource } from '../core/rules/gear/equipment';
import { computePrestige } from '../core/rules/social/prestige';
import { SECONDS_PER_TICK } from '../core/util/time';
import {
  levelBase,
  styleSpeedWeight,
  styleFinesseWeight,
  workSkillCategory,
  NEUTRAL_WORK_LEVEL
} from '../core/rules/body/workExperience';
import { isDiscipline } from '../core/defs/disciplines';

const ALL_CONDITION_DEFS = conditionsData as unknown as Array<ConditionDef | TransientConditionDef>;
const CONDITIONS_DB = ALL_CONDITION_DEFS.filter((d): d is ConditionDef => d.transient !== true);
const TRANSIENT_CONDITIONS_DB = ALL_CONDITION_DEFS.filter(
  (d): d is TransientConditionDef => d.transient === true
);
const ITEMS_DB = itemsData as unknown as Item[];
const ITEM_BY_ID = new Map(ITEMS_DB.map((i) => [i.id, i]));

type StatDef = {
  id: string;
  category: string;
  primaryStat: string;
  description: string;
  formula?: string;
};

const STATS: StatDef[] = statsData as unknown as StatDef[];
const STAT_MAP: Record<string, StatDef> = {};
STATS.forEach((st) => {
  STAT_MAP[st.id] = st;
});

const WORK_STAT_IDS = new Set(STATS.filter((s) => s.category === 'work').map((s) => s.id));
const COMBAT_STAT_IDS = new Set(STATS.filter((s) => s.category === 'combat').map((s) => s.id));

const CONDITION_MULTIPLIER_KEY_IDS = new Set(['pain', 'consciousness', 'dodge', 'block']);

const CATEGORY_TOOLS: Record<string, Set<string>> = {};
for (const cat of WORK_CATEGORIES) {
  const ids = [...(cat.toolsRequired ?? []), ...(cat.boostTools ?? [])];
  if (ids.length) CATEGORY_TOOLS[cat.id] = new Set(ids);
}
const TOOL_BOOST: Record<string, { speed: number; yield: number }> = {};
for (const item of ITEMS_DB) {
  const b = (item as { toolBoost?: { speed?: number; yield?: number } }).toolBoost;
  if (b) TOOL_BOOST[item.id] = { speed: b.speed ?? 0, yield: b.yield ?? 0 };
}

function heldToolBoost(
  entity: Pawn | Mob,
  workType: string
): { speed: number; yield: number; itemId?: string } | null {
  const tools = CATEGORY_TOOLS[workType];
  if (!tools) return null;
  let speed = 0;
  let yieldB = 0;
  let found = false;
  let speedItemId: string | undefined;
  const consider = (inst: ItemInstance) => {
    if (!tools.has(inst.itemId)) return;
    const b = TOOL_BOOST[inst.itemId];
    if (!b) return;
    found = true;
    const q = combinedQualityMultiplier(inst.quality, inst.famedStatMult);
    if (b.speed * q > speed) {
      speed = b.speed * q;
      speedItemId = inst.itemId;
    }
    if (b.yield * q > yieldB) yieldB = b.yield * q;
  };
  const eq = (entity as Pawn).equipment;
  if (eq) for (const inst of Object.values(eq)) if (inst) consider(inst);
  const carried = (entity as Pawn).inventory?.instances;
  if (carried) for (const inst of carried) consider(inst);
  const bulk = (entity as Pawn).inventory?.items;
  if (bulk)
    for (const id in bulk) if ((bulk[id] ?? 0) > 0) consider({ itemId: id } as ItemInstance);
  return found ? { speed, yield: yieldB, itemId: speedItemId } : null;
}

const FORMULA_VARS = [
  ...CORE_STAT_KEYS.map((k) => k.toUpperCase()),
  'weight',
  'height',
  'consciousness',
  'manipulation',
  'sight',
  'moving',
  'blood_pumping',
  'blood_filtration',
  'breathing',
  'digestion',
  'talking',
  'hearing',
  'pain',
  'prestige',
  'intact',
  'SKILL',
  'POWER',
  'APT'
] as const;
const FORMULA_VAR_RE = new RegExp('\\b(?:' + FORMULA_VARS.join('|') + ')\\b', 'g');

function coreStatValue(
  k: StatKey,
  s: Partial<Record<StatKey, number>> | undefined,
  sm: StatMultipliers
): number {
  return k === 'charisma' ? (s?.charisma ?? 10) : (s?.[k] ?? 10) * sm[k];
}

const BLOOD_FAINT_ONSET = 0.2;
const BLOOD_FAINT_FLOOR = 0.55;

function bloodFaintSeverity(entity: Pawn | Mob): number {
  const maxBlood = entity.maxBloodVolume ?? 100;
  const bloodLoss = Math.max(0, 1 - (entity.bloodVolume ?? maxBlood) / maxBlood);
  return Math.min(
    1,
    Math.max(0, (bloodLoss - BLOOD_FAINT_ONSET) / (BLOOD_FAINT_FLOOR - BLOOD_FAINT_ONSET))
  );
}

function withBloodLoss(consciousnessBeforeBlood: number, entity: Pawn | Mob): number {
  return consciousnessBeforeBlood * (1 - bloodFaintSeverity(entity));
}

type ConditionList = readonly { id: string; severity: number }[] | undefined;

const STAGE_THRESHOLDS = new Map<string, number[]>();
for (const d of ALL_CONDITION_DEFS)
  if (!STAGE_THRESHOLDS.has(d.id))
    STAGE_THRESHOLDS.set(
      d.id,
      ((d as ConditionDef).stages ?? []).map((s) => s.minSeverity)
    );

interface StageBand {
  id: string;
  lo: number;
  hi: number;
}

function stageBands(conditions: ConditionList): StageBand[] {
  const out: StageBand[] = [];
  for (const c of conditions ?? []) {
    let lo = -Infinity;
    let hi = Infinity;
    for (const t of STAGE_THRESHOLDS.get(c.id) ?? []) {
      if (c.severity >= t) lo = Math.max(lo, t);
      else hi = Math.min(hi, t);
    }
    out.push({ id: c.id, lo, hi });
  }
  return out;
}

function withinStageBands(bands: StageBand[], conditions: ConditionList): boolean {
  const n = conditions?.length ?? 0;
  if (n !== bands.length) return false;
  for (let i = 0; i < n; i++) {
    const c = conditions![i];
    const b = bands[i];
    if (c.id !== b.id || !(c.severity >= b.lo) || !(c.severity < b.hi)) return false;
  }
  return true;
}

function sameIds(a: readonly string[], b: readonly string[] | undefined): boolean {
  const n = b?.length ?? 0;
  if (n !== a.length) return false;
  for (let i = 0; i < n; i++) if (a[i] !== b![i]) return false;
  return true;
}

interface TransientCapacityTerms {
  consciousness: number;
  pain: number;
  nightVision: number;
}

function transientCapacityTerms(ids: readonly string[] | undefined): TransientCapacityTerms {
  const terms = { consciousness: 1, pain: 1, nightVision: 0 };
  for (const id of ids ?? []) {
    const def = getTransientConditionDef(id);
    if (!def) continue;
    if (def.modifiers.consciousness != null) terms.consciousness *= def.modifiers.consciousness;
    if (def.modifiers.pain != null) terms.pain *= def.modifiers.pain;
    terms.nightVision += def.grants?.nightVision ?? 0;
  }
  return terms;
}

function sameTerms(a: TransientCapacityTerms, b: TransientCapacityTerms): boolean {
  return (
    a.consciousness === b.consciousness && a.pain === b.pain && a.nightVision === b.nightVision
  );
}

interface CapCacheEntry {
  limbs: unknown;
  injuries: unknown;
  light: number;
  conditions: unknown;
  stageBands: StageBand[];
  transient: unknown;
  transientIds: string[];
  transientTerms: TransientCapacityTerms;
  bloodVolume: number | undefined;
  maxBloodVolume: number | undefined;
  consciousnessBeforeBlood: number;
  caps: Record<string, number>;
}

const BROKEN_BONE_FUNCTION_MULT = 0.4;

type FormulaVar = (typeof FORMULA_VARS)[number];

type FormulaFn = (
  s: Partial<Record<StatKey, number>> | undefined,
  sm: StatMultipliers | null,
  tr: Pawn['physicalTraits'] | undefined,
  c: Record<string, number>,
  prestige: number,
  intact: number,
  SKILL: number,
  POWER: number,
  APT: number
) => number;

type CompiledFormula = {
  fn: FormulaFn;
  readsMultipliers: boolean;
  readsPrestige: boolean;
  readsIntact: boolean;
  readsPower: boolean;
  readsAptitude: boolean;
  readsCapacities: boolean;
};

const FORMULA_PARAMS = ['prestige', 'intact', 'SKILL', 'POWER', 'APT'] as const;

const CAPACITY_VAR_DEFAULT: Partial<Record<FormulaVar, number>> = {
  consciousness: 1,
  manipulation: 1,
  sight: 1,
  moving: 1,
  blood_pumping: 1,
  blood_filtration: 1,
  breathing: 1,
  digestion: 1,
  talking: 1,
  hearing: 1,
  pain: 0
};

function formulaVarSource(v: FormulaVar): { src: string; scaled: boolean } | null {
  const core = CORE_STAT_KEYS.find((k) => k.toUpperCase() === v);
  if (core) return { src: `core('${core}', s, sm)`, scaled: core !== 'charisma' };
  if (v === 'weight') return { src: 'tr?.weight ?? 70', scaled: false };
  if (v === 'height') return { src: 'tr?.height ?? 170', scaled: false };
  const capDefault = CAPACITY_VAR_DEFAULT[v];
  if (capDefault !== undefined) return { src: `c.${v} ?? ${capDefault}`, scaled: false };
  return null;
}

const _formulaCache = new Map<string, CompiledFormula | null>();

function intactBodyFraction(p: Pawn | Mob): number {
  const limbs = p.limbs;
  if (!limbs || limbs.length === 0) return 1;
  let total = 0;
  let sum = 0;
  for (const limb of limbs) {
    const parts = limb.parts;
    if (!parts || parts.length === 0) {
      total += 1;
      sum += limb.isMissing ? 0 : 1;
      continue;
    }
    for (const part of parts) {
      total += 1;
      if (limb.isMissing || part.isMissing) continue;
      let scars = 0;
      for (const inj of part.injuries ?? []) {
        if (inj.permanent || inj.type.endsWith('_scar')) scars++;
      }
      sum += Math.max(0.5, 1 - 0.25 * scars);
    }
  }
  return total > 0 ? sum / total : 1;
}

const FORMULA_CLAMP = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

function compileFormula(formula: string): CompiledFormula | null {
  const cached = _formulaCache.get(formula);
  if (cached !== undefined) return cached;
  const expr = formula.replace(/×/g, '*').replace(/−/g, '-');
  const stripped = expr.replace(/\bclamp\b/g, '').replace(FORMULA_VAR_RE, '0');
  let compiled: CompiledFormula | null = null;
  if (/^[\d\s+\-*/.(),]+$/.test(stripped)) {
    const used = new Set((expr.match(FORMULA_VAR_RE) ?? []) as FormulaVar[]);
    const locals: string[] = [];
    let readsScaled = false;
    for (const v of used) {
      const read = formulaVarSource(v);
      if (!read) continue;
      locals.push(`${v} = ${read.src}`);
      readsScaled ||= read.scaled;
    }
    try {
      const fn = new Function(
        'clamp',
        'core',
        '"use strict"; return function (s, sm, tr, c, ' +
          FORMULA_PARAMS.join(', ') +
          ') { ' +
          (locals.length ? 'const ' + locals.join(', ') + '; ' : '') +
          'return (' +
          expr +
          '); };'
      )(FORMULA_CLAMP, coreStatValue) as FormulaFn;
      compiled = {
        fn,
        readsMultipliers: readsScaled || used.has('POWER'),
        readsPrestige: used.has('prestige'),
        readsIntact: used.has('intact'),
        readsPower: used.has('POWER'),
        readsAptitude: used.has('APT'),
        readsCapacities: [...used].some((v) => CAPACITY_VAR_DEFAULT[v] !== undefined)
      };
    } catch {
      compiled = null;
    }
  }
  _formulaCache.set(formula, compiled);
  return compiled;
}

const NO_CAPACITIES: Readonly<Record<string, number>> = Object.freeze({});

function formulaReadsCapacities(formula: string | undefined): boolean {
  return !!formula && (compileFormula(formula)?.readsCapacities ?? false);
}

function evaluateFormula(
  formula: string | undefined,
  p: Pawn | Mob,
  capacities: Record<string, number> = {},
  skill = 1.0,
  statId = ''
): number {
  if (!formula) return 1.0;
  const f = compileFormula(formula);
  if (!f) return 1.0;
  const sm = f.readsMultipliers ? conditionStatMultipliers(p) : null;
  const v = f.fn(
    p.stats,
    sm,
    p.physicalTraits,
    capacities,
    f.readsPrestige ? computePrestige(p) : 0,
    f.readsIntact ? intactBodyFraction(p) : 1,
    skill,
    sm && f.readsPower ? equippedPowerToken(p, sm) : STAT_SCALE,
    f.readsAptitude ? aptitudeOf(p as { aptitudes?: Record<string, number> }, statId) : 1
  );
  return isFinite(v) ? Math.round(v * 1000) / 1000 : 1.0;
}

const ORGAN_PATTERNS = [
  /brain|synganglion/i,
  /heart/i,
  /lung/i,
  /eye/i,
  /kidney|malpighian/i,
  /stomach/i,
  /liver|digestivegland/i
];
const BRAIN = 0;
const HEART = 1;
const LUNG = 2;
const EYE = 3;
const KIDNEY = 4;
const STOMACH = 5;
const LIVER = 6;
const PART_ORGAN_MASK = new Map<string, number>();
const ORGAN_COUNT = new Float64Array(ORGAN_PATTERNS.length);
const ORGAN_MIN = new Float64Array(ORGAN_PATTERNS.length);
const ORGAN_SUM = new Float64Array(ORGAN_PATTERNS.length);

function partOrganMask(id: string): number {
  let mask = PART_ORGAN_MASK.get(id);
  if (mask === undefined) {
    mask = 0;
    for (let i = 0; i < ORGAN_PATTERNS.length; i++) if (ORGAN_PATTERNS[i].test(id)) mask |= 1 << i;
    PART_ORGAN_MASK.set(id, mask);
  }
  return mask;
}

function scanOrgans(limbs: LimbState[]): void {
  ORGAN_COUNT.fill(0);
  ORGAN_SUM.fill(0);
  ORGAN_MIN.fill(Infinity);
  for (let li = 0; li < limbs.length; li++) {
    const parts = limbs[li].parts;
    if (!parts) continue;
    for (let pi = 0; pi < parts.length; pi++) {
      const p = parts[pi];
      const mask = partOrganMask(p.id);
      if (mask === 0) continue;
      let frac = 0;
      if (!p.isMissing) {
        const max = p.maxHp ?? 100;
        frac = max > 0 ? (p.health ?? max) / max : 0;
      }
      for (let i = 0; i < ORGAN_PATTERNS.length; i++) {
        if ((mask & (1 << i)) === 0) continue;
        ORGAN_COUNT[i]++;
        ORGAN_SUM[i] += frac;
        ORGAN_MIN[i] = Math.min(ORGAN_MIN[i], frac);
      }
    }
  }
}

function organOne(organ: number): number {
  return ORGAN_COUNT[organ] ? ORGAN_MIN[organ] : 1;
}

function organBlend(organ: number, minWeight: number): number {
  if (!ORGAN_COUNT[organ]) return 1 * minWeight + 1 * (1 - minWeight);
  return ORGAN_MIN[organ] * minWeight + (ORGAN_SUM[organ] / ORGAN_COUNT[organ]) * (1 - minWeight);
}

function findLimb(limbs: LimbState[], id: string): LimbState | undefined {
  return limbs.find((l) => l.id === id);
}

function limbBoneBroken(limbs: LimbState[], id: string): boolean {
  return (findLimb(limbs, id)?.parts ?? []).some((p) => p.boneBroken && !p.isMissing);
}

function limbCapacity(limbs: LimbState[], pattern: RegExp, minWeight: number): number {
  const vals: number[] = [];
  for (const l of limbs) {
    if (!pattern.test(l.id)) continue;
    vals.push(
      l.isMissing
        ? 0
        : (Math.min(100, l.health) / 100) *
            (limbBoneBroken(limbs, l.id) ? BROKEN_BONE_FUNCTION_MULT : 1)
    );
  }
  if (vals.length === 0) return 1.0;
  const min = Math.min(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return min * minWeight + avg * (1 - minWeight);
}

function findOrgan(limbs: LimbState[], limbId: string, organId: string): BodyPartState | undefined {
  return findLimb(limbs, limbId)?.parts?.find((p) => p.id === organId);
}

function organFraction(limbs: LimbState[], limbId: string, organId: string): number {
  const o = findOrgan(limbs, limbId, organId);
  if (!o) return 1;
  if (o.isMissing) return 0;
  const max = o.maxHp ?? 100;
  const hp = o.health ?? max;
  return (max > 0 ? (hp / max) * 100 : 0) / 100;
}

function capacityPain(pawn: Pawn | Mob, limbs: LimbState[]): number {
  let injuryPain = 0;
  pawn.injuries?.forEach((inj) => (injuryPain += inj.painContribution));
  let limbPain = 0;
  for (const l of limbs) {
    if (!l.isMissing && l.health < 100) {
      limbPain += (100 - l.health) * 0.01;
    }
  }
  let bleedPain = 0;
  for (const l of limbs) bleedPain += l.bleedRate * 0.5;
  return ((injuryPain + limbPain + bleedPain) / 100) * conditionPainMultiplier(pawn);
}

function calculateCapacityValue(
  pawn: Pawn | Mob,
  capacityId: string,
  capacities: Record<string, number>,
  limbs: LimbState[],
  painValue: number,
  lightMultiplier?: number
): number {
  switch (capacityId) {
    case 'consciousness': {
      const baseCon =
        organOne(BRAIN) * 0.6 + organOne(HEART) * 0.15 + organBlend(LUNG, 0) * 0.1 + 0.1;
      const hearingCap = capacities.hearing ?? 1;
      const effectivePain = Math.max(0, painValue - 0.1);
      const painMult = Math.max(0.05, 1 - effectivePain);
      return (baseCon + hearingCap * 0.05) * painMult * conditionConsciousnessMultiplier(pawn);
    }
    case 'pain':
      return painValue;
    case 'manipulation':
      return limbCapacity(limbs, /arm/i, 0.3);
    case 'sight':
      return (organBlend(EYE, 0.4) + 0.05) * (lightMultiplier ?? 1.0);
    case 'night_vision':
      return getNightVision(pawn);
    case 'moving':
      return limbCapacity(limbs, /leg/i, 0.5);
    case 'blood_pumping':
      return organOne(HEART) * 0.9 + 0.1;
    case 'blood_filtration':
      return organBlend(KIDNEY, 0.4);
    case 'breathing':
      return organBlend(LUNG, 0.5) + 0.05;
    case 'digestion':
      return organOne(STOMACH) * 0.6 + organOne(LIVER) * 0.4;
    case 'talking':
      return organFraction(limbs, 'head', 'jaw') * 0.9 + 0.1;
    case 'hearing': {
      const leftE = organFraction(limbs, 'head', 'leftEar');
      const rightE = organFraction(limbs, 'head', 'rightEar');
      const minE = Math.min(leftE, rightE);
      const avgE = (leftE + rightE) / 2;
      return minE * 0.3 + avgE * 0.7 + 0.15;
    }
    default:
      return 1.0;
  }
}

function traitWorkMult(
  pawn: Pawn | Mob,
  key: 'workSpeed' | 'workYield' | 'workQuality',
  workType: string,
  fallbackType?: string
): number {
  let mult = 1;
  const traits = 'traits' in pawn ? pawn.traits : [];
  for (const trait of traits ?? []) {
    const map = trait.effects?.[key] as Record<string, number> | undefined;
    if (!map) continue;
    const specific = map[workType] ?? (fallbackType ? map[fallbackType] : undefined);
    if (specific) mult *= specific;
    if (
      map['crafts'] &&
      (isDiscipline(workType) || (fallbackType != null && isDiscipline(fallbackType)))
    )
      mult *= map['crafts'];
    if (map['all']) mult *= map['all'];
  }
  return mult;
}

function traitCombatMult(pawn: Pawn | Mob, statId: string): number {
  if (!COMBAT_STAT_IDS.has(statId)) return 1;
  const traits = 'traits' in pawn ? pawn.traits : undefined;
  if (!traits || traits.length === 0) return 1;
  let mult = 1;
  for (const trait of traits) {
    const v = trait.effects?.combatMods?.[statId];
    if (typeof v === 'number') mult *= v;
  }
  return mult;
}

function equippedPowerToken(pawn: Pawn | Mob, sm: StatMultipliers): number {
  const mh = (pawn as Pawn).equipment?.mainHand;
  const wp = mh ? ITEM_BY_ID.get(mh.itemId)?.weaponProperties : undefined;
  const key = powerStatOf(wp);
  const mult = key === 'charisma' ? 1 : sm[key];
  return powerToken((pawn.stats?.[key] ?? 10) * mult);
}

const DUAL_WIELD_SPEED_MULT = 1.4;

function equippedWeaponSpeedMult(pawn: Pawn | Mob): number {
  const eq = (pawn as Pawn).equipment;
  const mh = eq?.mainHand;
  if (!mh) return 1;
  const mainWp = ITEM_BY_ID.get(mh.itemId)?.weaponProperties;
  let mult = mainWp?.attackSpeed ?? 1;
  if (mainWp?.offHandable && eq?.offHand) {
    const offWp = ITEM_BY_ID.get(eq.offHand.itemId)?.weaponProperties;
    if (offWp?.offHandable) mult *= DUAL_WIELD_SPEED_MULT;
  }
  return mult;
}

const RESISTANCE_TRAIT_KEY: Record<string, keyof Trait['effects']> = {
  heal_rate: 'healRate'
};

const RESISTANCE_BLOCK_KEY: Record<string, keyof NonNullable<Trait['resistances']>> = {
  cutting_resistance: 'cutting',
  piercing_resistance: 'piercing',
  blunt_resistance: 'blunt',
  cold_resistance: 'cold',
  fire_resistance: 'fire',
  poison_resistance: 'poison',
  disease_resistance: 'disease',
  mental_resistance: 'mental',
  lightning_resistance: 'lightning',
  shadow_resistance: 'shadow',
  wetness_resistance: 'wetness'
};

function traitResistanceBonus(pawn: Pawn | Mob, statId: string): number {
  const effKey = RESISTANCE_TRAIT_KEY[statId];
  const blockKey = RESISTANCE_BLOCK_KEY[statId];
  if (!effKey && !blockKey) return 0;
  const traits = 'traits' in pawn ? pawn.traits : [];
  let bonus = 0;
  for (const trait of traits ?? []) {
    if (effKey) {
      const v = trait.effects?.[effKey];
      if (typeof v === 'number') bonus += v;
    }
    if (blockKey) {
      const v = trait.resistances?.[blockKey];
      if (typeof v === 'number') bonus += v;
    }
  }
  return bonus;
}

function pawnStateWorkMultiplier(pawn: Pawn | Mob): number {
  let mult = 1;

  for (const condition of pawn.conditions ?? []) {
    const def = CONDITIONS_DB.find((d) => d.id === condition.id);
    if (!def) continue;
    let activeStage = undefined as ConditionDef['stages'][number] | undefined;
    for (const stage of def.stages) {
      if (condition.severity >= stage.minSeverity) activeStage = stage;
    }
    const we = activeStage?.modifiers.workEfficiency;
    if (we !== undefined) mult *= we;
  }

  for (const conditionId of pawn.transientConditions ?? []) {
    const def = TRANSIENT_CONDITIONS_DB.find((e) => e.id === conditionId);
    const we = def?.modifiers.workEfficiency;
    if (we !== undefined) mult *= we;
  }

  return mult;
}

const TEMP_RES_DEG_PER_UNIT = 20;
const TEMP_RES_DEG_CAP = 25;

export interface StatDerivation {
  formula: string;
  description: string;
  vars: { name: string; value: string }[];
}

export interface TempToleranceSource {
  label: string;
  deg: number;
}

export interface TemperatureTolerance {
  comfortMin: number;
  comfortMax: number;
  coldDeg: number;
  heatDeg: number;
  coldOnset: number;
  heatOnset: number;
  coldSources: TempToleranceSource[];
  heatSources: TempToleranceSource[];
  coldCapped: boolean;
  heatCapped: boolean;
}

export interface PawnStatService {
  evaluateStat(statId: string, pawn: Pawn | Mob): number;
  temperatureTolerance(pawn: Pawn | Mob): TemperatureTolerance;
  describeStat(entity: Pawn | Mob, statId: string): StatDerivation;
  computeCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number>;
  estimateBloodRecoveryTicks(entity: Pawn | Mob): number | null;
  getWorkModifiers(
    pawn: Pawn | Mob,
    workType: string,
    lightMultiplier?: number,
    fallbackType?: string
  ): { speed: number; yield: number | null; quality: number | null };
  workSkillInfo(statId: string, pawn: Pawn | Mob): { level: number; factor: number } | null;
  heldToolFor(
    pawn: Pawn | Mob,
    workType: string
  ): { itemId: string; speed: number; yield: number } | null;
  hasStat(statId: string): boolean;
}

export class PawnStatServiceImpl implements PawnStatService {
  private _capCache = new Map<string, CapCacheEntry>();
  private _capHits = 0;
  private _capMiss = 0;

  private _conditionsHold(c: CapCacheEntry, pawn: Pawn | Mob): boolean {
    if (c.conditions !== pawn.conditions) {
      if (!withinStageBands(c.stageBands, pawn.conditions)) return false;
      c.conditions = pawn.conditions;
    }
    if (c.transient !== pawn.transientConditions) {
      if (!sameIds(c.transientIds, pawn.transientConditions)) {
        if (!sameTerms(c.transientTerms, transientCapacityTerms(pawn.transientConditions)))
          return false;
        c.transientIds = [...(pawn.transientConditions ?? [])];
      }
      c.transient = pawn.transientConditions;
    }
    return true;
  }

  computeCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number> {
    const light = lightMultiplier ?? pawn.effectiveLight ?? 1;
    const lightBucket = Math.round(light * 10) / 10;
    const c = this._capCache.get(pawn.id);
    if (
      c &&
      c.limbs === pawn.limbs &&
      c.injuries === pawn.injuries &&
      c.light === lightBucket &&
      ((c.conditions === pawn.conditions && c.transient === pawn.transientConditions) ||
        this._conditionsHold(c, pawn))
    ) {
      this._capHits++;
      if (c.bloodVolume !== pawn.bloodVolume || c.maxBloodVolume !== pawn.maxBloodVolume) {
        c.bloodVolume = pawn.bloodVolume;
        c.maxBloodVolume = pawn.maxBloodVolume;
        c.caps.consciousness = withBloodLoss(c.consciousnessBeforeBlood, pawn);
      }
      return c.caps;
    }
    this._capMiss++;
    if ((this._capHits + this._capMiss) % 4096 === 0) {
      const total = this._capHits + this._capMiss;
      vlog(
        'perf',
        0,
        () =>
          `capCache hit ${Math.round((this._capHits / total) * 100)}% (${this._capHits}/${total}), size ${this._capCache.size}`
      );
    }
    const caps = this._buildCapacitiesBeforeBlood(pawn, light);
    const consciousnessBeforeBlood = caps.consciousness;
    caps.consciousness = withBloodLoss(consciousnessBeforeBlood, pawn);
    if (this._capCache.size > 2048) this._capCache.clear();
    this._capCache.set(pawn.id, {
      limbs: pawn.limbs,
      injuries: pawn.injuries,
      light: lightBucket,
      conditions: pawn.conditions,
      stageBands: stageBands(pawn.conditions),
      transient: pawn.transientConditions,
      transientIds: [...(pawn.transientConditions ?? [])],
      transientTerms: transientCapacityTerms(pawn.transientConditions),
      bloodVolume: pawn.bloodVolume,
      maxBloodVolume: pawn.maxBloodVolume,
      consciousnessBeforeBlood,
      caps
    });
    return caps;
  }

  estimateBloodRecoveryTicks(entity: Pawn | Mob): number | null {
    const c0 = this.computeCapacities(entity).consciousness ?? 1;
    if (c0 >= RECOVER_CONSCIOUSNESS) return 0;
    const totalBleed = (entity.limbs ?? []).reduce((s, l) => s + (l.bleedRate ?? 0), 0);
    if (totalBleed > 0) return null;
    const maxBlood = entity.maxBloodVolume ?? 100;
    const blood = entity.bloodVolume ?? maxBlood;
    if (blood >= maxBlood) return null;
    const cCeil =
      this._buildCapacities({ ...entity, bloodVolume: maxBlood } as Pawn).consciousness ?? 1;
    if (cCeil < RECOVER_CONSCIOUSNESS) return null;
    const bloodMultTarget = RECOVER_CONSCIOUSNESS / cCeil;
    const bloodLossTarget =
      BLOOD_FAINT_ONSET + (1 - bloodMultTarget) * (BLOOD_FAINT_FLOOR - BLOOD_FAINT_ONSET);
    const bloodTarget = maxBlood * (1 - bloodLossTarget);
    const bloodRegenPerSec = (1.0 + ((entity.stats?.constitution ?? 10) - 10) * 0.08) * 0.05;
    const regenPerTick = bloodRegenPerSec * SECONDS_PER_TICK;
    if (regenPerTick <= 0 || bloodTarget <= blood) return null;
    return (bloodTarget - blood) / regenPerTick;
  }

  private _buildCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number> {
    const caps = this._buildCapacitiesBeforeBlood(pawn, lightMultiplier);
    caps.consciousness = withBloodLoss(caps.consciousness, pawn);
    return caps;
  }

  private _buildCapacitiesBeforeBlood(
    pawn: Pawn | Mob,
    lightMultiplier?: number
  ): Record<string, number> {
    const capacities: Record<string, number> = {};
    const capacityIds = [
      'pain',
      'sight',
      'night_vision',
      'hearing',
      'consciousness',
      'manipulation',
      'moving',
      'blood_pumping',
      'blood_filtration',
      'breathing',
      'digestion',
      'talking'
    ];
    const limbs = pawn.limbs ?? [];
    scanOrgans(limbs);
    const painValue = capacityPain(pawn, limbs);
    for (const id of capacityIds) {
      capacities[id] = calculateCapacityValue(
        pawn,
        id,
        capacities,
        limbs,
        painValue,
        id === 'sight' ? lightMultiplier : undefined
      );
    }
    return capacities;
  }

  evaluateStat(statId: string, pawn: Pawn | Mob): number {
    const def = STAT_MAP[statId];
    if (!def) return 1.0;
    const capacities = formulaReadsCapacities(def.formula)
      ? this.computeCapacities(pawn)
      : NO_CAPACITIES;
    const skill = def.category === 'work' ? (this.workSkillInfo(statId, pawn)?.factor ?? 1) : 1;
    const v =
      evaluateFormula(def.formula, pawn, capacities, skill, statId) *
        traitCombatMult(pawn, statId) *
        (statId === 'attack_speed' ? equippedWeaponSpeedMult(pawn) : 1) +
      traitResistanceBonus(pawn, statId) +
      (CONDITION_MULTIPLIER_KEY_IDS.has(statId) ? 0 : conditionModifierSum(pawn, statId));
    return statId === 'stealth' ? getStealth(pawn, v) : v;
  }

  workSkillInfo(statId: string, pawn: Pawn | Mob): { level: number; factor: number } | null {
    const m = /^(.+)_(speed|yield|quality)$/.exec(statId);
    if (!m || !WORK_STAT_IDS.has(statId)) return null;
    const category = workSkillCategory(m[1]);
    const level = pawn.skills?.[category] ?? NEUTRAL_WORK_LEVEL;
    const workStyle = (pawn as Pawn).workStyle;
    const weight = m[2] === 'speed' ? styleSpeedWeight(workStyle) : styleFinesseWeight(workStyle);
    return { level, factor: levelBase(level) * weight };
  }

  temperatureTolerance(pawn: Pawn | Mob): TemperatureTolerance {
    const { min: comfortMin, max: comfortMax } = tempRange((pawn as Pawn).traits);
    const gear = equippedTemperatureSources(pawn as Pawn);
    const sideTolerance = (statId: string, pick: (g: WornThermalSource) => number) => {
      const stat = this.evaluateStat(statId, pawn);
      const trait = traitResistanceBonus(pawn, statId);
      const conds = conditionModifierContributions(pawn, statId);
      const condTotal = conds.reduce((a, c) => a + c.value, 0);
      const con = stat - trait - condTotal;
      const sources: TempToleranceSource[] = [];
      if (con !== 0) sources.push({ label: 'Constitution', deg: con * TEMP_RES_DEG_PER_UNIT });
      if (trait !== 0) sources.push({ label: 'Traits', deg: trait * TEMP_RES_DEG_PER_UNIT });
      for (const c of conds) sources.push({ label: c.name, deg: c.value * TEMP_RES_DEG_PER_UNIT });
      let gearTotal = 0;
      for (const g of gear) {
        const r = pick(g);
        if (r === 0) continue;
        sources.push({ label: g.name, deg: r * TEMP_RES_DEG_PER_UNIT });
        gearTotal += r;
      }
      const raw = (con + trait + condTotal + gearTotal) * TEMP_RES_DEG_PER_UNIT;
      const deg = Math.min(TEMP_RES_DEG_CAP, raw);
      return { sources, deg, capped: raw > TEMP_RES_DEG_CAP };
    };
    const cold = sideTolerance('cold_resistance', (g) => g.cold);
    const heat = sideTolerance('fire_resistance', (g) => g.heat);
    return {
      comfortMin,
      comfortMax,
      coldDeg: cold.deg,
      heatDeg: heat.deg,
      coldOnset: comfortMin - cold.deg,
      heatOnset: comfortMax + heat.deg,
      coldSources: cold.sources,
      heatSources: heat.sources,
      coldCapped: cold.capped,
      heatCapped: heat.capped
    };
  }

  describeStat(entity: Pawn | Mob, statId: string): StatDerivation {
    const def = STAT_MAP[statId];
    if (!def) return { formula: '', description: '', vars: [] };
    const caps = this.computeCapacities(entity);
    const s = entity.stats;
    const tr = entity.physicalTraits;
    const sm = conditionStatMultipliers(entity);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const all: Record<string, number> = {
      ...Object.fromEntries(CORE_STAT_KEYS.map((k) => [k.toUpperCase(), coreStatValue(k, s, sm)])),
      weight: tr?.weight ?? 70,
      height: tr?.height ?? 170,
      consciousness: caps.consciousness ?? 1,
      manipulation: caps.manipulation ?? 1,
      sight: caps.sight ?? 1,
      moving: caps.moving ?? 1,
      blood_pumping: caps.blood_pumping ?? 1,
      blood_filtration: caps.blood_filtration ?? 1,
      breathing: caps.breathing ?? 1,
      digestion: caps.digestion ?? 1,
      talking: caps.talking ?? 1,
      hearing: caps.hearing ?? 1,
      pain: caps.pain ?? 0
    };
    const formula = def.formula ?? '';
    const vars: { name: string; value: string }[] = [];
    for (const name of Object.keys(all)) {
      if (new RegExp(`\\b${name}\\b`).test(formula))
        vars.push({ name, value: String(r2(all[name])) });
    }
    return { formula, description: def.description ?? '', vars };
  }

  getWorkModifiers(
    pawn: Pawn | Mob,
    workType: string,
    lightMultiplier?: number,
    fallbackType?: string
  ): { speed: number; yield: number | null; quality: number | null } {
    const capacities = this.computeCapacities(pawn, lightMultiplier);
    const toolBoost =
      heldToolBoost(pawn, workType) ?? (fallbackType ? heldToolBoost(pawn, fallbackType) : null);
    const formulaFor = (axis: string): string | undefined =>
      (
        STAT_MAP[`${workType}_${axis}`] ??
        (fallbackType ? STAT_MAP[`${fallbackType}_${axis}`] : undefined)
      )?.formula;
    const level =
      pawn.skills?.[workType] ??
      (fallbackType ? pawn.skills?.[fallbackType] : undefined) ??
      NEUTRAL_WORK_LEVEL;
    const skillBase = levelBase(level);
    const workStyle = (pawn as Pawn).workStyle;
    const speedSkill = skillBase * styleSpeedWeight(workStyle);
    const finesseSkill = skillBase * styleFinesseWeight(workStyle);
    const stateMult = pawnStateWorkMultiplier(pawn);
    const speed = Math.max(
      0.1,
      (evaluateFormula(formulaFor('speed'), pawn, capacities, speedSkill) +
        (toolBoost?.speed ?? 0)) *
        traitWorkMult(pawn, 'workSpeed', workType, fallbackType) *
        stateMult
    );
    const axis = (kind: 'yield' | 'quality', traitKey: 'workYield' | 'workQuality') => {
      const formula = formulaFor(kind);
      if (!formula) return null;
      const toolAdd = kind === 'yield' ? (toolBoost?.yield ?? 0) : 0;
      return Math.max(
        0.1,
        (evaluateFormula(formula, pawn, capacities, finesseSkill) + toolAdd) *
          traitWorkMult(pawn, traitKey, workType, fallbackType)
      );
    };
    return {
      speed,
      yield: axis('yield', 'workYield'),
      quality: axis('quality', 'workQuality')
    };
  }

  heldToolFor(
    pawn: Pawn | Mob,
    workType: string
  ): { itemId: string; speed: number; yield: number } | null {
    const b = heldToolBoost(pawn, workType);
    if (!b || !b.itemId || (b.speed === 0 && b.yield === 0)) return null;
    return { itemId: b.itemId, speed: b.speed, yield: b.yield };
  }

  hasStat(statId: string): boolean {
    return statId in STAT_MAP;
  }
}

export const pawnStatService = new PawnStatServiceImpl();
