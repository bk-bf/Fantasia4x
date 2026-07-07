// statView.ts — the single source of a pawn stat's "view": its value, the formula with THIS pawn's
// numbers substituted, the baseline trend, the description, and the trait contributions. Extracted out of
// PawnAttributes (where it was baked in) so BOTH the attributes tab AND the trait card's stat/resistance
// pill render the IDENTICAL breakdown through the shared <StatTooltip> — one computation, no duplication.
import type { Pawn } from '$lib/game/core/types';
import statsData from '$lib/game/database/stats.jsonc';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { itemService } from '$lib/game/services/ItemService';
import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
import { conditionNeedMultipliers, conditionStatMultipliers } from '$lib/game/core/needs';

export type StatDef = {
  id: string;
  category: string;
  primaryStat: string;
  formula: string;
  description: string;
};
const STATS = statsData as unknown as StatDef[];
const STAT_BY_ID = new Map(STATS.map((s) => [s.id, s]));
const WORK_SPEED_IDS = new Set(
  STATS.filter((s) => s.category === 'work' && s.id.endsWith('_speed')).map((s) => s.id)
);

// Stats where a LOWER number is the better outcome — trend colouring inverts for these.
const LOWER_BETTER = new Set(['hunger_rate', 'fatigue_rate', 'pain']);
const COOL = ['#9ccc65', '#43a047', '#2196f3']; // light green → green → blue (better)
const WARM = ['#e0a64a', '#e07a4f', '#e04f4f']; // amber → orange → red (worse)
const NEUTRAL = 'var(--text-dim)';
const band = (m: number): number => (m >= 2.0 ? 2 : m >= 1.5 ? 1 : m >= 1.15 ? 0 : -1);

const round2 = (n: number) => Math.round(n * 100) / 100;
const signed = (n: number) => (n >= 0 ? '+' : '−') + round2(Math.abs(n));

// A DERIVED stat id → the trait `effects` key that live-adds to it (resistances / heal_rate).
const RES_KEY: Record<string, string> = {
  cutting_resistance: 'cutting_resistance',
  piercing_resistance: 'piercing_resistance',
  blunt_resistance: 'blunt_resistance',
  cold_resistance: 'coldResistance',
  fire_resistance: 'fireResistance',
  poison_resistance: 'poisonResistance',
  disease_resistance: 'diseaseResistance',
  mental_resistance: 'mentalResistance',
  lightning_resistance: 'lightningResistance',
  shadow_resistance: 'shadowResistance',
  wetness_resistance: 'wetnessResistance',
  heal_rate: 'healRate'
};

// Neutral reference pawn — all stats 10, average body, uninjured. Every stat is coloured by how far THIS
// pawn sits above/below it. Constant → computed once at module load.
const BASELINE = {
  id: '__statbaseline__',
  stats: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    perception: 10,
    intelligence: 10,
    charisma: 10
  },
  physicalTraits: { weight: 70, height: 170, size: 'medium' }
} as unknown as Pawn;
const baseCaps = pawnStatService.computeCapacities(BASELINE);
const baseCarry = itemService.getCarryCapacityBreakdown(BASELINE);

/** Per-pawn derived state the views read — computed ONCE per pawn, then shared across every stat's view
 *  (so a 40-row grid doesn't recompute capacities/carry/conditions 40 times). */
export interface StatContext {
  capacities: Record<string, number>;
  carry: ReturnType<typeof itemService.getCarryCapacityBreakdown>;
  condWorkMult: number;
  condMoveMult: number;
  condNeed: ReturnType<typeof conditionNeedMultipliers>;
  condStatMult: ReturnType<typeof conditionStatMultipliers>;
}

export function buildStatContext(pawn: Pawn): StatContext {
  const condViews = getActiveConditionViews(pawn);
  return {
    capacities: pawnStatService.computeCapacities(pawn),
    carry: itemService.getCarryCapacityBreakdown(pawn),
    condWorkMult: condViews.reduce((m, v) => m * (v.modifiers.workEfficiency ?? 1), 1),
    condMoveMult: condViews.reduce((m, v) => m * (v.modifiers.moveSpeed ?? 1), 1),
    condNeed: conditionNeedMultipliers(pawn.conditions ?? []),
    condStatMult: conditionStatMultipliers(pawn)
  };
}

