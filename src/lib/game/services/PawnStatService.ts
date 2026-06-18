import type {
  Pawn,
  Mob,
  BodyPartState,
  ConditionDef,
  TransientConditionDef,
  Item,
  ItemInstance,
  RacialTrait
} from '../core/types';
import statsData from '../database/stats.jsonc';
import conditionsData from '../database/conditions.jsonc';
import itemsData from '../database/items.jsonc';
import { WORK_CATEGORIES } from '../core/Work';
import { qualityMultiplier } from '../core/itemQuality';

// conditions.jsonc holds both persistent conditions (severity/stages) and transient ones
// (re-derived each tick); split them by the `duration` discriminant — see the file header.
const ALL_CONDITION_DEFS = conditionsData as unknown as Array<ConditionDef | TransientConditionDef>;
const CONDITIONS_DB = ALL_CONDITION_DEFS.filter(
  (d): d is ConditionDef => d.duration === 'persistent'
);
const TRANSIENT_CONDITIONS_DB = ALL_CONDITION_DEFS.filter(
  (d): d is TransientConditionDef => d.duration === 'transient'
);
const ITEMS_DB = itemsData as unknown as Item[];

// ── Stat definitions loaded from JSONC ────────────────────────────────────
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

// ── Tool work boosts (additive) ───────────────────────────────────────────────
// A held tool ADDS its `toolBoost.speed` / `toolBoost.yield` to the matching work category's speed /
// yield modifier (so a stone_pick with {speed:0.5,yield:0.4} turns a 1.0 mining mult into 1.5 / 1.4).
// The magnitudes live on the tool ITEMS (items.jsonc); which category a tool serves comes from
// Work.ts `toolsRequired`. Built once.
const CATEGORY_TOOLS: Record<string, Set<string>> = {};
for (const cat of WORK_CATEGORIES) {
  if (cat.toolsRequired?.length) CATEGORY_TOOLS[cat.id] = new Set(cat.toolsRequired);
}
const TOOL_BOOST: Record<string, { speed: number; yield: number }> = {};
for (const item of ITEMS_DB) {
  const b = (item as { toolBoost?: { speed?: number; yield?: number } }).toolBoost;
  if (b) TOOL_BOOST[item.id] = { speed: b.speed ?? 0, yield: b.yield ?? 0 };
}

/**
 * Additive work boost from the best HELD tool (equipped or carried) qualifying for `workType`, or null
 * if the entity holds none. Takes the strongest speed/yield boost independently across held tools.
 * Mobs have no equipment/inventory → always null.
 */
function heldToolBoost(
  entity: Pawn | Mob,
  workType: string
): { speed: number; yield: number } | null {
  const tools = CATEGORY_TOOLS[workType];
  if (!tools) return null;
  let speed = 0;
  let yieldB = 0;
  let found = false;
  const consider = (inst: ItemInstance) => {
    if (!tools.has(inst.itemId)) return;
    const b = TOOL_BOOST[inst.itemId];
    if (!b) return;
    found = true;
    // §Q: a higher-quality tool gives a bigger work boost (and, separately, wears slower).
    const q = qualityMultiplier(inst.quality);
    if (b.speed * q > speed) speed = b.speed * q;
    if (b.yield * q > yieldB) yieldB = b.yield * q;
  };
  const eq = (entity as Pawn).equipment;
  if (eq) for (const inst of Object.values(eq)) if (inst) consider(inst);
  const carried = (entity as Pawn).inventory?.instances;
  if (carried) for (const inst of carried) consider(inst);
  return found ? { speed, yield: yieldB } : null;
}

// ── Formula evaluator: substitutes stat tokens + weight/height + capacities ──
// Safe: expression is from project JSONC (not user input); sanitised to arithmetic chars only.
// Formula variables in a FIXED order — used both as the compiled function's parameter list and the
// per-call argument order. (Profiler: evaluateFormula was ~15-17% of the sim — it regex-substituted
// 21 tokens into a string and `new Function`-compiled + number-parsed it on EVERY call, ~328×/tick.)
const FORMULA_VARS = [
  'STR',
  'DEX',
  'CON',
  'PER',
  'INT',
  'CHA',
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
  'pain'
] as const;
const FORMULA_VAR_RE = new RegExp('\\b(?:' + FORMULA_VARS.join('|') + ')\\b', 'g');

// Compile each unique formula ONCE into a real function (vars → number), cached by formula string.
// Formulas come from a fixed stats.jsonc set, so this turns the per-call regex+compile+parse into a
// one-time cost + a plain function call. Invalid/unknown-token formulas cache as null → 1.0.
const _formulaCache = new Map<string, ((...vars: number[]) => number) | null>();

