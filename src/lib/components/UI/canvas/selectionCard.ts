import { uiState } from '$lib/stores/uiState.js';
import { gameState } from '$lib/stores/gameState.js';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService.js';
import { type CreatureDefinition, getCreatureById } from '$lib/game/core/defs/creatures.js';
import { RELAXATION_NOTEWORTHY, WETNESS_NOTEWORTHY } from '$lib/components/util/pawnUtils';
import type { Pawn, Mob, Injury } from '$lib/game/core/types.js';
import { limbLabel, partLabel } from '$lib/components/util/bodyLabels';
import { woundById } from '$lib/game/core/defs/wounds';
import { getActiveConditionViews } from '$lib/components/util/conditionInfo.js';
import { pawnService } from '$lib/game/services/PawnService.js';
import { pawnStatService } from '$lib/game/services/PawnStatService.js';
import { itemService } from '$lib/game/services/ItemService.js';
import type { DryingStatus } from '$lib/game/services/ItemService.js';
import { jobService } from '$lib/game/services/JobService.js';
import { stateLabel } from '$lib/game/core/defs/states';
import {
  getConditionCurrentStage,
  conditionStatMultipliers
} from '$lib/game/core/rules/body/conditions.js';
import type { GrowthDirection } from '$lib/game/core/rules/world/cropHealth.js';
import type {
  SelectedEntityModel,
  EntityBar,
  EntityButton,
  EntityStat,
  HealthModel,
  MoodModel,
  HealthLimb,
  HealthPart,
  ArmorModel,
  ArmorLimb,
  ArmorPart
} from '$lib/components/UI/hud/SelectedEntityCard.svelte';
import { PART_DEF_MAP } from '$lib/game/core/defs/bodyParts.js';
import type { StatPillView, StatPillRow } from '$lib/components/UI/widget/StatPills.svelte';
import { TURNS_PER_DAY } from '$lib/game/services/EnvironmentService';

function woundWarn(inj: Injury): boolean {
  return inj.infected || inj.severity !== 'minor';
}

export function moveSpeedStat(entity: Pawn | Mob): EntityStat {
  return {
    label: 'MOVE',
    value: `${pawnService.getMoveSpeed(entity).tilesPerSecond.toFixed(1)}/s`
  };
}

export function coreStats(entity: Pawn | Mob): EntityStat[] {
  const sm = conditionStatMultipliers(entity);
  const cell = (label: string, raw: number, mult: number): EntityStat => {
    const eff = Math.round(raw * mult);
    return { label, value: eff, warn: eff < raw };
  };
  const s = entity.stats;
  return [
    cell('STR', s.strength, sm.strength),
    cell('DEX', s.dexterity, sm.dexterity),
    cell('CON', s.constitution, sm.constitution),
    cell('INT', s.intelligence, sm.intelligence),
    cell('PER', s.perception, sm.perception),
    cell('CHA', s.charisma, 1)
  ];
}

function bestArmorDefense(entity: Pawn | Mob): number {
  let best = 0;
  const eq = 'equipment' in entity ? entity.equipment : undefined;
  if (eq) {
    for (const slot in eq) {
      const inst = (eq as Record<string, { itemId: string } | undefined>)[slot];
      if (!inst) continue;
      const def = itemService.getItemById(inst.itemId)?.armorProperties?.defense ?? 0;
      if (def > best) best = def;
    }
  }
  if ('creatureId' in entity) {
    const natural = getCreatureById(entity.creatureId)?.naturalArmor ?? 0;
    if (natural > best) best = natural;
  }
  return best;
}

const COMBAT_TINT = '#7f96a8';