function conditionMult(id: string, ctx: StatContext): number {
  if (WORK_SPEED_IDS.has(id)) return ctx.condWorkMult;
  if (id === 'movement_speed') return ctx.condMoveMult;
  if (id === 'hunger_rate') return ctx.condNeed.hungerRate;
  if (id === 'fatigue_rate') return ctx.condNeed.fatigueRate;
  return 1;
}

function actualRaw(id: string, pawn: Pawn, ctx: StatContext): number {
  if (id === 'carry_weight') return ctx.carry.weight.total;
  if (id === 'carry_volume') return ctx.carry.volume.total;
  if (id in ctx.capacities) return ctx.capacities[id];
  return pawnStatService.evaluateStat(id, pawn) * conditionMult(id, ctx);
}
function baseRaw(id: string): number {
  if (id === 'carry_weight') return baseCarry.weight.total;
  if (id === 'carry_volume') return baseCarry.volume.total;
  if (id in baseCaps) return baseCaps[id];
  return pawnStatService.evaluateStat(id, BASELINE);
}

// Body capacities display as a fraction of healthy (1.00 = full); pain stays raw; everything else raw.
function val(id: string, pawn: Pawn, ctx: StatContext): number {
  const raw = actualRaw(id, pawn, ctx);
  if (id in ctx.capacities && id !== 'pain') {
    const b = baseCaps[id];
    return round2(b ? raw / b : raw);
  }
  return round2(raw);
}
function baseDisplay(id: string, ctx: StatContext): number {
  if (id in ctx.capacities && id !== 'pain') return 1;
  return round2(baseRaw(id));
}
function unit(id: string): string {
  if (id === 'carry_weight') return ' kg';
  if (id === 'carry_volume') return ' L';
  return '';
}

type Deriv = { formula: string; vars: { name: string; value: string }[]; description: string };
/** Symbolic formula + ONLY the variables it uses, filled with this pawn's numbers. Capacities have no
 *  real formula, so surface their organ breakdown (the description) + an injury note instead. */
function derivation(s: StatDef, pawn: Pawn, ctx: StatContext): Deriv {
  if (s.id === 'carry_weight') {
    return {
      formula: 'bodyWeight × loadFraction + gear  (loadFraction = STR × 1.2%)',
      vars: [
        { name: 'bodyWeight', value: `${ctx.carry.bodyWeight}kg` },
        {
          name: 'loadFraction',
          value: `${Math.round(ctx.carry.weight.loadFraction * 100)}% (STR ${ctx.carry.strength})`
        },
        { name: 'gear', value: signed(ctx.carry.weight.gear) }
      ],
      description: s.description
    };
  }
  if (s.id === 'carry_volume') {
    return {
      formula: 'bodyWeight × 13% + gear',
      vars: [
        { name: 'bodyWeight', value: `${ctx.carry.bodyWeight}kg` },
        { name: 'gear', value: signed(ctx.carry.volume.gear) }
      ],
      description: s.description
    };
  }
  if (s.id in ctx.capacities) {
    return {
      formula: s.description, // the organ breakdown, e.g. "brain × 0.5 + heart × 0.15 + …"
      vars: [],
      description:
        s.id === 'pain'
          ? '0 when unhurt — injuries, limb damage and bleeding raise it, sapping consciousness.'
          : '1.00 when healthy — injury or organ loss lowers it.'
    };
  }
  const vars: { name: string; value: string }[] = [];
  const add = (name: string, value: number | string) => {
    if (new RegExp(`\\b${name}\\b`).test(s.formula)) vars.push({ name, value: String(value) });
  };
  const st = pawn.stats;
  const sm = ctx.condStatMult;
  const eff = (base: number, mult: number) => (mult === 1 ? base : Math.round(base * mult));
  add('STR', eff(st.strength, sm.strength));
  add('DEX', eff(st.dexterity, sm.dexterity));
  add('CON', eff(st.constitution, sm.constitution));
  add('PER', eff(st.perception, sm.perception));
  add('INT', eff(st.intelligence, sm.intelligence));
  add('CHA', st.charisma);
  add('weight', pawn.physicalTraits?.weight ?? 70);
  add('height', pawn.physicalTraits?.height ?? 170);
  for (const [cap, cv] of Object.entries(ctx.capacities)) add(cap, Math.round(cv * 100) / 100);
  const cm = conditionMult(s.id, ctx);
  if (cm !== 1) vars.push({ name: 'conditions', value: '×' + round2(cm) });
  return { formula: s.formula, vars, description: s.description };
}

