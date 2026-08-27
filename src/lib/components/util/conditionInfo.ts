import type {
  Pawn,
  Mob,
  Trait,
  ConditionDef,
  TransientConditionDef,
  ConditionModifiers,
  Injury
} from '$lib/game/core/types';
import { CORE_STAT_ABBR } from '$lib/game/core/types';
import conditionsData from '$lib/game/database/pawns/conditions.jsonc';
import { gameHoursFromTicks } from '$lib/game/services/EnvironmentService';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { getNightVision } from '$lib/game/core/rules/body/vision';
import { workAxisLabel } from '$lib/components/util/pawnUtils';

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
  color: string;
  charSpans?: CharSpan[];
  description: string;
  kind: 'persistent' | 'transient';
  severityPct?: number;
  stageLabel?: string;
  lifeThreatening?: boolean;
  sources: string[];
  effects: string[];
  modifiers: ConditionModifiers;
  trigger?: string;
}

const MOD_LABEL: Partial<Record<keyof ConditionModifiers, string>> = {
  strength: CORE_STAT_ABBR.strength,
  dexterity: CORE_STAT_ABBR.dexterity,
  constitution: CORE_STAT_ABBR.constitution,
  perception: CORE_STAT_ABBR.perception,
  intelligence: CORE_STAT_ABBR.intelligence,
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

const GRANT_STAT_ABBR: Record<string, string> = CORE_STAT_ABBR;
const grantAxis = (name: string): string =>
  name === 'workSpeed'
    ? 'spd'
    : name === 'workYield'
      ? 'yld'
      : name === 'workQuality'
        ? 'qual'
        : workAxisLabel(name);

export function traitGrantLines(trait: Trait): string[] {
  const out: string[] = [];
  const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
  for (const [name, value] of Object.entries(trait.effects ?? {})) {
    if (name.endsWith('Bonus') && typeof value === 'number') {
      const stat = name.replace('Bonus', '');
      out.push(`${GRANT_STAT_ABBR[stat] ?? stat} +${value}`);
    } else if (name.endsWith('Penalty') && typeof value === 'number') {
      const stat = name.replace('Penalty', '');
      out.push(`${GRANT_STAT_ABBR[stat] ?? stat} -${value}`);
    } else if (name === 'combatMods' && value && typeof value === 'object') {
      for (const [statId, mul] of Object.entries(value as Record<string, number>)) {
        const p = Math.round((mul - 1) * 100);
        out.push(cap(`${statId.replace(/_/g, ' ')} ${p >= 0 ? '+' : ''}${p}%`));
      }
    } else if (value && typeof value === 'object') {
      for (const [workType, mul] of Object.entries(value as Record<string, number>)) {
        const p = Math.round((mul - 1) * 100);
        out.push(
          cap(`${workType.replace(/_/g, ' ')} ${p >= 0 ? '+' : ''}${p}% ${grantAxis(name)}`)
        );
      }
    } else if (typeof value === 'number' && value !== 0) {
      const label = name
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/resistance/i, 'res')
        .trim()
        .toLowerCase();
      const p = Math.round(value * 100);
      out.push(cap(`${label} ${p >= 0 ? '+' : ''}${p}%`));
    }
  }
  return out;
}

const PREDICATE_FIELD_LABEL: Record<string, string> = {
  wetness: 'wet',
  coldExposure: 'cold',
  heatExposure: 'heat',
  hygiene: 'filth',
  hunger: 'hunger',
  thirst: 'thirst',
  fatigue: 'fatigue',
  bloodFrac: 'blood',
  pain: 'pain',
  ambientLight: 'light',
  severity: 'severity'
};

function triggerLine(p?: TransientConditionDef['activateWhen']): string | undefined {
  if (!p) return undefined;
  const parts: string[] = [];
  if (p.unsheltered) parts.push('in the open');
  const field = p.need ?? p.meter;
  if (field && (p.atOrAbove != null || p.atOrBelow != null)) {
    const label = PREDICATE_FIELD_LABEL[field] ?? field.replace(/([A-Z])/g, ' $1').toLowerCase();
    const pctScale = p.meter === 'bloodFrac' || p.meter === 'ambientLight';
    const fmt = (n: number) => (pctScale ? `${Math.round(n * 100)}%` : `${n}`);
    if (p.atOrAbove != null) parts.push(`${label} ≥ ${fmt(p.atOrAbove)}`);
    if (p.atOrBelow != null) parts.push(`${label} ≤ ${fmt(p.atOrBelow)}`);
  }
  const condName = (id: string) => ALL.find((d) => d.id === id)?.name ?? id.replace(/_/g, ' ');
  if (p.hasCondition) parts.push(condName(p.hasCondition));
  if (p.lacksCondition) parts.push(`no ${condName(p.lacksCondition)}`);
  return parts.length ? `While ${parts.join(', ')}` : undefined;
}

