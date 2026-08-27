import type {
  Pawn,
  Mob,
  BodyPartState,
  ConditionDef,
  TransientConditionDef,
  Item,
  ItemInstance,
  Trait
} from '../core/types';
import statsData from '../database/pawns/stats.jsonc';
import conditionsData from '../database/pawns/conditions.jsonc';
import itemsData from '../database/items/items.jsonc';
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
  tempRange,
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
  'STRENGTH',
  'DEXTERITY',
  'CONSTITUTION',
  'PERCEPTION',
  'INTELLIGENCE',
  'CHARISMA',
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

const BLOOD_FAINT_ONSET = 0.2;
const BLOOD_FAINT_FLOOR = 0.55;

const BROKEN_BONE_FUNCTION_MULT = 0.4;

const _formulaCache = new Map<string, ((...vars: number[]) => number) | null>();
const _formulaUsesPrestige = new Map<string, boolean>();

function formulaUsesPrestige(formula: string): boolean {
  let uses = _formulaUsesPrestige.get(formula);
  if (uses === undefined) {
    uses = formula.includes('prestige');
    _formulaUsesPrestige.set(formula, uses);
  }
  return uses;
}

const _formulaUsesPower = new Map<string, boolean>();

function formulaUsesPower(formula: string): boolean {
  let uses = _formulaUsesPower.get(formula);
  if (uses === undefined) {
    uses = formula.includes('POWER');
    _formulaUsesPower.set(formula, uses);
  }
  return uses;
}

const _formulaUsesIntact = new Map<string, boolean>();

function formulaUsesIntact(formula: string): boolean {
  let uses = _formulaUsesIntact.get(formula);
  if (uses === undefined) {
    uses = /\bintact\b/.test(formula);
    _formulaUsesIntact.set(formula, uses);
  }
  return uses;
}

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

function compileFormula(formula: string): ((...vars: number[]) => number) | null {
  const cached = _formulaCache.get(formula);
  if (cached !== undefined) return cached;
  const expr = formula.replace(/×/g, '*').replace(/−/g, '-');
  const stripped = expr.replace(/\bclamp\b/g, '').replace(FORMULA_VAR_RE, '0');
  let fn: ((...vars: number[]) => number) | null = null;
  if (/^[\d\s+\-*/.(),]+$/.test(stripped)) {
    try {
      const raw = new Function(
        'clamp',
        ...FORMULA_VARS,
        '"use strict"; return (' + expr + ');'
      ) as (clamp: typeof FORMULA_CLAMP, ...vars: number[]) => number;
      fn = (...vars: number[]) => raw(FORMULA_CLAMP, ...vars);
    } catch {
      fn = null;
    }
  }
  _formulaCache.set(formula, fn);
  return fn;
}

function evaluateFormula(
  formula: string | undefined,
  p: Pawn | Mob,
  capacities: Record<string, number> = {},
  skill = 1.0,
  statId = ''
): number {
  if (!formula) return 1.0;
  const fn = compileFormula(formula);
  if (!fn) return 1.0;
  const s = p.stats;
  const tr = p.physicalTraits;
  const sm = conditionStatMultipliers(p);
  const prestige = formulaUsesPrestige(formula) ? computePrestige(p) : 0;
  const intact = formulaUsesIntact(formula) ? intactBodyFraction(p) : 1;
  const power = formulaUsesPower(formula) ? equippedPowerToken(p, sm) : STAT_SCALE;
  const apt = aptitudeOf(p as { aptitudes?: Record<string, number> }, statId);
  const v = fn(
    (s?.strength ?? 10) * sm.strength,
    (s?.dexterity ?? 10) * sm.dexterity,
    (s?.constitution ?? 10) * sm.constitution,
    (s?.perception ?? 10) * sm.perception,
    (s?.intelligence ?? 10) * sm.intelligence,
    s?.charisma ?? 10,
    tr?.weight ?? 70,
    tr?.height ?? 170,
    capacities.consciousness ?? 1,
    capacities.manipulation ?? 1,
    capacities.sight ?? 1,
    capacities.moving ?? 1,
    capacities.blood_pumping ?? 1,
    capacities.blood_filtration ?? 1,
    capacities.breathing ?? 1,
    capacities.digestion ?? 1,
    capacities.talking ?? 1,
    capacities.hearing ?? 1,
    capacities.pain ?? 0,
    prestige,
    intact,
    skill,
    power,
    apt
  );
  return isFinite(v) ? Math.round(v * 1000) / 1000 : 1.0;
}