/** Trait contributions to a DERIVED stat (resistances/heal_rate live-added by evaluateStat; work
 *  speed/yield/quality by getWorkModifiers) — surfaced as a true +/- percentage. */
function traitMods(statId: string, pawn: Pawn): { name: string; text: string; pos: boolean }[] {
  const out: { name: string; text: string; pos: boolean }[] = [];
  for (const t of pawn.traits ?? []) {
    const e = (t.effects ?? {}) as Record<string, unknown>;
    const rk = RES_KEY[statId];
    if (rk && typeof e[rk] === 'number' && e[rk] !== 0) {
      const v = e[rk] as number;
      out.push({ name: t.name, text: `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`, pos: v > 0 });
    }
    const cm = (e.combatMods as Record<string, number> | undefined)?.[statId];
    if (typeof cm === 'number' && cm !== 1) {
      const p = Math.round((cm - 1) * 100);
      out.push({ name: t.name, text: `${p >= 0 ? '+' : ''}${p}%`, pos: p >= 0 });
    }
    if (statId.endsWith('_speed') || statId.endsWith('_yield') || statId.endsWith('_quality')) {
      const axis = statId.endsWith('_speed')
        ? 'workSpeed'
        : statId.endsWith('_yield')
          ? 'workYield'
          : 'workQuality';
      const cat = statId.replace(/_(speed|yield|quality)$/, '');
      const map = e[axis] as Record<string, number> | undefined;
      const mul = map?.[cat] ?? map?.['all'];
      if (typeof mul === 'number' && mul !== 1) {
        const p = Math.round((mul - 1) * 100);
        out.push({ name: t.name, text: `${p >= 0 ? '+' : ''}${p}%`, pos: p >= 0 });
      }
    }
  }
  return out;
}

function trend(id: string, pawn: Pawn, ctx: StatContext): { glyph: string; color: string } {
  const a = actualRaw(id, pawn, ctx);
  const b = baseRaw(id);
  if (!isFinite(a) || !isFinite(b)) return { glyph: '–', color: NEUTRAL };
  let mult: number;
  if (Math.abs(b) < 0.02) {
    if (Math.abs(a) < 1e-4) return { glyph: '–', color: NEUTRAL };
    const ref = id === 'pain' ? 25 : 0.25;
    mult = Math.max(0.01, 1 + a / ref);
  } else {
    mult = a / b;
  }
  const good = LOWER_BETTER.has(id) ? 1 / mult : mult; // >1 = better than average
  const up = band(good);
  if (up >= 0) return { glyph: '▲', color: COOL[up] };
  const down = band(1 / good);
  if (down >= 0) return { glyph: '▼', color: WARM[down] };
  return { glyph: '–', color: NEUTRAL };
}

/** The fully-rendered view of a stat for THIS pawn — everything <StatTooltip> needs, nothing UI-specific. */
export interface StatView {
  id: string;
  name: string;
  unit: string;
  value: number;
  base: number;
  formula: string;
  vars: { name: string; value: string }[];
  description: string;
  trend: { glyph: string; color: string };
  traitMods: { name: string; text: string; pos: boolean }[];
}

/** Is `statId` a real stats.jsonc stat (has a rich view), vs a core attribute (STR/DEX) that isn't? */
export function isDerivedStat(statId: string): boolean {
  return STAT_BY_ID.has(statId);
}

/** Compute a stat's full view for `pawn`. Returns null for a non-stats.jsonc id (e.g. a core attribute). */
export function computeStatView(statId: string, pawn: Pawn, ctx: StatContext): StatView | null {
  const s = STAT_BY_ID.get(statId);
  if (!s) return null;
  const d = derivation(s, pawn, ctx);
  return {
    id: statId,
    name: statId.replace(/_/g, ' '),
    unit: unit(statId),
    value: val(statId, pawn, ctx),
    base: baseDisplay(statId, ctx),
    formula: d.formula,
    vars: d.vars,
    description: d.description,
    trend: trend(statId, pawn, ctx),
    traitMods: traitMods(statId, pawn)
  };
}