function combatPills(entity: Pawn | Mob): StatPillView[] {
  const s = (id: string) => pawnStatService.evaluateStat(id, entity);
  const rows = (statId: string): StatPillRow[] =>
    pawnStatService
      .describeStat(entity, statId)
      .vars.map((v) => ({ label: v.name, value: v.value }));
  const formula = (statId: string) => pawnStatService.describeStat(entity, statId).formula;
  const encCond = ('conditions' in entity ? entity.conditions : undefined)?.find(
    (c) => c.id === 'encumbered'
  );
  const encStage = encCond ? getConditionCurrentStage(encCond) : undefined;
  const dodge = s('dodge') * (encStage?.modifiers.dodge ?? 1);
  const pills: StatPillView[] = [
    {
      label: 'Hit',
      value: `×${s('hit_chance').toFixed(2)}`,
      color: COMBAT_TINT,
      desc: 'melee accuracy',
      formula: formula('hit_chance'),
      rows: rows('hit_chance')
    },
    {
      label: 'Dodge',
      value: `×${dodge.toFixed(2)}`,
      color: COMBAT_TINT,
      warn: !!encStage,
      desc: encStage
        ? `evasion · −${Math.round((1 - (encStage.modifiers.dodge ?? 1)) * 100)}% from being ${encStage.label}`
        : 'evasion (lower when injured)',
      formula: formula('dodge'),
      rows: rows('dodge')
    },
    {
      label: 'Precision',
      value: `${Math.round(s('hit_precision') * 100)}%`,
      color: COMBAT_TINT,
      desc: 'chance to strike true — a telling hit that finds a gap (weapons add their own)',
      formula: formula('hit_precision'),
      rows: rows('hit_precision')
    },
    {
      label: 'Armor',
      value: `${bestArmorDefense(entity)}`,
      color: COMBAT_TINT,
      desc: 'best armour (worn, or a creature’s natural hide) — % of a hit it turns before armour-pen'
    }
  ];
  if (encCond) {
    const ratio = 0.8 + encCond.severity * 0.6;
    pills.push({
      label: 'Load',
      value: `${Math.round(ratio * 100)}%`,
      color: COMBAT_TINT,
      warn: true,
      desc: `${encStage?.label ?? ''} — carried weight ÷ carry capacity; past ~100% slows you, easier to hit, worse aim. STR + bags raise the limit.`
    });
  }
  const ranged: Array<[string, string, string]> = [
    ['Aim', 'aim_accuracy', 'ranged accuracy — PER (precision)'],
    ['Fire', 'aim_speed', 'ranged fire-rate — DEX (speed)'],
    ['Reach', 'aim_range', 'ranged reach — PER, capped by vision'],
    ['Reload', 'reload_speed', 'crossbow reload — DEX'],
    ['Shot', 'ranged_damage', 'bow/throw damage — STR (draw/throw power)']
  ];
  for (const [label, id, desc] of ranged) {
    pills.push({
      label,
      value: `×${s(id).toFixed(2)}`,
      color: COMBAT_TINT,
      desc,
      formula: formula(id),
      rows: rows(id)
    });
  }
  return pills;
}

function painLocationRows(entity: Pawn | Mob): StatPillRow[] {
  const found: { label: string; pain: number }[] = [];
  for (const limb of entity.limbs ?? []) {
    const parts = limb.parts ?? [];
    for (const part of parts) {
      const pain = (part.injuries ?? []).reduce((sum, inj) => sum + (inj.painContribution ?? 0), 0);
      if (pain <= 0) continue;
      const worst = part.injuries?.[0];
      const wound = worst
        ? ` · ${woundById(worst.type)?.name ?? worst.type}${worst.infected ? ' · infected' : ''}`
        : '';
      found.push({ label: `${partLabel(part.id)} (${limbLabel(limb.id)})${wound}`, pain });
    }
    const dmg = !limb.isMissing && limb.health < 100 ? (100 - limb.health) * 0.01 : 0;
    const bleedPain = (limb.bleedRate ?? 0) * 0.5;
    if (dmg + bleedPain > 0.05 && parts.every((pt) => (pt.injuries ?? []).length === 0)) {
      found.push({
        label: `${limbLabel(limb.id)} · ${bleedPain > 0 ? 'bleeding' : 'bruised'}`,
        pain: dmg + bleedPain
      });
    }
  }
  found.sort((a, b) => b.pain - a.pain);
  const total = found.reduce((sum, f) => sum + f.pain, 0) || 1;
  return found
    .slice(0, 6)
    .map((f) => ({ label: f.label, value: `${Math.round((f.pain / total) * 100)}%` }));
}