const r = (v: number | undefined) => Math.round(v ?? 0);

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
  switch (def.id) {
    case 'pain_shock': {
      const pain = Math.round(entity.pain ?? 0);
      return [
        `Reeling from pain (${pain}/100) — the pain half of shock. Painkillers or drink dull it.`
      ];
    }
    case 'hypovolemia': {
      const maxBV = entity.maxBloodVolume ?? 100;
      const lostPct = Math.round((1 - (entity.bloodVolume ?? maxBV) / maxBV) * 100);
      return [
        `Too much blood lost (${lostPct}% gone) — the blood-loss half of shock. Stop the bleeding.`
      ];
    }
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
    case 'darkness': {
      const el = Math.round((entity.effectiveLight ?? 1) * 100);
      const nv = Math.round(getNightVision(entity) * 100);
      return [`Sight × ${el}% in this light${nv > 0 ? ` (night vision +${nv}%)` : ''}`];
    }
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
            (i) =>
              `${prettyPart(i.bodyPart)} — ${i.type} (bleeding ${Math.round(i.bleeding * 10) / 10})` +
              (i.bloodletting ? ' · bloodletting — won’t clot, needs dressing' : '')
          )
        : ['Open wounds seeping blood'];
    }
    case 'nausea':
    case 'dysentery': {
      const t = entity.conditionTimers?.[id] ?? 0;
      return [
        `Food poisoning — a tainted or undercooked meal${t > 0 ? ` — passes in ~${gameTimeLeft(t)}` : ''}`
      ];
    }
    case 'knockdown': {
      const t = entity.conditionTimers?.knockdown ?? 0;
      return [t > 0 ? `Recovering — ${gameTimeLeft(t)} left` : 'Recovering'];
    }
    case 'collapse': {
      const e = entity as {
        pain?: number;
        bloodVolume?: number;
        maxBloodVolume?: number;
        limbs?: { bleedRate?: number }[];
      };
      const pain = Math.round(e.pain ?? 0);
      const maxBlood = e.maxBloodVolume ?? 100;
      const bloodLossPct = Math.round(
        Math.max(0, 1 - (e.bloodVolume ?? maxBlood) / maxBlood) * 100
      );
      const bleeding = (e.limbs ?? []).reduce((s, l) => s + (l?.bleedRate ?? 0), 0) > 0;
      const painMult = 1 - Math.max(0, pain / 100 - 0.1);
      const bloodMult = 1 - Math.min(1, Math.max(0, (bloodLossPct / 100 - 0.2) / 0.35));
      let cause: string;
      if (bleeding) cause = `bleeding out (${bloodLossPct}% lost)`;
      else if (bloodMult < painMult && bloodMult < 0.99)
        cause = `blood loss (${bloodLossPct}% lost)`;
      else if (painMult < 0.99) cause = `pain (${pain}/100)`;
      else if (bloodMult < 0.99) cause = `blood loss (${bloodLossPct}% lost)`;
      else cause = '';
      const ticks = pawnStatService.estimateBloodRecoveryTicks(entity);
      const eta = ticks && ticks > 0 ? `, wakes in ~${gameTimeLeft(ticks)}` : '';
      return [cause ? `Out cold — ${cause}${eta}` : `Recovering${eta}`];
    }
    case 'berserk':
    case 'adrenal': {
      const t = entity.conditionTimers?.[id] ?? 0;
      return [t > 0 ? `Raging — ${gameTimeLeft(t)} left` : 'Raging'];
    }
    case 'berserk_spent':
    case 'adrenal_spent': {
      const t = entity.conditionTimers?.[id] ?? 0;
      return [t > 0 ? `Spent — ${gameTimeLeft(t)} to recover` : 'Spent'];
    }
    default:
      if (id.startsWith('mood_'))
        return [`Mood ${Math.round((entity as Pawn).state?.mood ?? 50)}/100`];
      return [];
  }
}

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
    const sep = entry.indexOf(':');
    const baseId = sep >= 0 ? entry.slice(0, sep) : entry;
    const stageLabel = sep >= 0 ? entry.slice(sep + 1) : undefined;
    const def = TRANSIENT.find((d) => d.id === baseId);
    if (!def || def.hidden) continue;
    const stage = stageLabel ? def.stages?.find((s) => s.label === stageLabel) : undefined;
    if (stageLabel && !stage) continue;
    const mods = stage?.modifiers ?? def.modifiers;
    const grantingTrait = (entity as Pawn).traits?.find((t) => t.selfCondition === baseId);
    const grants = grantingTrait ? traitGrantLines(grantingTrait) : [];
    views.push({
      id: def.id,
      name: def.name,
      color: stage?.color ?? def.color,
      charSpans: def.charSpans,
      description: def.description,
      kind: 'transient',
      stageLabel: stage?.label,
      lifeThreatening: stage?.lifeThreatening,
      sources: [
        ...(grantingTrait ? [`${grantingTrait.name} (cultural trait)`] : []),
        ...transientSources(entity, baseId)
      ],
      effects: [...grants, ...effectLines(mods)],
      modifiers: mods,
      trigger: triggerLine(def.activateWhen)
    });
  }

  return views;
}

export function conditionViewForId(
  condId: string,
  sourceLabel?: string,
  grantLines?: string[]
): ConditionView | null {
  const sources = sourceLabel ? [sourceLabel] : [];
  const grants = grantLines ?? [];
  const p = PERSISTENT.find((d) => d.id === condId);
  if (p) {
    const stage = p.stages[0];
    return {
      id: p.id,
      name: p.name,
      color: stage?.color ?? '#c8c8c8',
      charSpans: p.charSpans,
      description: p.description,
      kind: 'persistent',
      stageLabel: stage?.label,
      lifeThreatening: stage?.lifeThreatening,
      sources,
      effects: [...grants, ...effectLines(stage?.modifiers ?? {})],
      modifiers: stage?.modifiers ?? {}
    };
  }
  const t = TRANSIENT.find((d) => d.id === condId);
  if (t) {
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      charSpans: t.charSpans,
      description: t.description,
      kind: 'transient',
      sources,
      effects: [...grants, ...effectLines(t.modifiers)],
      modifiers: t.modifiers,
      trigger: triggerLine(t.activateWhen)
    };
  }
  return null;
}
