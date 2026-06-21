// conditionInfo.ts — derives the display model for a pawn's active conditions: the chip icon/colour
// plus, for the hover panel, a plain-language list of what the pawn "got it from" (driving need,
// exposure, or the specific wounds) and a summary of the modifiers it applies. Pure read-only
// derivation over the pawn + conditions.jsonc; consumed by ConditionChips.svelte.

import type {
  Pawn,
  Mob,
  ConditionDef,
  TransientConditionDef,
  ConditionModifiers,
  Injury
} from '$lib/game/core/types';
import conditionsData from '$lib/game/database/conditions.jsonc';

type CharSpan = { sheet?: string; id?: number; from?: number; to?: number; literal?: string };

const ALL = conditionsData as unknown as Array<ConditionDef | TransientConditionDef>;
const PERSISTENT = ALL.filter((d): d is ConditionDef => d.transient !== true);
const TRANSIENT = ALL.filter((d): d is TransientConditionDef => d.transient === true);

export interface ConditionView {
  id: string;
  name: string;
  /** Chip tint — active stage colour (persistent) or the def colour (transient). */
  color: string;
  charSpans?: CharSpan[];
  description: string;
  kind: 'persistent' | 'transient';
  /** Persistent only: current severity 0–100 and its stage label. */
  severityPct?: number;
  stageLabel?: string;
  lifeThreatening?: boolean;
  /** "Where the pawn got it from" — driving need/exposure or the contributing wounds. */
  sources: string[];
  /** Readable summary of the modifiers this condition applies (e.g. "STR −30%  ·  Work −25%"). */
  effects: string[];
  /** Raw active modifiers (active stage for persistent, def for transient) — multipliers keyed by
   *  base stat (strength/…) plus workEfficiency / moveSpeed / hungerRate / fatigueRate / dodge /
   *  hitChance. For numeric consumers (e.g. the work-tab speed breakdown). */
  modifiers: ConditionModifiers;
}

// Base-stat penalties first (the headline "stat loss"), then the throughput/combat multipliers.
const MOD_LABEL: Partial<Record<keyof ConditionModifiers, string>> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  perception: 'PER',
  intelligence: 'INT',
  workEfficiency: 'Work',
  moveSpeed: 'Move',
  dodge: 'Dodge',
  hitChance: 'Aim',
  hungerRate: 'Hunger rate',
  fatigueRate: 'Fatigue rate',
  thirstRate: 'Thirst rate',
  pain: 'Pain',
  consciousness: 'Consciousness'
};

function effectLines(mods: ConditionModifiers): string[] {
  const out: string[] = [];
  for (const [key, label] of Object.entries(MOD_LABEL)) {
    const v = mods[key as keyof ConditionModifiers];
    if (v == null || v === 1) continue;
    const d = Math.round((v - 1) * 100);
    out.push(`${label} ${d > 0 ? '+' : '−'}${Math.abs(d)}%`);
  }
  return out;
}

const r = (v: number | undefined) => Math.round(v ?? 0);