function buildHealthPills(entity: Pawn | Mob): StatPillView[] {
  const health: StatPillView[] = [];
  const temp: StatPillView[] = [];

  if (entity.bloodVolume != null && entity.maxBloodVolume != null) {
    const pct = Math.round((entity.bloodVolume / entity.maxBloodVolume) * 100);
    const bleed = (entity.limbs ?? []).reduce((sum, l) => sum + (l.bleedRate ?? 0), 0);
    const rows: StatPillRow[] = [
      {
        label: 'Volume',
        value: `${Math.round(entity.bloodVolume)}/${Math.round(entity.maxBloodVolume)}`
      }
    ];
    let etaStr = '';
    if (bleed > 0) {
      const hours = (entity.bloodVolume / bleed) * (24 / TURNS_PER_DAY);
      etaStr = hours >= 10 ? `~${Math.round(hours)}h` : `~${hours.toFixed(1)}h`;
      rows.push({ label: 'Bleeding', value: `${bleed.toFixed(1)}/s` });
      rows.push({ label: 'To empty', value: etaStr });
    }
    health.push({
      label: 'Blood',
      value: bleed > 0 ? `${pct}% (${etaStr})` : `${pct}%`,
      color: '#ee5544',
      warn: pct < 60 || bleed > 0,
      desc: bleed > 0 ? 'losing blood' : 'whole-body blood pool',
      rows
    });
  }
  if ((entity.pain ?? 0) > 0) {
    health.push({
      label: 'Pain',
      value: `${Math.round(entity.pain ?? 0)}%`,
      color: '#e07050',
      warn: (entity.pain ?? 0) >= 40,
      desc: 'rises with injuries, limb damage and bleeding — saps consciousness',
      rows: painLocationRows(entity)
    });
  }

  if ((entity.needs?.coldExposure ?? 0) > 0) {
    temp.push({
      label: 'Cold',
      value: `${Math.round(entity.needs?.coldExposure ?? 0)}%`,
      color: '#4fc3f7',
      warn: true,
      desc: 'hypothermia exposure — rises while colder than your tolerance'
    });
  }
  if ((entity.needs?.heatExposure ?? 0) > 0) {
    temp.push({
      label: 'Heat',
      value: `${Math.round(entity.needs?.heatExposure ?? 0)}%`,
      color: '#fb8c00',
      warn: true,
      desc: 'heat-stroke exposure — rises while hotter than your tolerance'
    });
  }
  const tol = pawnStatService.temperatureTolerance(entity);
  const deg = (d: number) => `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))}°`;
  const tolRows = (
    comfortLabel: string,
    comfortVal: number,
    sources: { label: string; deg: number }[],
    onset: number,
    below: boolean,
    capped: boolean
  ): StatPillRow[] => [
    { label: comfortLabel, value: `${Math.round(comfortVal)}°C` },
    ...sources.map((src) => ({ label: src.label, value: deg(below ? -src.deg : src.deg) })),
    {
      label: below ? 'Rises below' : 'Rises above',
      value: `${Math.round(onset)}°C${capped ? ' (cap)' : ''}`
    }
  ];
  temp.push(
    {
      label: 'Cold tol',
      value: `≤${Math.round(tol.coldOnset)}°`,
      color: '#4fc3f7',
      desc: 'cold meter starts rising below this temperature',
      rows: tolRows(
        'Comfort floor',
        tol.comfortMin,
        tol.coldSources,
        tol.coldOnset,
        true,
        tol.coldCapped
      )
    },
    {
      label: 'Heat tol',
      value: `≥${Math.round(tol.heatOnset)}°`,
      color: '#fb8c00',
      desc: 'heat meter starts rising above this temperature',
      rows: tolRows(
        'Comfort ceiling',
        tol.comfortMax,
        tol.heatSources,
        tol.heatOnset,
        false,
        tol.heatCapped
      )
    }
  );

  const combat = combatPills(entity);

  if (temp.length) temp[0].sep = true;
  if (combat.length) combat[0].sep = true;
  return [...health, ...temp, ...combat];
}

