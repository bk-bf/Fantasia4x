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
import { WORK_CATEGORIES } from '../core/Work';
import { getNightVision } from '../core/vision';
import { getStealth } from '../core/stealth';
import { vlog } from '../core/logSink';
import { combinedQualityMultiplier } from '../core/itemQuality';
import {
  conditionStatMultipliers,
  conditionPainMultiplier,
  conditionConsciousnessMultiplier,
  tempRange,
  RECOVER_CONSCIOUSNESS
} from '../core/needs';
import { equippedTemperatureSources, type WornThermalSource } from '../core/PawnEquipment';
import { computePrestige } from '../core/prestige';
import { SECONDS_PER_TICK } from '../core/time';
import {
  levelBase,
  styleSpeedWeight,
  styleFinesseWeight,
  workSkillCategory,
  NEUTRAL_WORK_LEVEL
} from '../core/workExperience';

// conditions.jsonc holds both persistent conditions (severity/stages) and transient ones
// (re-derived each tick); split them by the `duration` discriminant — see the file header.
const ALL_CONDITION_DEFS = conditionsData as unknown as Array<ConditionDef | TransientConditionDef>;
const CONDITIONS_DB = ALL_CONDITION_DEFS.filter((d): d is ConditionDef => d.transient !== true);
const TRANSIENT_CONDITIONS_DB = ALL_CONDITION_DEFS.filter(
  (d): d is TransientConditionDef => d.transient === true
);
const ITEMS_DB = itemsData as unknown as Item[];
const ITEM_BY_ID = new Map(ITEMS_DB.map((i) => [i.id, i]));

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
const COMBAT_STAT_IDS = new Set(STATS.filter((s) => s.category === 'combat').map((s) => s.id));

// ── Tool work boosts (additive) ───────────────────────────────────────────────
// A held tool ADDS its `toolBoost.speed` / `toolBoost.yield` to the matching work category's speed /
// yield modifier (so a stone_pick with {speed:0.5,yield:0.4} turns a 1.0 mining mult into 1.5 / 1.4).
// The magnitudes live on the tool ITEMS (items.jsonc); which category a tool serves comes from
// Work.ts `toolsRequired` (gates + boosts) PLUS `boostTools` (boosts only — e.g. a sickle/knife
// speeds up tool-free foraging without gating it). Built once.
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

/**
 * Additive work boost from the best HELD tool (equipped or carried) qualifying for `workType`, or null
 * if the entity holds none. Takes the strongest speed/yield boost independently across held tools.
 * Mobs have no equipment/inventory → always null.
 */
