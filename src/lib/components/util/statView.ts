import type { Pawn } from '$lib/game/core/types';
import { CORE_STAT_KEYS } from '$lib/game/core/types';
import { APTITUDE_MIN, APTITUDE_MAX, type AptitudeId } from '$lib/game/core/rules/body/aptitudes';
import statsData from '$lib/game/database/pawns/stats.jsonc';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { itemService } from '$lib/game/services/ItemService';
import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
import {
  conditionNeedMultipliers,
  conditionStatMultipliers
} from '$lib/game/core/rules/body/conditions';
import { powerStatOf, powerToken } from '$lib/game/core/rules/body/powerScale';
import { aptitudeOf } from '$lib/game/core/rules/body/aptitudes';

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

const LOWER_BETTER = new Set(['hunger_rate', 'fatigue_rate', 'pain']);
const COOL = ['#9ccc65', '#43a047', '#2196f3'];
const WARM = ['#e0a64a', '#e07a4f', '#e04f4f'];
const NEUTRAL = 'var(--text-dim)';
const band = (m: number): number => (m >= 2.0 ? 2 : m >= 1.5 ? 1 : m >= 1.15 ? 0 : -1);

const round2 = (n: number) => Math.round(n * 100) / 100;
const signed = (n: number) => (n >= 0 ? '+' : '−') + round2(Math.abs(n));

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
  heal_rate: 'healRate',
  night_vision: 'nightVision'
};

const BASELINE = {
  id: '__statbaseline__',
  stats: Object.fromEntries(CORE_STAT_KEYS.map((k) => [k, 10])),
  physicalTraits: { weight: 70, height: 170, size: 'medium' }
} as unknown as Pawn;
const baseCaps = pawnStatService.computeCapacities(BASELINE);
const baseCarry = itemService.getCarryCapacityBreakdown(BASELINE);

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
function derivation(s: StatDef, pawn: Pawn, ctx: StatContext): Deriv {
  if (s.id === 'night_vision') {
    return {
      formula: 'Σ cultural night-vision grants (capped at 1.0)',
      vars: [],
      description: s.description
    };
  }
  if (s.id === 'carry_weight') {
    return {
      formula:
        'bodyWeight × loadFraction + gear  (loadFraction = capacity ÷ bodyWeight, capacity = (11 + STR × 0.19) × frame)',
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
      formula: s.description,
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
  for (const id of CORE_STAT_KEYS) {
    add(id.toUpperCase(), id === 'charisma' ? st.charisma : eff(st[id], sm[id]));
  }
  add('weight', pawn.physicalTraits?.weight ?? 70);
  add('height', pawn.physicalTraits?.height ?? 170);
  if (/\bSKILL\b/.test(s.formula)) {
    const info = pawnStatService.workSkillInfo(s.id, pawn);
    if (info) vars.push({ name: 'SKILL', value: `${round2(info.factor)} (Lv ${info.level})` });
  }
  if (/\bPOWER\b/.test(s.formula)) {
    const mh = pawn.equipment?.mainHand;
    const wp = mh ? itemService.getItemById(mh.itemId)?.weaponProperties : undefined;
    const key = powerStatOf(wp);
    const raw = (st as unknown as Record<string, number>)[key] ?? 10;
    const mult = key === 'charisma' ? 1 : ((sm as unknown as Record<string, number>)[key] ?? 1);
    vars.push({
      name: 'POWER',
      value: `${round2(powerToken(raw * mult))} (${key} ${eff(raw, mult)}, damped)`
    });
  }
  if (/\bAPT\b/.test(s.formula)) {
    vars.push({ name: 'APT', value: `${round2(aptitudeOf(pawn, s.id))} (rolled)` });
  }
  for (const [cap, cv] of Object.entries(ctx.capacities)) add(cap, Math.round(cv * 100) / 100);
  const cm = conditionMult(s.id, ctx);
  if (cm !== 1) vars.push({ name: 'conditions', value: '×' + round2(cm) });
  return { formula: s.formula, vars, description: s.description };
}

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
  const good = LOWER_BETTER.has(id) ? 1 / mult : mult;
  const up = band(good);
  if (up >= 0) return { glyph: '▲', color: COOL[up] };
  const down = band(1 / good);
  if (down >= 0) return { glyph: '▼', color: WARM[down] };
  return { glyph: '–', color: NEUTRAL };
}

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

export function computeAptitudeView(
  id: AptitudeId,
  pawn: Pawn,
  label: string,
  description: string,
  massTilted: boolean
): StatView {
  const v = pawn.aptitudes?.[id] ?? 1;
  const pct = Math.round((v - 1) * 100);
  const mult = v;
  const up = band(mult);
  const down = band(1 / mult);
  const tr =
    up >= 0
      ? { glyph: '▲', color: COOL[up] }
      : down >= 0
        ? { glyph: '▼', color: WARM[down] }
        : {
            glyph: pct > 0 ? '▲' : pct < 0 ? '▼' : '–',
            color: pct === 0 ? NEUTRAL : pct > 0 ? COOL[0] : WARM[0]
          };
  const vars = [
    { name: 'rolled', value: v.toFixed(3) },
    { name: 'band', value: `${APTITUDE_MIN.toFixed(2)}–${APTITUDE_MAX.toFixed(2)}` }
  ];
  if (massTilted)
    vars.push({ name: 'body mass', value: `${(pawn.physicalTraits?.weight ?? 70).toFixed(0)} kg` });
  return {
    id,
    name: label,
    unit: '×',
    value: round2(v),
    base: 1,
    formula: massTilted ? 'triangular roll, tilted by body mass' : 'triangular roll at generation',
    vars,
    description,
    trend: tr,
    traitMods: []
  };
}

export function isDerivedStat(statId: string): boolean {
  return STAT_BY_ID.has(statId);
}

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
