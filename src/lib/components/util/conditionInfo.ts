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
import { gameHoursFromTicks } from '$lib/game/services/EnvironmentService';
import { pawnStatService } from '$lib/game/services/PawnStatService';

/** A remaining tick duration shown as coarse IN-GAME time — the unit the clock and HealthReadout use —
 *  days, hours, or in-game minutes under an hour. Never "turns"/ticks. */
function gameTimeLeft(ticks: number): string {
  const hours = gameHoursFromTicks(ticks);
  const round1 = (n: number) => (n < 10 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.round(n)));
  if (hours >= 24) {
    const days = hours / 24;
    return `${round1(days)} day${days === 1 ? '' : 's'}`;
  }
  if (hours >= 1) return `${round1(hours)} hr`;
  const mins = Math.round(hours * 60);
  return mins >= 1 ? `${mins} min` : '<1 min';
}

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
    case 'bleeding': {
      const bleeders = allInjuries(entity).filter((i) => (i.bleeding ?? 0) > 0);
      return bleeders.length
        ? bleeders.map(
            (i) => `${prettyPart(i.bodyPart)} — ${i.type} (bleeding ${Math.round(i.bleeding * 10) / 10})`
          )
        : ['Open wounds seeping blood'];
    }
    case 'nausea':
    case 'dysentery': {
      // Real countdown: these are fixed-duration timers (NAUSEA_TICKS / DYSENTERY_TICKS) that tick down.
      const t = entity.conditionTimers?.[id] ?? 0;
      return [
        `Food poisoning — a tainted or undercooked meal${t > 0 ? ` — passes in ~${gameTimeLeft(t)}` : ''}`
      ];
    }
    case 'knockdown': {
      // Real countdown: the knockdown timer is the actual remaining prone time, shown in in-game hours.
      const t = entity.conditionTimers?.knockdown ?? 0;
      return [t > 0 ? `Recovering — ${gameTimeLeft(t)} left` : 'Recovering'];
    }
    case 'collapse': {
      // Out cold from low consciousness — name the DRIVER (pain vs blood loss) with its live value, and
      // a wake ETA when recovery is BLOOD-driven (a clean, predictable regen rate). When it's wound/pain-
      // bound or still bleeding there's no honest number (wounds mend glacially, at a treatment-dependent
      // pace), so just the moving driver value is shown — it ticks toward the wake point as the body mends.
      const e = entity as {
        pain?: number;
        bloodVolume?: number;
        maxBloodVolume?: number;
        limbs?: { bleedRate?: number }[];
      };
      const pain = Math.round(e.pain ?? 0);
      const maxBlood = e.maxBloodVolume ?? 100;
      const bloodLossPct = Math.round(Math.max(0, 1 - (e.bloodVolume ?? maxBlood) / maxBlood) * 100);
      const bleeding = (e.limbs ?? []).reduce((s, l) => s + (l?.bleedRate ?? 0), 0) > 0;
      // Mirror the consciousness suppressors (PawnStatService): the LOWER multiplier is the bigger cause.
      const painMult = 1 - Math.max(0, pain / 100 - 0.1);
      const bloodMult = 1 - Math.min(1, Math.max(0, (bloodLossPct / 100 - 0.2) / 0.35));
      let cause: string;
      if (bleeding) cause = `bleeding out (${bloodLossPct}% lost)`;
      else if (bloodMult < painMult && bloodMult < 0.99) cause = `blood loss (${bloodLossPct}% lost)`;
      else if (painMult < 0.99) cause = `pain (${pain}/100)`;
      else if (bloodMult < 0.99) cause = `blood loss (${bloodLossPct}% lost)`;
      else cause = '';
      const ticks = pawnStatService.estimateBloodRecoveryTicks(entity);
      const eta = ticks && ticks > 0 ? `, wakes in ~${gameTimeLeft(ticks)}` : '';
      return [cause ? `Out cold — ${cause}${eta}` : `Recovering${eta}`];
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

  for (const entry of entity.transientConditions ?? []) {
    // A staged transient (e.g. `bleeding:severe`) arrives as an `id:stageLabel` combo; a plain transient
    // as a bare id. Persistent stage combos (e.g. `malnutrition:moderate`) also land here but resolve to
    // no TRANSIENT def (they render from entity.conditions), so they fall through untouched.
    const sep = entry.indexOf(':');
    const baseId = sep >= 0 ? entry.slice(0, sep) : entry;
    const stageLabel = sep >= 0 ? entry.slice(sep + 1) : undefined;
    const def = TRANSIENT.find((d) => d.id === baseId);
    if (!def || def.hidden) continue;
    const stage = stageLabel ? def.stages?.find((s) => s.label === stageLabel) : undefined;
    if (stageLabel && !stage) continue; // combo whose base isn't a staged transient — skip
    const mods = stage?.modifiers ?? def.modifiers;
    views.push({
      id: def.id,
      name: def.name,
      color: stage?.color ?? def.color,
      charSpans: def.charSpans,
      description: def.description,
      kind: 'transient',
      stageLabel: stage?.label,
      lifeThreatening: stage?.lifeThreatening,
      sources: transientSources(entity, baseId),
      effects: effectLines(mods),
      modifiers: mods
    });
  }

  return views;
}
