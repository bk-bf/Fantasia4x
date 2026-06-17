// conditionInfo.ts — derives the display model for a pawn's active conditions: the chip icon/colour
// plus, for the hover panel, a plain-language list of what the pawn "got it from" (driving need,
// exposure, or the specific wounds) and a summary of the modifiers it applies. Pure read-only
// derivation over the pawn + conditions.jsonc; consumed by ConditionChips.svelte.

import type { Pawn, ConditionDef, TransientConditionDef, Injury } from '$lib/game/core/types';
import conditionsData from '$lib/game/database/conditions.jsonc';

type CharSpan = { sheet?: string; id?: number; from?: number; to?: number; literal?: string };

const ALL = conditionsData as unknown as Array<ConditionDef | TransientConditionDef>;
const PERSISTENT = ALL.filter((d): d is ConditionDef => d.duration === 'persistent');
const TRANSIENT = ALL.filter((d): d is TransientConditionDef => d.duration === 'transient');

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
  /** Readable summary of the modifiers this condition applies (e.g. "Work −25%"). */
  effects: string[];
}

const MOD_LABEL: Record<string, string> = {
  workEfficiency: 'Work',
  moveSpeed: 'Move',
  hungerRate: 'Hunger rate',
  fatigueRate: 'Fatigue rate',
  dodge: 'Dodge'
};

function effectLines(mods: Record<string, number | undefined>): string[] {
  const out: string[] = [];
  for (const [key, label] of Object.entries(MOD_LABEL)) {
    const v = mods[key];
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

function allInjuries(pawn: Pawn): Injury[] {
  const out: Injury[] = [];
  for (const limb of pawn.limbs ?? [])
    for (const part of limb.parts ?? []) out.push(...part.injuries);
  return out;
}

function persistentSources(pawn: Pawn, def: ConditionDef): string[] {
  const needs = pawn.needs as unknown as Record<string, number | undefined> | undefined;
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
      const bleeders = allInjuries(pawn).filter((i) => (i.bleeding ?? 0) > 0);
      return bleeders.length
        ? bleeders.map(
            (i) =>
              `${prettyPart(i.bodyPart)} — ${i.type} (bleeding ${Math.round(i.bleeding * 10) / 10})`
          )
        : ['Recent heavy bleeding'];
    }
    case 'infection': {
      const inf = allInjuries(pawn).filter((i) => i.infected);
      return inf.length
        ? inf.map((i) => `${prettyPart(i.bodyPart)} — ${i.type} (infected)`)
        : ['An untended wound has festered'];
    }
    case 'fracture': {
      const fx = allInjuries(pawn).filter((i) => i.type === 'fracture');
      return fx.length ? fx.map((i) => `${prettyPart(i.bodyPart)} — fractured`) : ['A broken bone'];
    }
    case 'shock': {
      const lines = ['Severe pain or blood loss'];
      if (pawn.pain != null) lines.push(`Pain ${Math.round(pawn.pain)}`);
      return lines;
    }
    default:
      return [];
  }
}

function transientSources(pawn: Pawn, id: string): string[] {
  const n = pawn.needs ?? ({} as Pawn['needs']);
  switch (id) {
    case 'hungry':
      return [`Hunger ${r(n?.hunger)}/100`];
    case 'tired':
      return [`Fatigue ${r(n?.fatigue)}/100`];
    case 'thirsty':
      return [`Thirst ${r(n?.thirst)}/100`];
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
    case 'knockdown':
    case 'collapse': {
      const t = pawn.conditionTimers?.[id];
      return [t ? `Recovering — ${t} turn${t === 1 ? '' : 's'} left` : 'Recovering'];
    }
    default:
      if (id.startsWith('mood_')) return [`Mood ${Math.round(pawn.state?.mood ?? 50)}/100`];
      return [];
  }
}

/**
 * Build the display model for every active condition on a pawn — persistent (severity-bearing) first,
 * then transient — for the conditions chip row + hover panel.
 */
export function getActiveConditionViews(pawn: Pawn): ConditionView[] {
  const views: ConditionView[] = [];

  for (const c of pawn.conditions ?? []) {
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
      sources: persistentSources(pawn, def),
      effects: effectLines(stage?.modifiers ?? {})
    });
  }

  for (const id of pawn.transientConditions ?? []) {
    const def = TRANSIENT.find((d) => d.id === id);
    if (!def || def.hidden) continue;
    views.push({
      id: def.id,
      name: def.name,
      color: def.color,
      charSpans: def.charSpans,
      description: def.description,
      kind: 'transient',
      sources: transientSources(pawn, id),
      effects: effectLines(def.modifiers)
    });
  }

  return views;
}