/** "leftForearm" → "Left forearm". */
function prettyPart(id: string): string {
  const spaced = id
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function allInjuries(entity: Pawn | Mob): Injury[] {
  const out: Injury[] = [];
  for (const limb of entity.limbs ?? [])
    for (const part of limb.parts ?? []) out.push(...part.injuries);
  return out;
}

function persistentSources(entity: Pawn | Mob, def: ConditionDef): string[] {
  const needs = entity.needs as unknown as Record<string, number | undefined> | undefined;
  const d = def.driver;
  if (d?.need) {
    const val = r(needs?.[d.need]);
    const label = d.need.charAt(0).toUpperCase() + d.need.slice(1);
    return [`${label} ${val}/100 — worsens ≥ ${d.onset}, recovers < ${d.safe}`];
  }
  if (d?.source) {
    const field = d.source === 'cold' ? 'coldExposure' : 'heatExposure';
    const val = r(needs?.[field]);
    const label = d.source === 'cold' ? 'Cold exposure' : 'Heat exposure';
    return [`${label} ${val}/100 — worsens ≥ ${d.onset}, recovers < ${d.safe}`];
  }
  // No driver → sourced from wounds. Name the specific contributing injuries.
  switch (def.id) {
    case 'blood_loss': {
      const bleeders = allInjuries(entity).filter((i) => (i.bleeding ?? 0) > 0);
      return bleeders.length
        ? bleeders.map(
            (i) =>
              `${prettyPart(i.bodyPart)} — ${i.type} (bleeding ${Math.round(i.bleeding * 10) / 10})`
          )
        : ['Recent heavy bleeding'];
    }
    case 'infection': {
      const inf = allInjuries(entity).filter((i) => i.infected);
      return inf.length
        ? inf.map((i) => `${prettyPart(i.bodyPart)} — ${i.type} (infected)`)
        : ['An untended wound has festered'];
    }
    case 'shock':
      return [`Pain ${Math.round(entity.pain ?? 0)}/100`];
    case 'windchilled':
      return ['Out in the wind — sheltered by a roof or the lee of a wall/mountain'];
    case 'intoxicated':
      return ['Drink — wears off over time'];
    default:
      return [];
  }
}

function transientSources(entity: Pawn | Mob, id: string): string[] {
  const n = entity.needs;
  switch (id) {
    case 'tired':
      return [`Fatigue ${r(n?.fatigue)}/100`];
    case 'filthy':
      return [`Hygiene ${r(n?.hygiene)}/100`];
    case 'wet':
      return [`Wetness ${r(n?.wetness)}/100`];
    case 'sheltered':
      return ['Standing under a roof'];
    case 'eating':
      return ['Currently eating'];
    case 'sleeping':
      return ['Currently sleeping'];
    case 'winded':
      return ['Stamina spent in combat'];
    case 'nausea':
    case 'dysentery':
      return ['Food poisoning — a tainted or undercooked meal'];
    case 'knockdown':
    case 'collapse': {
      const t = entity.conditionTimers?.[id];
      return [t ? `Recovering — ${t} turn${t === 1 ? '' : 's'} left` : 'Recovering'];
    }
    default:
      // Mood conditions are pawn-only (mobs never sync them).
      if (id.startsWith('mood_'))
        return [`Mood ${Math.round((entity as Pawn).state?.mood ?? 50)}/100`];
      return [];
  }
}

/**
 * Build the display model for every active condition on a pawn — persistent (severity-bearing) first,
 * then transient — for the conditions chip row + hover panel.
 */
export function getActiveConditionViews(entity: Pawn | Mob): ConditionView[] {
  const views: ConditionView[] = [];

  for (const c of entity.conditions ?? []) {
    if (c.severity <= 0) continue;
    const def = PERSISTENT.find((d) => d.id === c.id);
    if (!def) continue;
    let stage = def.stages[0];
    for (const s of def.stages) if (c.severity >= s.minSeverity) stage = s;
    views.push({
      id: def.id,
      name: def.name,
      color: stage?.color ?? '#c8c8c8',
      charSpans: def.charSpans,
      description: def.description,
      kind: 'persistent',
      severityPct: Math.round(c.severity * 100),
      stageLabel: stage?.label,
      lifeThreatening: stage?.lifeThreatening,
      sources: persistentSources(entity, def),
      effects: effectLines(stage?.modifiers ?? {}),
      modifiers: stage?.modifiers ?? {}
    });
  }

  for (const id of entity.transientConditions ?? []) {
    const def = TRANSIENT.find((d) => d.id === id);
    if (!def || def.hidden) continue;
    views.push({
      id: def.id,
      name: def.name,
      color: def.color,
      charSpans: def.charSpans,
      description: def.description,
      kind: 'transient',
      sources: transientSources(entity, id),
      effects: effectLines(def.modifiers),
      modifiers: def.modifiers
    });
  }

  return views;
}