export function buildHealthModel(entity: Pawn | Mob): HealthModel {
  const limbs: HealthLimb[] = [];
  for (const limb of entity.limbs ?? []) {
    const parts: HealthPart[] = [];
    for (const part of limb.parts ?? []) {
      const hurt = part.isMissing || part.health < part.maxHp - 0.5 || part.injuries.length > 0;
      if (!hurt) continue;
      const partBleed = part.injuries.reduce((s, inj) => s + (inj.bleeding ?? 0), 0);
      parts.push({
        label: partLabel(part.id),
        health: part.health,
        maxHp: part.maxHp,
        missing: part.isMissing,
        bleedRate: partBleed > 0 ? partBleed : undefined,
        wounds: part.injuries.map((inj) => ({
          text: inj.permanent
            ? (woundById(inj.type)?.name ?? inj.type)
            : `${woundById(inj.type)?.name ?? inj.type} (${inj.severity})${inj.infected ? ' · infected' : ''}`,
          warn: !inj.permanent && woundWarn(inj),
          treated: inj.treatedAt != null
        }))
      });
    }
    const damaged =
      limb.isMissing || Math.round(limb.health) < 100 || limb.bleedRate > 0 || parts.length > 0;
    if (!damaged) continue;
    limbs.push({
      label: limbLabel(limb.id),
      health: limb.health,
      missing: limb.isMissing,
      bleedRate: limb.bleedRate,
      parts
    });
  }

  const bleedRate = (entity.limbs ?? []).reduce((s, l) => s + (l.bleedRate ?? 0), 0);
  return {
    blood:
      entity.bloodVolume != null && entity.maxBloodVolume != null
        ? { current: entity.bloodVolume, max: entity.maxBloodVolume }
        : undefined,
    bleedRate: bleedRate > 0 ? bleedRate : undefined,
    pain: entity.pain,
    coldExposure: entity.needs?.coldExposure,
    heatExposure: entity.needs?.heatExposure,
    pills: buildHealthPills(entity),
    limbs
  };
}

const DEFAULT_ARMOR_SHARE = 0.5;

export function buildArmorModel(mob: Mob, def: CreatureDefinition): ArmorModel | undefined {
  const scalar = def.naturalArmor ?? 0;
  const mods = def.armorMods ?? [];
  if (scalar <= 0 && mods.length === 0) return undefined;

  let thickest = 0;
  const raw: { label: string; parts: { label: string; armor: number }[] }[] = [];
  for (const limb of mob.limbs ?? []) {
    const parts: { label: string; armor: number }[] = [];
    for (const part of limb.parts ?? []) {
      const pdef = PART_DEF_MAP[part.id];
      if (!pdef || pdef.hitWeight <= 0) continue;
      let armor = scalar * (pdef.armor ?? DEFAULT_ARMOR_SHARE);
      for (const m of mods)
        if (m.target === 'all' || m.target === part.id || m.target === limb.id) armor += m.defense;
      parts.push({ label: partLabel(part.id), armor });
      if (armor > thickest) thickest = armor;
    }
    if (parts.length) raw.push({ label: limbLabel(limb.id), parts });
  }
  if (!raw.length) return undefined;

  const weakCut = thickest * 0.4;
  const limbs: ArmorLimb[] = raw.map((r) => ({
    label: r.label,
    parts: r.parts.map(
      (p): ArmorPart => ({ label: p.label, armor: Math.round(p.armor), weak: p.armor <= weakCut })
    )
  }));
  return { limbs };
}

export function entityDebugLabel(entity: { id: string; debugId?: number }): string {
  if (import.meta.env.VITE_DEBUG_MODE !== 'true') return '';
  if (entity.debugId != null) return ` #${entity.debugId}`;
  const m = entity.id.match(/(\d+)(?!.*\d)/);
  return m ? ` #${m[1]}` : ` #${entity.id.slice(-4)}`;
}