function heldToolBoost(
  entity: Pawn | Mob,
  workType: string
): { speed: number; yield: number; itemId?: string } | null {
  const tools = CATEGORY_TOOLS[workType];
  if (!tools) return null;
  let speed = 0;
  let yieldB = 0;
  let found = false;
  let speedItemId: string | undefined; // the tool driving the (max) speed boost — for UI itemisation
  const consider = (inst: ItemInstance) => {
    if (!tools.has(inst.itemId)) return;
    const b = TOOL_BOOST[inst.itemId];
    if (!b) return;
    found = true;
    // §Q: a higher-quality tool gives a bigger work boost (and, separately, wears slower).
    // §I: a Famed tool explodes that boost ×2–5 on top of its tier.
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
  // Also recognise a tool held in the bulk `inventory.items` count map (no per-unit instance, so it
  // counts at Standard quality) — a tool boosts work however it ended up in the pack.
  const bulk = (entity as Pawn).inventory?.items;
  if (bulk)
    for (const id in bulk) if ((bulk[id] ?? 0) > 0) consider({ itemId: id } as ItemInstance);
  return found ? { speed, yield: yieldB, itemId: speedItemId } : null;
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
  'pain',
  // KINGDOMS-TRADE §4: standing prestige from worn regalia (core/prestige.computePrestige). Computed
  // ONLY when a formula references it (see evaluateFormula) — 0 on every hot-path call.
  'prestige',
  // SOCIAL-LAYER §5: fraction of body parts still whole and unscarred (beauty). Same lazy pattern
  // as prestige — the whole-body scan runs ONLY when a formula references it; 1 on hot-path calls.
  'intact',
  // WORK-EXPERIENCE: the work stats' experience-level base — levelBase(level) × style weight,
  // resolved per work category + axis by getWorkModifiers/evaluateStat. 1.0 in non-work formulas.
  'SKILL'
] as const;
const FORMULA_VAR_RE = new RegExp('\\b(?:' + FORMULA_VARS.join('|') + ')\\b', 'g');

// Hypovolemic-shock band for consciousness: fraction of blood lost at which fainting onsets
// (below = compensated, no effect) and at which the pawn is fully out cold. A healthy pawn
// crosses the ~0.3 downing threshold near ~45% loss, leaving a bleed-out/rescue window.
const BLOOD_FAINT_ONSET = 0.2;
const BLOOD_FAINT_FLOOR = 0.55;

// A broken bone guts the limb's physical capacity (manipulation for an arm, moving for a leg) to this
// fraction — heavy, but a notch above losing the limb. The graded `fractured` CONDITION layers the STR/DEX
// crush on top (different axis), so the two together make a fracture genuinely crippling.
const BROKEN_BONE_FUNCTION_MULT = 0.4;

// Compile each unique formula ONCE into a real function (vars → number), cached by formula string.
// Formulas come from a fixed stats.jsonc set, so this turns the per-call regex+compile+parse into a
// one-time cost + a plain function call. Invalid/unknown-token formulas cache as null → 1.0.
const _formulaCache = new Map<string, ((...vars: number[]) => number) | null>();
// Whether a formula references `prestige` — cached so the hot path never re-scans the string
// (prestige walks the whole equipment doll; only the social formulas should ever pay for it).
const _formulaUsesPrestige = new Map<string, boolean>();

function formulaUsesPrestige(formula: string): boolean {
  let uses = _formulaUsesPrestige.get(formula);
  if (uses === undefined) {
    uses = formula.includes('prestige');
    _formulaUsesPrestige.set(formula, uses);
  }
  return uses;
}

// Whether a formula references `intact` — cached like prestige so only the social formulas
// (beauty) ever pay for the whole-body part scan.
const _formulaUsesIntact = new Map<string, boolean>();

function formulaUsesIntact(formula: string): boolean {
  let uses = _formulaUsesIntact.get(formula);
  if (uses === undefined) {
    uses = /\bintact\b/.test(formula);
    _formulaUsesIntact.set(formula, uses);
  }
  return uses;
}

/**
 * SOCIAL-LAYER §5: fraction of the body still whole and unscarred, 0..1. Each fine part counts 1;
 * a missing part (or one on a severed limb) counts 0, and every lasting mark — a healed-over scar
 * (`*_scar` type or `permanent`) — shaves a quarter, floored at half for a scarred-but-whole part.
 * Entities without a limb model read as pristine (1).
 */
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

// The one function formulas may call: clamp(x, lo, hi) — hard floors/caps (stealth's DEX gate
// needs a true zero below the floor, which no arithmetic-only expression can produce).
const FORMULA_CLAMP = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

function compileFormula(formula: string): ((...vars: number[]) => number) | null {
  const cached = _formulaCache.get(formula);
  if (cached !== undefined) return cached;
  // Normalise unicode operators; variable names stay as identifiers (they become fn params).
  const expr = formula.replace(/×/g, '*').replace(/−/g, '-');
  // Safety: after blanking known vars + the clamp keyword, only arithmetic may remain (formulas are
  // project JSONC, but this still blocks a malformed/unknown-token formula from compiling to
  // arbitrary code). Commas are allowed solely for clamp's argument list.
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
  skill = 1.0
): number {
  if (!formula) return 1.0;
  const fn = compileFormula(formula);
  if (!fn) return 1.0;
  // Args MUST match FORMULA_VARS order. Stats default to 10 when absent so formulas never crash on
  // partial entities (some mobs / minimal test fixtures may lack a full stat block).
  const s = p.stats;
  const tr = p.physicalTraits;
  // Active conditions scale the RAW attributes here, so every stat formula (combat, work, capacities-
  // adjacent) sees a crippled body — a severe shock/hypothermia genuinely guts STR/DEX, not just work.
  const sm = conditionStatMultipliers(p);
  // Prestige scans the whole equipment doll — pay for it only when the formula asks (trade/social
  // stats), never on the ~328×/tick work/combat formulas.
  const prestige = formulaUsesPrestige(formula) ? computePrestige(p) : 0;
  // Same deal for the whole-body `intact` scan (beauty only).
  const intact = formulaUsesIntact(formula) ? intactBodyFraction(p) : 1;
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
    skill
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
  // A limb counts as bone-broken if any of its (still-attached) parts has a broken bone.
  const limbBoneBroken = (id: string) =>
    (limb(id)?.parts ?? []).some((p) => p.boneBroken && !p.isMissing);
  // Aggregate a locomotor/manipulator capacity over EVERY limb matching `pred` (e.g. all "leg" limbs —
  // works for a humanoid's 2 legs, a quadruped's 4, a bird's 2). Folds in missing limbs (0), soft-tissue
  // health, and a broken-bone cripple. Returns 1.0 when the body plan has no such limb (a snake has no
  // legs, a beast no hands) so the entity isn't penalised for anatomy it never had. minWeight blends the
  // weakest limb (bottleneck) with the average.
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

  // Plan-agnostic organ lookup: gather the 0–1 health fractions of EVERY modelled part (across all limbs)
  // whose id matches `pat` — a missing part counts 0. Lets a capacity find its organ wherever the body plan
  // keeps it (a mammal's kidneys in the torso, a spider's Malpighian tubules in the opisthosoma; mammalian
  // lungs vs arachnid book lungs) without hardcoding a limb or id. An EMPTY result means the plan doesn't
  // model that organ at all → the caller treats it as fully healthy (matching the prior absent-organ fallback).
  // For a mammal (organs only in their one expected limb) this returns exactly the same set the old literal
  // `organMissing/organH` reads did, so existing creatures are unchanged.
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
  // A single (or bottleneck) organ's health fraction — the weakest match; not-modelled → fully healthy (1).
  const organOne = (pat: RegExp): number => {
    const f = organFracs(pat);
    return f.length ? Math.min(...f) : 1;
  };
  // Paired-organ blend (eyes/lungs/kidneys): the weakest organ drags the capacity (min) while the rest
  // compensate (avg). `minWeight` is the bottleneck share. Not-modelled → fully healthy (1).
  const organBlend = (pat: RegExp, minWeight: number): number => {
    const f = organFracs(pat);
    const v = f.length ? f : [1];
    const min = Math.min(...v);
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    return min * minWeight + avg * (1 - minWeight);
  };

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
  // §F8: a pain-numbing condition (drunk, painkillers) dulls felt pain — so it presses less on
  // consciousness/the pain capacity. The injuries are still there; the body just feels them less.
  const painValue = ((injuryPain + limbPain + bleedPain) / 100) * conditionPainMultiplier(pawn);

  switch (capacityId) {
    case 'consciousness': {
      const brain = organOne(/brain|synganglion/i); // mammalian brain OR an arachnid's synganglion
      const heart = organOne(/heart/i);
      const avgLung = organBlend(/lung/i, 0); // pure average across the lungs (book lungs included)
      // Sight's old 0.1 weight is folded into the brain: a BLIND pawn is not less conscious, and this is
      // what lets low light lower `sight` (Darkness) without dimming consciousness/everything else.
      const baseCon = brain * 0.6 + heart * 0.15 + avgLung * 0.1 + 0.1;
      const hearingCap = capacities.hearing ?? 1;
      // Pain drives consciousness down (pain-shock): ~80 pain → ~0.3 consciousness,
      // which is the colony's downing threshold. Missing/damaged organs lower baseCon
      // on top, so a wounded pawn faints at lower pain.
      const effectivePain = Math.max(0, painValue - 0.1);
      const painMult = Math.max(0.05, 1 - effectivePain);
      // Hypovolemic shock: blood loss faints a pawn BEFORE exsanguination, so a bleeding
      // wound shows the collapse → bleed-out-or-rescue arc instead of dropping dead at 0.
      // <20% loss is compensated (no effect); consciousness hits the ~0.3 downing point
      // near ~45% loss and bottoms out (out cold) by ~55%. Stacks with pain.
      const maxBlood = pawn.maxBloodVolume ?? 100;
      const bloodLoss = Math.max(0, 1 - (pawn.bloodVolume ?? maxBlood) / maxBlood);
      const bloodSeverity = Math.min(
        1,
        Math.max(0, (bloodLoss - BLOOD_FAINT_ONSET) / (BLOOD_FAINT_FLOOR - BLOOD_FAINT_ONSET))
      );
      const bloodMult = 1 - bloodSeverity;
      // §F8: heavy intoxication dims alertness (drunk → woozy, blackout → can collapse) — a
      // `consciousness` condition modifier, multiplied straight onto the capacity.
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
      // Hands/arms across the body plan (humanoid arms; beasts have none → 1.0). A broken arm bone
      // cripples the hand's use even with the soft tissue intact.
      value = limbCapacity((id) => /arm/i.test(id), 0.3);
      break;
    }
    case 'sight': {
      // Every eye the plan has (a humanoid's 2, a spider's 8): the worst eye bottlenecks (×0.4), the rest
      // compensate (×0.6). A 2-eye creature is identical to the old leftEye/rightEye read. Then LOW LIGHT
      // dampens it (lightMultiplier = the pawn's effective light, already night-vision-adjusted) — this is
      // what the Darkness condition surfaces. 1.0 = full daylight (or full night vision) → no dampening.
      const baseSight = organBlend(/eye/i, 0.4) + 0.05;
      value = baseSight * (lightMultiplier ?? 1.0);
      break;
    }
    case 'night_vision': {
      // Darkness immunity 0–1: summed from cultural traits (pawns) or the creature def (mobs). NOT organ- or
      // core-stat-derived — a real stats.jsonc stat so it's inspectable next to sight; it's the COUNTER to
      // the light dampening on `sight` (feeds the pawn's effectiveLight, computed by the caller).
      value = getNightVision(pawn);
      break;
    }
    case 'moving': {
      // Legs across the body plan (humanoid 2, quadruped 4, bird 2; a legless serpent → 1.0). A broken
      // leg bone cripples gait even with the soft tissue intact.
      value = limbCapacity((id) => /leg/i.test(id), 0.5);
      break;
    }
    case 'blood_pumping': {
      value = organOne(/heart/i) * 0.9 + 0.1;
      break;
    }
    case 'blood_filtration': {
      // Mammalian kidneys OR an arachnid's Malpighian tubules — same bottleneck/average blend either way.
      value = organBlend(/kidney|malpighian/i, 0.4);
      break;
    }
    case 'breathing': {
      // Mammalian lungs OR an arachnid's book lungs (both match /lung/i).
      value = organBlend(/lung/i, 0.5) + 0.05;
      break;
    }
    case 'digestion': {
      // Mammalian stomach + liver, OR an arachnid's sucking stomach + digestive gland (hepatopancreas).
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

// ── Trait work multipliers ──────────────────────────────────────────────────
// Each trait effect key (workSpeed / workYield / workQuality) maps a workType (or
// "all") to a multiplier applied directly to the matching getWorkModifiers output.
function traitWorkMult(
  pawn: Pawn | Mob,
  key: 'workSpeed' | 'workYield' | 'workQuality',
  workType: string,
  fallbackType?: string
): number {
  let mult = 1;
  // Mobs have no cultural traits; only Pawns carry them.
  const traits = 'traits' in pawn ? pawn.traits : [];
  for (const trait of traits ?? []) {
    const map = trait.effects?.[key] as Record<string, number> | undefined;
    if (!map) continue;
    // Prefer a subjob-specific trait entry, else the parent category's — so a "Master Builder"
    // (workSpeed.construction) still boosts the repair/demolish subjobs.
    const specific = map[workType] ?? (fallbackType ? map[fallbackType] : undefined);
    if (specific) mult *= specific;
    if (map['all']) mult *= map['all'];
  }
  return mult;
}

// ── Trait combat multipliers (TRAIT-LIBRARY-EXPANSION §1) ───────────────────
// `effects.combatMods` maps a COMBAT statId (hit_chance, dodge, knockdown_resistance, attack_speed,
// hit_precision, aim_speed, reload_speed, aim_range) to a multiplier on the matching stats.jsonc combat
// output — the combat twin of traitWorkMult, so a "Sure-Handed" pawn genuinely lands more blows.
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

// ── Equipped-weapon attack speed (weapon → attack_speed stat) ────────────────
// The equipped mainHand weapon's own `attackSpeed` multiplies the attack_speed stat, so a heavy maul
// (0.65) genuinely swings slower and a dagger (1.5) faster — the wired path from a weapon's heft into
// cadence (Combat's attack interval reads this stat). 1.0 when unarmed / no weapon / for mobs, and for
// natural attacks (every natural weapon sits at 1.0), so nothing there shifts.
function equippedWeaponSpeedMult(pawn: Pawn | Mob): number {
  const mh = (pawn as Pawn).equipment?.mainHand;
  if (!mh) return 1;
  return ITEM_BY_ID.get(mh.itemId)?.weaponProperties?.attackSpeed ?? 1;
}

// ── Cultural resistance bonuses (Culture overhaul) ────────────────────────────────
// Trait resistance effects add on top of the matching *_resistance stat formula, so a
// culture's biology flows into both combat mitigation AND condition onset — e.g. coldResistance
// raises cold_resistance, which PawnStateMachine reads to slow HYPOTHERMIA onset. No new
// condition machinery: it reuses the existing resistance→onset wiring.
const RESISTANCE_TRAIT_KEY: Record<string, keyof Trait['effects']> = {
  // Not a resistance, but the same trait→stat additive bridge: Regeneration lifts heal_rate. (The
  // typed resistances themselves now live in `trait.resistances` — see RESISTANCE_BLOCK_KEY below.)
  heal_rate: 'healRate'
};

/** TRAITS §0a — the resistance-stat id → the short key on `trait.resistances` (the dedicated covering /
 *  affinity block that replaced the forbidden `effects.*Resistance` riders). */
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

// Temperature tolerance (SEASONS_WEATHER): cold/heat resistance (the CON-derived stat + worn-gear
// insulation) is expressed as DEGREES of headroom on the comfort band — modelled on clothing `clo`
// insulation, where heavy winter kit buys ~20 °C of cold tolerance. One full resistance unit
// (stat + gear) ⇒ TEMP_RES_DEG_PER_UNIT °C, capped at TEMP_RES_DEG_CAP so no kit is fully immune.
const TEMP_RES_DEG_PER_UNIT = 20;
const TEMP_RES_DEG_CAP = 25;

/** A stat's value breakdown for a hover tooltip: the symbolic formula + each variable it uses with the
 *  entity's current value (mirrors the attributes panel's derivation). */
export interface StatDerivation {
  formula: string;
  description: string;
  vars: { name: string; value: string }[];
}

/** One contributor to a side's resistance headroom, in degrees (for the hover breakdown). */
export interface TempToleranceSource {
  label: string;
  /** Degrees of headroom contributed (can be negative — a frail constitution costs tolerance). */
  deg: number;
}

/** A pawn's effective temperature comfort, with resistance folded in as degrees. The cold meter (and
 *  the cold fatigue penalty) start below `coldOnset`; the heat meter / hunger penalty above `heatOnset`. */
export interface TemperatureTolerance {
  /** Bare comfort band (culture/trait), before resistance. */
  comfortMin: number;
  comfortMax: number;
  /** Net degrees of headroom resistance buys on each side (clamped to [0, cap]). */
  coldDeg: number;
  heatDeg: number;
  /** Temperatures at which the cold / heat meter starts to rise = comfort ∓ resistance degrees. */
  coldOnset: number;
  heatOnset: number;
  /** Per-source breakdown (Constitution / Traits / Gear) of each side's headroom, for the hover panel. */
  coldSources: TempToleranceSource[];
  heatSources: TempToleranceSource[];
  /** True when the raw headroom hit the cap (so the breakdown sums beyond the shown degrees). */
  coldCapped: boolean;
  heatCapped: boolean;
}

// ── Service interface ──────────────────────────────────────────────────────
export interface PawnStatService {
  /** Evaluate any stat formula from stats.jsonc for a given pawn or mob. */
  evaluateStat(statId: string, pawn: Pawn | Mob): number;
  /** Effective cold/heat tolerance: the comfort band shifted outward by resistance (CON stat + worn
   *  gear) expressed as degrees — i.e. the temperatures at which the cold/heat meter starts to rise. */
  temperatureTolerance(pawn: Pawn | Mob): TemperatureTolerance;
  /** The factor breakdown behind a stat's value (same data the attributes panel shows): the symbolic
   *  formula plus each variable it uses with this entity's CURRENT value (attributes × condition,
   *  capacities). For hover tooltips on the combat/health pills. */
  describeStat(entity: Pawn | Mob, statId: string): StatDerivation;
  /** Compute all body capacities (0–1) for a pawn or mob. */
  computeCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number>;
  /** Ticks until a COLLAPSED entity wakes (consciousness back past RECOVER_CONSCIOUSNESS) when recovery
   *  is BLOOD-driven, or null when no honest estimate exists (still bleeding / blood full → wound-bound). */
  estimateBloodRecoveryTicks(entity: Pawn | Mob): number | null;
  /**
   * Speed / yield / quality multipliers for a work type. `yield` and `quality` are
   * `null` for jobs that don't have that axis (e.g. hauling has neither, a gather job
   * has no quality) — driven by which `*_yield` / `*_quality` formulas exist in stats.jsonc.
   */
  getWorkModifiers(
    pawn: Pawn | Mob,
    workType: string,
    lightMultiplier?: number,
    fallbackType?: string
  ): { speed: number; yield: number | null; quality: number | null };
  /** WORK-EXPERIENCE: the SKILL token behind a work stat id — the pawn's experience level in that
   *  category and the resulting formula factor (levelBase × style weight). Null for non-work ids. */
  workSkillInfo(statId: string, pawn: Pawn | Mob): { level: number; factor: number } | null;
  /** The held tool (equipped or carried) contributing the work boost for `workType`, with its additive
   *  speed/yield amounts (already quality-scaled) — for itemising the bonus in the work tooltip. Null
   *  when the pawn holds no boosting tool for that category. */
  heldToolFor(
    pawn: Pawn | Mob,
    workType: string
  ): { itemId: string; speed: number; yield: number } | null;
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
    { limbs: unknown; injuries: unknown; light: number; caps: Record<string, number> }
  >();
  // §G perf watch — light-dependent `sight` risks busting this hot-path cache (ENGINE-PERFORMANCE.md).
  private _capHits = 0;
  private _capMiss = 0;

  computeCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number> {
    // Sight is dampened by the pawn's effective (night-vision-adjusted) light: an explicit multiplier
    // (work) wins, else the per-tick `effectiveLight` stashed on the entity, else full light (1).
    const light = lightMultiplier ?? pawn.effectiveLight ?? 1;
    // BUCKET to 0.1 so the day/night curve (which nudges light every tick) doesn't invalidate the cache
    // every tick — it only misses a few times across a cycle, keeping the ~465 evals/tick cache-warm.
    const lightBucket = Math.round(light * 10) / 10;
    const c = this._capCache.get(pawn.id);
    if (c && c.limbs === pawn.limbs && c.injuries === pawn.injuries && c.light === lightBucket) {
      this._capHits++;
      return c.caps;
    }
    this._capMiss++;
    // Log the hit rate to .debug/perf.log every 4096 lookups (verbose-gated), so a cache regression from
    // the light key is visible immediately — the thing you asked for to troubleshoot fast.
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
    if (this._capCache.size > 2048) this._capCache.clear(); // bound memory across entity churn
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
    if (c0 >= RECOVER_CONSCIOUSNESS) return 0; // already at/over the wake line
    const totalBleed = (entity.limbs ?? []).reduce((s, l) => s + (l.bleedRate ?? 0), 0);
    if (totalBleed > 0) return null; // still bleeding → blood is FALLING, not recovering
    const maxBlood = entity.maxBloodVolume ?? 100;
    const blood = entity.bloodVolume ?? maxBlood;
    if (blood >= maxBlood) return null; // blood full → recovery is wound/pain-bound (mends glacially)
    // cCeil = consciousness if blood were fully restored. MUST bypass computeCapacities' cache: it keys
    // on limbs/injuries identity (not blood), so a {...entity, bloodVolume} clone would hit the cache and
    // wrongly return the current-blood value. _buildCapacities recomputes fresh.
    const cCeil =
      this._buildCapacities({ ...entity, bloodVolume: maxBlood } as Pawn).consciousness ?? 1;
    if (cCeil < RECOVER_CONSCIOUSNESS) return null; // even full blood < wake line → pain/organ-bound
    // consciousness(blood) = cCeil × bloodMult(blood) (blood is the ONLY blood-dependent factor), so
    // invert for the blood that hits the wake line, then divide the gap by the per-tick regen.
    const bloodMultTarget = RECOVER_CONSCIOUSNESS / cCeil;
    const bloodLossTarget =
      BLOOD_FAINT_ONSET + (1 - bloodMultTarget) * (BLOOD_FAINT_FLOOR - BLOOD_FAINT_ONSET);
    const bloodTarget = maxBlood * (1 - bloodLossTarget);
    // Blood regen per tick — inlined from calcBloodRegenRate(entities/Pawns) (importing it would close a
    // PawnStatService↔Pawns↔Combat cycle): (1 + (CON−10)·0.08)·0.05 blood/sec, CON-scaled, × per-tick.
    const bloodRegenPerSec = (1.0 + ((entity.stats?.constitution ?? 10) - 10) * 0.08) * 0.05;
    const regenPerTick = bloodRegenPerSec * SECONDS_PER_TICK;
    if (regenPerTick <= 0 || bloodTarget <= blood) return null;
    return (bloodTarget - blood) / regenPerTick;
  }

  private _buildCapacities(pawn: Pawn | Mob, lightMultiplier?: number): Record<string, number> {
    const capacities: Record<string, number> = {};
    // Order matters: pain → sight → hearing → consciousness → everything else
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
    // WORK-EXPERIENCE: work stats need their SKILL token resolved (level × style weight) so the
    // stand-alone read (UI stat tables, caretake tend roll) matches getWorkModifiers.
    const skill = def.category === 'work' ? (this.workSkillInfo(statId, pawn)?.factor ?? 1) : 1;
    // Trait combatMods multiply a combat stat's formula output (×1 for every other category);
    // trait resistances stay an ADDITIVE bridge on the 0-baseline resistance stats.
    const v =
      evaluateFormula(def.formula, pawn, capacities, skill) *
        traitCombatMult(pawn, statId) *
        (statId === 'attack_speed' ? equippedWeaponSpeedMult(pawn) : 1) +
      traitResistanceBonus(pawn, statId);
    // STEALTH Layer B: fold the flat additives (trait stealth, living-part grants, worn-armour
    // stealthMod / weight drag, natural-armour drag) onto the formula base — same stat-specific
    // augmentation precedent as attack_speed's weapon mult, so reading the stat gives the FULL value.
    return statId === 'stealth' ? getStealth(pawn, v) : v;
  }

  /**
   * WORK-EXPERIENCE: the SKILL token behind a work stat id for THIS pawn — its experience level in
   * the stat's category (subjobs read their parent's: `repair_speed` → construction) and the
   * resulting factor (levelBase × the style weight for the stat's axis). Null for non-work ids.
   */
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
    // Split each side's resistance into its sources (in degrees): the CON-derived stat base, any trait
    // resistance bonus, and EACH worn garment by name. `evaluateStat` already folds the trait bonus into
    // the stat, so the constitution base is the remainder.
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
      const deg = Math.max(0, Math.min(TEMP_RES_DEG_CAP, raw));
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
    // Every formula variable (attributes scaled by active conditions, body traits, capacities) with its
    // CURRENT value — the same set evaluateFormula feeds the compiled formula.
    const all: Record<string, number> = {
      STR: (s?.strength ?? 10) * sm.strength,
      DEX: (s?.dexterity ?? 10) * sm.dexterity,
      CON: (s?.constitution ?? 10) * sm.constitution,
      PER: (s?.perception ?? 10) * sm.perception,
      INT: (s?.intelligence ?? 10) * sm.intelligence,
      CHA: s?.charisma ?? 10,
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
    // §G: a light multiplier dims the `sight` capacity, which every `*_speed`/`_yield`/`_quality`
    // formula multiplies by → work (and its quality) slows in the dark through the existing model.
    const capacities = this.computeCapacities(pawn, lightMultiplier);
    // A held tool ADDS its toolBoost to the speed/yield modifier (items.jsonc `toolBoost`). Tools are
    // authored per CATEGORY (a hammer boosts construction), so a subjob resolves them under its parent.
    const toolBoost = heldToolBoost(pawn, fallbackType ?? workType);
    // Subjobs (Work-tab expand): resolve `${workType}_${axis}` first, then the parent category
    // (`fallbackType`) — so a subjob inherits any axis it doesn't define (Build = construction, etc).
    const formulaFor = (axis: string): string | undefined =>
      (
        STAT_MAP[`${workType}_${axis}`] ??
        (fallbackType ? STAT_MAP[`${fallbackType}_${axis}`] : undefined)
      )?.formula;
    // WORK-EXPERIENCE: the SKILL token — the pawn's experience level in the job's category (a subjob
    // reads its parent's level) × the innate speed↔finesse style split. Entities with no seeded
    // skills (mobs, minimal fixtures) act at the neutral level (levelBase ≈ 1.0). Core stats only
    // nudge the formulas' small supplements now; the level is the base driver.
    const level =
      pawn.skills?.[workType] ??
      (fallbackType ? pawn.skills?.[fallbackType] : undefined) ??
      NEUTRAL_WORK_LEVEL;
    const skillBase = levelBase(level);
    const workStyle = (pawn as Pawn).workStyle;
    const speedSkill = skillBase * styleSpeedWeight(workStyle);
    const finesseSkill = skillBase * styleFinesseWeight(workStyle);
    // Base = SKILL × stat-supplement formula × body capacities. Layer explicit trait multipliers on
    // top. Transient state (conditions/transient conditions) applies to throughput → speed only.
    const stateMult = pawnStateWorkMultiplier(pawn);
    const speed = Math.max(
      0.1,
      (evaluateFormula(formulaFor('speed'), pawn, capacities, speedSkill) +
        (toolBoost?.speed ?? 0)) *
        traitWorkMult(pawn, 'workSpeed', workType, fallbackType) *
        stateMult
    );
    // yield / quality are present only for jobs that define them (in the subjob OR its parent).
    const axis = (kind: 'yield' | 'quality', traitKey: 'workYield' | 'workQuality') => {
      const formula = formulaFor(kind);
      if (!formula) return null;
      // Tools add to yield (not quality — a sharp axe fells faster + recovers more, not "better wood").
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