function compileFormula(formula: string): ((...vars: number[]) => number) | null {
  const cached = _formulaCache.get(formula);
  if (cached !== undefined) return cached;
  // Normalise unicode operators; variable names stay as identifiers (they become fn params).
  const expr = formula.replace(/×/g, '*').replace(/−/g, '-');
  // Safety: after blanking known vars, only arithmetic may remain (formulas are project JSONC, but
  // this still blocks a malformed/unknown-token formula from compiling to arbitrary code).
  const stripped = expr.replace(FORMULA_VAR_RE, '0');
  let fn: ((...vars: number[]) => number) | null = null;
  if (/^[\d\s+\-*/.()]+$/.test(stripped)) {
    try {
      // eslint-disable-next-line no-new-func
      fn = new Function(...FORMULA_VARS, '"use strict"; return (' + expr + ');') as (
        ...vars: number[]
      ) => number;
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
  capacities: Record<string, number> = {}
): number {
  if (!formula) return 1.0;
  const fn = compileFormula(formula);
  if (!fn) return 1.0;
  // Args MUST match FORMULA_VARS order. Stats default to 10 when absent so formulas never crash on
  // partial entities (some mobs / minimal test fixtures may lack a full stat block).
  const s = p.stats;
  const tr = p.physicalTraits;
  const v = fn(
    s?.strength ?? 10,
    s?.dexterity ?? 10,
    s?.constitution ?? 10,
    s?.perception ?? 10,
    s?.intelligence ?? 10,
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
    capacities.pain ?? 0
  );
  return isFinite(v) ? Math.round(v * 1000) / 1000 : 1.0;
}

// ── Capacity calculator: derives body capacities from specific organs ──
// Uses partial-function logic with real organs (heart, lungs, kidneys, eyes…).
// Paired organs use weighted blend of weaker (bottleneck) and average (compensation).
function calculateCapacityValue(
  pawn: Pawn | Mob,
  capacityId: string,
  capacities: Record<string, number>,
  lightMultiplier?: number
): number {
  const limbs = pawn.limbs ?? [];
  const limb = (id: string) => limbs.find((l) => l.id === id);
  const limbH = (id: string) => limb(id)?.health ?? 100;
  const limbMissing = (id: string) => limb(id)?.isMissing ?? false;

  // Organ lookup: find a specific BodyPartState inside a limb's parts[]
  const organ = (limbId: string, organId: string): BodyPartState | undefined =>
    limb(limbId)?.parts?.find((p) => p.id === organId);
  // Health as a PERCENT of the organ's own maxHp (0–100), so callsites' `/100` yields the
  // correct 0–1 fraction. Organs carry realistic small maxHp (eyes 10, heart 20…); dividing
  // absolute hp by a flat 100 made a fully-healthy organ read as ~10% capacity. Absent/
  // unmodelled organ → treated as fully healthy (100), matching the prior fallback.
  const organH = (limbId: string, organId: string) => {
    const o = organ(limbId, organId);
    if (!o) return 100;
    const max = o.maxHp ?? 100;
    const hp = o.health ?? max;
    return max > 0 ? (hp / max) * 100 : 0;
  };
  const organMissing = (limbId: string, organId: string) =>
    organ(limbId, organId)?.isMissing ?? false;

  let value = 1.0;

  // Pre-compute pain since consciousness depends on it
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
  const painValue = (injuryPain + limbPain + bleedPain) / 100;

  switch (capacityId) {
    case 'consciousness': {
      const brain = organMissing('head', 'brain') ? 0.0 : organH('head', 'brain') / 100;
      const heart = organMissing('torso', 'heart') ? 0.0 : organH('torso', 'heart') / 100;
      const leftLung = organMissing('torso', 'leftLung') ? 0.0 : organH('torso', 'leftLung') / 100;
      const rightLung = organMissing('torso', 'rightLung')
        ? 0.0
        : organH('torso', 'rightLung') / 100;
      const avgLung = (leftLung + rightLung) / 2;
      const baseCon = brain * 0.5 + heart * 0.15 + avgLung * 0.1 + 0.1;
      const sightCap = capacities.sight ?? 1;
      const hearingCap = capacities.hearing ?? 1;
      // Pain drives consciousness down (RimWorld pain-shock): ~80 pain → ~0.3
      // consciousness, which is the colony's downing threshold. Organ/blood damage
      // lowers baseCon on top, so a wounded pawn faints at lower pain.
      const effectivePain = Math.max(0, painValue - 0.1);
      const painMult = Math.max(0.05, 1 - effectivePain);
      value = (baseCon + sightCap * 0.1 + hearingCap * 0.05) * painMult;
      break;
    }
    case 'pain': {
      value = painValue;
      break;
    }
    case 'manipulation': {
      const left = limbMissing('left_arm') ? 0.0 : limbH('left_arm') / 100;
      const right = limbMissing('right_arm') ? 0.0 : limbH('right_arm') / 100;
      const minArm = Math.min(left, right);
      const avgArm = (left + right) / 2;
      value = minArm * 0.3 + avgArm * 0.7;
      break;
    }
    case 'sight': {
      const leftEye = organMissing('head', 'leftEye') ? 0.0 : organH('head', 'leftEye') / 100;
      const rightEye = organMissing('head', 'rightEye') ? 0.0 : organH('head', 'rightEye') / 100;
      const minEye = Math.min(leftEye, rightEye);
      const avgEye = (leftEye + rightEye) / 2;
      const baseSight = minEye * 0.4 + avgEye * 0.6 + 0.05;
      value = baseSight * (lightMultiplier ?? 1.0);
      break;
    }
    case 'moving': {
      const left = limbMissing('left_leg') ? 0.0 : limbH('left_leg') / 100;
      const right = limbMissing('right_leg') ? 0.0 : limbH('right_leg') / 100;
      const minLeg = Math.min(left, right);
      const avgLeg = (left + right) / 2;
      value = minLeg * 0.5 + avgLeg * 0.5;
      break;
    }
    case 'blood_pumping': {
      const heart = organMissing('torso', 'heart') ? 0.0 : organH('torso', 'heart') / 100;
      value = heart * 0.9 + 0.1;
      break;
    }
    case 'blood_filtration': {
      const leftK = organMissing('torso', 'leftKidney') ? 0.0 : organH('torso', 'leftKidney') / 100;
      const rightK = organMissing('torso', 'rightKidney')
        ? 0.0
        : organH('torso', 'rightKidney') / 100;
      const minK = Math.min(leftK, rightK);
      const avgK = (leftK + rightK) / 2;
      value = minK * 0.4 + avgK * 0.6;
      break;
    }
    case 'breathing': {
      const leftL = organMissing('torso', 'leftLung') ? 0.0 : organH('torso', 'leftLung') / 100;
      const rightL = organMissing('torso', 'rightLung') ? 0.0 : organH('torso', 'rightLung') / 100;
      const minL = Math.min(leftL, rightL);
      const avgL = (leftL + rightL) / 2;
      value = minL * 0.5 + avgL * 0.5 + 0.05;
      break;
    }
    case 'digestion': {
      const stomach = organMissing('torso', 'stomach') ? 0.0 : organH('torso', 'stomach') / 100;
      const liver = organMissing('torso', 'liver') ? 0.0 : organH('torso', 'liver') / 100;
      value = stomach * 0.6 + liver * 0.4;
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

// ── Trait work multipliers ──────────────────────────────────────────────────
// Each trait effect key (workSpeed / workYield / workQuality) maps a workType (or
// "all") to a multiplier applied directly to the matching getWorkModifiers output.
function traitWorkMult(
  pawn: Pawn | Mob,
  key: 'workSpeed' | 'workYield' | 'workQuality',
  workType: string
): number {
  let mult = 1;
  // Mobs have no racial traits; only Pawns carry them.
  const traits = 'racialTraits' in pawn ? pawn.racialTraits : [];
  for (const trait of traits ?? []) {
    const map = trait.effects?.[key] as Record<string, number> | undefined;
    if (!map) continue;
    if (map[workType]) mult *= map[workType];
    if (map['all']) mult *= map['all'];
  }
  return mult;
}

// ── Racial resistance bonuses (Race overhaul) ────────────────────────────────
// Trait resistance effects add on top of the matching *_resistance stat formula, so a
// race's biology flows into both combat mitigation AND condition onset — e.g. coldResistance
// raises cold_resistance, which PawnStateMachine reads to slow HYPOTHERMIA onset. No new
// condition machinery: it reuses the existing resistance→onset wiring.
const RESISTANCE_TRAIT_KEY: Record<string, keyof RacialTrait['effects']> = {
  cold_resistance: 'coldResistance',
  fire_resistance: 'fireResistance',
  poison_resistance: 'poisonResistance',
  disease_resistance: 'diseaseResistance',
  mental_resistance: 'mentalResistance'
};

function traitResistanceBonus(pawn: Pawn | Mob, statId: string): number {
  const key = RESISTANCE_TRAIT_KEY[statId];
  if (!key) return 0;
  const traits = 'racialTraits' in pawn ? pawn.racialTraits : [];
  let bonus = 0;
  for (const trait of traits ?? []) {
    const v = trait.effects?.[key];
    if (typeof v === 'number') bonus += v;
  }
  return bonus;
}

// ── Transient state work penalty (conditions + transient conditions) ───────────────
// Health conditions (thirst, malnutrition, blood loss …) and transient conditions
// (tired, hungry, inspired …) carry a `workEfficiency` scalar = overall work-rate
// multiplier. It applies to SPEED only (matching the prior model). Organ/limb damage
// is NOT included here — that already flows through the capacity terms in the formulas.
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

// ── Service interface ──────────────────────────────────────────────────────
export interface PawnStatService {
  /** Evaluate any stat formula from stats.jsonc for a given pawn or mob. */
  evaluateStat(statId: string, pawn: Pawn | Mob): number;
  /** Compute all body capacities (0–1) for a pawn or mob. */
  computeCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number>;
  /**
   * Speed / yield / quality multipliers for a work type. `yield` and `quality` are
   * `null` for jobs that don't have that axis (e.g. hauling has neither, a gather job
   * has no quality) — driven by which `*_yield` / `*_quality` formulas exist in stats.jsonc.
   */
  getWorkModifiers(
    pawn: Pawn | Mob,
    workType: string,
    lightMultiplier?: number
  ): { speed: number; yield: number | null; quality: number | null };
  /** Check if a stat ID exists in stats.jsonc. */
  hasStat(statId: string): boolean;
}

export class PawnStatServiceImpl implements PawnStatService {
  // #1 capacity cache (ENGINE-PERFORMANCE): keyed by entity id, validated by limbs+injuries ARRAY
  // IDENTITY. Capacities depend only on those two (+ light for sight); both are replaced
  // by-reference when they change (combat damage / healing are immutable), so ref-equality is an
  // exact O(1) "unchanged?" check — RimWorld-style recompute-only-on-change. Profiler showed ~615
  // computeCapacities/tick; most entities are unwounded most ticks → cache hit → ~0.
  private _capCache = new Map<
    string,
    { limbs: unknown; injuries: unknown; caps: Record<string, number> }
  >();

  computeCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number> {
    // Light varies per tile/time and feeds `sight` (→ consciousness), so light-affected calls
    // (getWorkModifiers) can't share the cache — only the no-light path (evaluateStat + direct
    // calls, the ~465/tick bulk) is cached.
    if (lightMultiplier === undefined) {
      const c = this._capCache.get(pawn.id);
      if (c && c.limbs === pawn.limbs && c.injuries === pawn.injuries) return c.caps;
      const caps = this._buildCapacities(pawn, undefined);
      if (this._capCache.size > 2048) this._capCache.clear(); // bound memory across entity churn
      this._capCache.set(pawn.id, { limbs: pawn.limbs, injuries: pawn.injuries, caps });
      return caps;
    }
    return this._buildCapacities(pawn, lightMultiplier);
  }

  private _buildCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number> {
    const capacities: Record<string, number> = {};
    // Order matters: pain → sight → hearing → consciousness → everything else
    const capacityIds = [
      'pain',
      'sight',
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
    return evaluateFormula(def.formula, pawn, capacities) + traitResistanceBonus(pawn, statId);
  }

  getWorkModifiers(
    pawn: Pawn | Mob,
    workType: string,
    lightMultiplier?: number
  ): { speed: number; yield: number | null; quality: number | null } {
    // §G: a light multiplier dims the `sight` capacity, which every `*_speed`/`_yield`/`_quality`
    // formula multiplies by → work (and its quality) slows in the dark through the existing model.
    const capacities = this.computeCapacities(pawn, lightMultiplier);
    // A held tool ADDS its toolBoost to the speed/yield modifier (items.jsonc `toolBoost`).
    const toolBoost = heldToolBoost(pawn, workType);
    // Base = stat formula × body capacities. Layer explicit trait multipliers on top.
    // Transient state (conditions/transient conditions) applies to throughput → speed only.
    const stateMult = pawnStateWorkMultiplier(pawn);
    const speed = Math.max(
      0.1,
      (evaluateFormula(STAT_MAP[`${workType}_speed`]?.formula, pawn, capacities) +
        (toolBoost?.speed ?? 0)) *
        traitWorkMult(pawn, 'workSpeed', workType) *
        stateMult
    );
    // yield / quality are present only for jobs that define them in stats.jsonc.
    const axis = (kind: 'yield' | 'quality', traitKey: 'workYield' | 'workQuality') => {
      const def = STAT_MAP[`${workType}_${kind}`];
      if (!def) return null;
      // Tools add to yield (not quality — a sharp axe fells faster + recovers more, not "better wood").
      const toolAdd = kind === 'yield' ? (toolBoost?.yield ?? 0) : 0;
      return Math.max(
        0.1,
        (evaluateFormula(def.formula, pawn, capacities) + toolAdd) *
          traitWorkMult(pawn, traitKey, workType)
      );
    };
    return {
      speed,
      yield: axis('yield', 'workYield'),
      quality: axis('quality', 'workQuality')
    };
  }

  hasStat(statId: string): boolean {
    return statId in STAT_MAP;
  }
}

export const pawnStatService = new PawnStatServiceImpl();