function calculateCapacityValue(
  pawn: Pawn | Mob,
  capacityId: string,
  capacities: Record<string, number>,
  lightMultiplier?: number
): number {
  const limbs = pawn.limbs ?? [];
  const limb = (id: string) => limbs.find((l) => l.id === id);
  const limbBoneBroken = (id: string) =>
    (limb(id)?.parts ?? []).some((p) => p.boneBroken && !p.isMissing);
  const limbCapacity = (pred: (id: string) => boolean, minWeight: number): number => {
    const ls = limbs.filter((l) => pred(l.id));
    if (ls.length === 0) return 1.0;
    const vals = ls.map((l) =>
      l.isMissing
        ? 0
        : (Math.min(100, l.health) / 100) * (limbBoneBroken(l.id) ? BROKEN_BONE_FUNCTION_MULT : 1)
    );
    const min = Math.min(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return min * minWeight + avg * (1 - minWeight);
  };

  const organ = (limbId: string, organId: string): BodyPartState | undefined =>
    limb(limbId)?.parts?.find((p) => p.id === organId);
  const organH = (limbId: string, organId: string) => {
    const o = organ(limbId, organId);
    if (!o) return 100;
    const max = o.maxHp ?? 100;
    const hp = o.health ?? max;
    return max > 0 ? (hp / max) * 100 : 0;
  };
  const organMissing = (limbId: string, organId: string) =>
    organ(limbId, organId)?.isMissing ?? false;

  const organFracs = (pat: RegExp): number[] => {
    const out: number[] = [];
    for (const l of limbs)
      for (const p of l.parts ?? []) {
        if (!pat.test(p.id)) continue;
        if (p.isMissing) {
          out.push(0);
          continue;
        }
        const max = p.maxHp ?? 100;
        out.push(max > 0 ? (p.health ?? max) / max : 0);
      }
    return out;
  };
  const organOne = (pat: RegExp): number => {
    const f = organFracs(pat);
    return f.length ? Math.min(...f) : 1;
  };
  const organBlend = (pat: RegExp, minWeight: number): number => {
    const f = organFracs(pat);
    const v = f.length ? f : [1];
    const min = Math.min(...v);
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    return min * minWeight + avg * (1 - minWeight);
  };

  let value = 1.0;

  let injuryPain = 0;
  pawn.injuries?.forEach((inj) => (injuryPain += inj.painContribution));
  let limbPain = 0;
  limbs.forEach((l) => {
    if (!l.isMissing && l.health < 100) {
      limbPain += (100 - l.health) * 0.01;
    }
  });
  let bleedPain = 0;
  limbs.forEach((l) => {
    bleedPain += l.bleedRate * 0.5;
  });
  const painValue = ((injuryPain + limbPain + bleedPain) / 100) * conditionPainMultiplier(pawn);

  switch (capacityId) {
    case 'consciousness': {
      const brain = organOne(/brain|synganglion/i);
      const heart = organOne(/heart/i);
      const avgLung = organBlend(/lung/i, 0);
      const baseCon = brain * 0.6 + heart * 0.15 + avgLung * 0.1 + 0.1;
      const hearingCap = capacities.hearing ?? 1;
      const effectivePain = Math.max(0, painValue - 0.1);
      const painMult = Math.max(0.05, 1 - effectivePain);
      const maxBlood = pawn.maxBloodVolume ?? 100;
      const bloodLoss = Math.max(0, 1 - (pawn.bloodVolume ?? maxBlood) / maxBlood);
      const bloodSeverity = Math.min(
        1,
        Math.max(0, (bloodLoss - BLOOD_FAINT_ONSET) / (BLOOD_FAINT_FLOOR - BLOOD_FAINT_ONSET))
      );
      const bloodMult = 1 - bloodSeverity;
      value =
        (baseCon + hearingCap * 0.05) *
        painMult *
        bloodMult *
        conditionConsciousnessMultiplier(pawn);
      break;
    }
    case 'pain': {
      value = painValue;
      break;
    }
    case 'manipulation': {
      value = limbCapacity((id) => /arm/i.test(id), 0.3);
      break;
    }
    case 'sight': {
      const baseSight = organBlend(/eye/i, 0.4) + 0.05;
      value = baseSight * (lightMultiplier ?? 1.0);
      break;
    }
    case 'night_vision': {
      value = getNightVision(pawn);
      break;
    }
    case 'moving': {
      value = limbCapacity((id) => /leg/i.test(id), 0.5);
      break;
    }
    case 'blood_pumping': {
      value = organOne(/heart/i) * 0.9 + 0.1;
      break;
    }
    case 'blood_filtration': {
      value = organBlend(/kidney|malpighian/i, 0.4);
      break;
    }
    case 'breathing': {
      value = organBlend(/lung/i, 0.5) + 0.05;
      break;
    }
    case 'digestion': {
      value = organOne(/stomach/i) * 0.6 + organOne(/liver|digestivegland/i) * 0.4;
      break;
    }
    case 'talking': {
      const jaw = organMissing('head', 'jaw') ? 0.0 : organH('head', 'jaw') / 100;
      value = jaw * 0.9 + 0.1;
      break;
    }
    case 'hearing': {
      const leftE = organMissing('head', 'leftEar') ? 0.0 : organH('head', 'leftEar') / 100;
      const rightE = organMissing('head', 'rightEar') ? 0.0 : organH('head', 'rightEar') / 100;
      const minE = Math.min(leftE, rightE);
      const avgE = (leftE + rightE) / 2;
      value = minE * 0.3 + avgE * 0.7 + 0.15;
      break;
    }
    default:
      value = 1.0;
  }

  return value;
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
  private _capCache = new Map<
    string,
    { limbs: unknown; injuries: unknown; light: number; caps: Record<string, number> }
  >();
  private _capHits = 0;
  private _capMiss = 0;

  computeCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number> {
    const light = lightMultiplier ?? pawn.effectiveLight ?? 1;
    const lightBucket = Math.round(light * 10) / 10;
    const c = this._capCache.get(pawn.id);
    if (c && c.limbs === pawn.limbs && c.injuries === pawn.injuries && c.light === lightBucket) {
      this._capHits++;
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
    const caps = this._buildCapacities(pawn, light);
    if (this._capCache.size > 2048) this._capCache.clear();
    this._capCache.set(pawn.id, {
      limbs: pawn.limbs,
      injuries: pawn.injuries,
      light: lightBucket,
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
    for (const id of capacityIds) {
      capacities[id] = calculateCapacityValue(
        pawn,
        id,
        capacities,
        id === 'sight' ? lightMultiplier : undefined
      );
    }
    return capacities;
  }

  evaluateStat(statId: string, pawn: Pawn | Mob): number {
    const def = STAT_MAP[statId];
    if (!def) return 1.0;
    const capacities =
      def.category === 'capacity' ? this.computeCapacities(pawn) : this.computeCapacities(pawn);
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
      const con = stat - trait;
      const sources: TempToleranceSource[] = [];
      if (con !== 0) sources.push({ label: 'Constitution', deg: con * TEMP_RES_DEG_PER_UNIT });
      if (trait !== 0) sources.push({ label: 'Traits', deg: trait * TEMP_RES_DEG_PER_UNIT });
      let gearTotal = 0;
      for (const g of gear) {
        const r = pick(g);
        if (r === 0) continue;
        sources.push({ label: g.name, deg: r * TEMP_RES_DEG_PER_UNIT });
        gearTotal += r;
      }
      const raw = (con + trait + gearTotal) * TEMP_RES_DEG_PER_UNIT;
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
      STRENGTH: (s?.strength ?? 10) * sm.strength,
      DEXTERITY: (s?.dexterity ?? 10) * sm.dexterity,
      CONSTITUTION: (s?.constitution ?? 10) * sm.constitution,
      PERCEPTION: (s?.perception ?? 10) * sm.perception,
      INTELLIGENCE: (s?.intelligence ?? 10) * sm.intelligence,
      CHARISMA: s?.charisma ?? 10,
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