export function pawnStateLabel(p: Pawn): string {
  const s = p.currentState ?? 'Idle';
  if (s === 'Working' && p.activeJob) {
    const label = jobService.getJobLabel(p.activeJob.type);
    if (label) return label;
  }
  return stateLabel(s);
}

export function jobResourceName(resourceId: string): string {
  const def = resourceObjectService.getById(resourceId);
  if (def?.displayName) return def.displayName;
  return resourceId.replace(/_/g, ' ');
}

export function jobProgressBar(progress: number): string {
  const clamped = Math.max(0, Math.min(1, progress));
  const filled = Math.round(clamped * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

const DRY_SLOW = '#cc7a33';
const DRY_STEADY = '#c8b23a';
const DRY_FAST = '#5fc23a';
const DRY_WET = '#4aa3d4';
const DRY_STALL = '#6b6b6b';

export function dryingIndicator(s: DryingStatus): { glyph: string; color: string; title: string } {
  if (s.rate < 0) {
    const wet = s.wetness !== undefined ? ` (${Math.round(s.wetness)}% wetness)` : '';
    return { glyph: '↓', color: DRY_WET, title: `drying reversing — too wet${wet}` };
  }
  if (s.rate === 0) {
    const why =
      s.reason === 'cold'
        ? `too cold${s.temp !== undefined ? ` (${Math.round(s.temp)}°C)` : ''}`
        : s.reason === 'no-fire'
          ? 'needs a lit fire within 2 tiles'
          : 'stalled';
    return { glyph: '·', color: DRY_STALL, title: `not drying — ${why}` };
  }
  const fast = s.rate >= 1.8;
  const steady = s.rate >= 0.8;
  const color = fast ? DRY_FAST : steady ? DRY_STEADY : DRY_SLOW;
  const word = fast ? 'fast' : steady ? 'steady' : 'slow';
  const parts: string[] = [];
  if (s.temp !== undefined) parts.push(`${Math.round(s.temp)}°C`);
  if (s.wetness !== undefined) parts.push(`${Math.round(s.wetness)}% wet`);
  if (s.bonus > 1) parts.push(`rack ×${s.bonus}`);
  const detail = parts.length ? ` — ${parts.join(', ')}` : '';
  return { glyph: fast ? '⇈' : '↑', color, title: `drying (${word})${detail}` };
}

const GROW_FALL = '#cc5544';

export function growthIndicator(dir: GrowthDirection): {
  glyph: string;
  color: string;
  title: string;
} {
  if (dir === 'falling')
    return {
      glyph: '↓',
      color: GROW_FALL,
      title:
        'growth falling — the crop is cold, dry, snowed-on or over its heat limit and slowly dying'
    };
  if (dir === 'mature')
    return { glyph: '✓', color: DRY_FAST, title: 'fully grown — ready to harvest' };
  return { glyph: '↑', color: DRY_FAST, title: 'growth rising — conditions are favourable' };
}

export const PROGRESS_BAR_STATES = new Set(['Working', 'Eating', 'Drinking', 'Washing']);

export function toggleDraft(pawnId: string) {
  gameState.command({ type: 'toggleDraft', payload: { pawnId }, save: true });
}

export function toggleHuntMark(mobId: string) {
  gameState.command({ type: 'toggleHuntMark', payload: { mobId }, save: true });
}

export interface PawnCardDeps {
  cameraFollowPawnId: string | null;
  startMark: () => void;
  armMove: () => void;
  toggleFood: () => void;
  foodOpen: boolean;
  moodModel?: MoodModel;
}

export interface MobCardDeps {
  cameraFollowMobId: string | null;
  startMark: () => void;
  colonyName?: string;
}

export function buildPawnCard(
  pawn: Pawn,
  selected: boolean,
  deps: PawnCardDeps
): SelectedEntityModel {
  const { cameraFollowPawnId, startMark, armMove, toggleFood, foodOpen, moodModel } = deps;
  const bars: EntityBar[] = [
    { label: 'HUNGER', value: pawn.needs.hunger, warn: pawn.needs.hunger > 60 },
    { label: 'REST', value: pawn.needs.fatigue, warn: pawn.needs.fatigue > 60 },
    { label: 'THIRST', value: pawn.needs.thirst ?? 0, warn: (pawn.needs.thirst ?? 0) > 60 },
    { label: 'HYGIENE', value: pawn.needs.hygiene ?? 0, warn: (pawn.needs.hygiene ?? 0) > 60 }
  ];
  if (pawn.maxBloodVolume) {
    const curBV = pawn.bloodVolume ?? pawn.maxBloodVolume;
    bars.push({
      label: 'BLOOD',
      value: Math.round((curBV / pawn.maxBloodVolume) * 100),
      warn: curBV < pawn.maxBloodVolume * 0.6
    });
  }
  if (pawn.maxStamina !== undefined) {
    const curST = pawn.stamina ?? pawn.maxStamina;
    bars.push({
      label: 'STAMINA',
      value: Math.round((curST / pawn.maxStamina) * 100),
      warn: curST < pawn.maxStamina * 0.25
    });
  }
  if ((pawn.needs.wetness ?? 0) > WETNESS_NOTEWORTHY) {
    bars.push({ label: 'WETNESS', value: Math.round(pawn.needs.wetness ?? 0), color: '#4FA3D1' });
  }
  const relaxVal = pawn.needs.relaxation ?? 100;
  if (relaxVal < RELAXATION_NOTEWORTHY) {
    bars.push({
      label: 'RELAXATION',
      value: Math.round(relaxVal),
      color: relaxVal >= 20 ? '#c8a030' : '#c86030',
      warn: relaxVal < 20
    });
  }
  const moodValue = moodModel ? Math.round(moodModel.mood) : Math.floor(pawn.state.mood);
  const stats: EntityStat[] = [
    ...coreStats(pawn),
    moveSpeedStat(pawn),
    { label: 'Mood', value: moodValue, warn: moodValue < 30 }
  ];
  const posMeta =
    [
      pawn.sex ? (pawn.sex === 'male' ? 'Male' : 'Female') : undefined,
      pawn.age != null ? `${pawn.age} years` : undefined
    ]
      .filter(Boolean)
      .join(', ') || undefined;
  return {
    name: pawn.name + entityDebugLabel(pawn),
    status: pawn.socialBreak
      ? pawn.socialBreak.kind === 'crisis'
        ? 'in crisis'
        : 'on a break'
      : pawnStateLabel(pawn),
    selected,
    dismissable: selected,
    stats,
    conditionViews: getActiveConditionViews(pawn),
    bars,
    note:
      (pawn.pendingGrowth?.length ?? 0) > 0
        ? `★ growth ready${pawn.pendingGrowth!.length > 1 ? ` (${pawn.pendingGrowth!.length})` : ''}`
        : undefined,
    progress:
      pawn.activeJob && pawn.currentState != null && PROGRESS_BAR_STATES.has(pawn.currentState)
        ? (pawn.activeJob.progress ?? 0)
        : undefined,
    pos: selected ? (pawn.position ?? undefined) : undefined,
    posMeta,
    health: buildHealthModel(pawn),
    moodModel,
    buttons: selected
      ? ([
          {
            label: 'VIEW',
            onClick: () =>
              uiState.update((s) => ({
                ...s,
                selectedPawnId: pawn.id,
                pawnScreenTab: 'status',
                currentScreen: 'pawns'
              }))
          },
          {
            label: cameraFollowPawnId === pawn.id ? 'UNFOLLOW' : 'FOLLOW',
            active: cameraFollowPawnId === pawn.id,
            onClick: () => uiState.setFollowPawn(cameraFollowPawnId === pawn.id ? null : pawn.id)
          },
          {
            label: pawn.drafted ? 'DRAFTED' : 'DRAFT',
            active: pawn.drafted ?? false,
            onClick: () => toggleDraft(pawn.id)
          },
          ...(pawn.drafted ? [{ label: 'MOVE', onClick: () => armMove() }] : []),
          {
            label: 'WORK',
            onClick: () =>
              uiState.update((s) => ({
                ...s,
                selectedPawnId: pawn.id,
                pawnScreenTab: null,
                currentScreen: 'work'
              }))
          },
          {
            label: 'GEAR',
            onClick: () =>
              uiState.update((s) => ({
                ...s,
                selectedPawnId: pawn.id,
                pawnScreenTab: 'gear',
                currentScreen: 'pawns'
              }))
          },
          {
            label: 'FOOD',
            active: foodOpen,
            onClick: () => toggleFood()
          },
          {
            label: 'MARK',
            onClick: () => startMark()
          }
        ] satisfies EntityButton[])
      : undefined,
    onSelect: !selected
      ? () => {
          uiState.selectPawn(pawn.id);
          uiState.selectMob(null);
        }
      : undefined
  };
}

export function mobDisplayName(mob: Mob, def: CreatureDefinition): string {
  if (mob.name) return mob.name;
  if (!def.species) return def.name;
  const speciesLabel = def.species
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return speciesLabel === def.name ? def.name : `${speciesLabel}, ${def.name}`;
}

export function buildMobCard(
  mob: Mob,
  def: CreatureDefinition,
  selected: boolean,
  deps: MobCardDeps
): SelectedEntityModel {
  const { cameraFollowMobId, startMark } = deps;
  const bars: EntityBar[] = [
    {
      label: 'HUNGER',
      value: mob.needs.hunger,
      warn: mob.needs.hunger > 60
    },
    {
      label: 'REST',
      value: mob.needs.fatigue,
      warn: mob.needs.fatigue > 60
    },
    {
      label: 'BLOOD',
      value: Math.round(
        ((mob.bloodVolume ?? mob.maxBloodVolume ?? 100) / (mob.maxBloodVolume ?? 100)) * 100
      ),
      warn: (mob.bloodVolume ?? mob.maxBloodVolume ?? 100) / (mob.maxBloodVolume ?? 100) < 0.6
    }
  ];
  if (mob.maxStamina !== undefined) {
    const curST = mob.stamina ?? mob.maxStamina;
    bars.push({
      label: 'STAMINA',
      value: Math.round((curST / mob.maxStamina) * 100),
      warn: curST < mob.maxStamina * 0.25
    });
  }
  const effStats = coreStats(mob);
  return {
    name: mobDisplayName(mob, def) + entityDebugLabel(mob),
    flavor: mob.worldKinRelation ?? def.flavor,
    status:
      mob.state === 'Traveling' ? `Approaching ${deps.colonyName ?? 'the colony'}` : mob.state,
    selected,
    dismissable: selected,
    stats: [effStats[0], effStats[1], moveSpeedStat(mob)],
    conditionViews: getActiveConditionViews(mob),
    bars,
    note: `${def.entityClass === 'mob' ? '⚔ hostile' : '◆ neutral'} · ${def.behaviour}${
      def.tameable ? ' · tameable' : ''
    }${mob.age != null ? ` · ${mob.age} yrs` : ''}${
      mob.sex ? ` · ${mob.sex === 'male' ? '♂' : '♀'}` : ''
    }`,
    pos: selected ? { x: mob.x, y: mob.y } : undefined,
    health: buildHealthModel(mob),
    armor: buildArmorModel(mob, def),
    buttons: selected
      ? ([
          {
            label: 'VIEW',
            onClick: () => {
              uiState.selectMob(mob.id);
              uiState.setScreen('entities');
            }
          },
          {
            label: cameraFollowMobId === mob.id ? 'UNFOLLOW' : 'FOLLOW',
            active: cameraFollowMobId === mob.id,
            onClick: () => uiState.setFollowMob(cameraFollowMobId === mob.id ? null : mob.id)
          },
          {
            label: mob.markedForHunt ? 'UNQUEUE' : 'HUNT',
            active: mob.markedForHunt ?? false,
            onClick: () => toggleHuntMark(mob.id)
          },
          {
            label: 'MARK',
            onClick: () => startMark()
          }
        ] satisfies EntityButton[])
      : undefined,
    onSelect: !selected
      ? () => {
          uiState.selectMob(mob.id);
          uiState.selectPawn(null);
        }
      : undefined
  };
}
