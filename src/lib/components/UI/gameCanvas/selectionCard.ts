// Selection-card builders for GameCanvas (P-4). Turn a pawn / mob into the SelectedEntityCard
// view model shown in the tile HUD. Extracted from GameCanvas as free functions; the bits that
// close over component-reactive state (the camera-follow ids) and the drag callback are threaded
// in via the `deps` argument, so the reactive `$:` blocks in GameCanvas re-run when they change.
import { uiState } from '$lib/stores/uiState.js';
import { gameState } from '$lib/stores/gameState.js';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService.js';
import { type CreatureDefinition, getCreatureById } from '$lib/game/core/Creatures.js';
import type { Pawn, Mob, Injury } from '$lib/game/core/types.js';
import { limbLabel, partLabel } from '$lib/utils/bodyLabels';
import { woundById } from '$lib/game/core/Wounds';
import { getActiveConditionViews } from '$lib/components/util/conditionInfo.js';
import { pawnService } from '$lib/game/services/PawnService.js';
import { pawnStatService } from '$lib/game/services/PawnStatService.js';
import { itemService } from '$lib/game/services/ItemService.js';
import type { DryingStatus } from '$lib/game/services/ItemService.js';
import { jobService } from '$lib/game/services/JobService.js';
import { stateLabel } from '$lib/game/core/stateDefs';
import { getConditionCurrentStage, conditionStatMultipliers } from '$lib/game/core/needs.js';
import type { GrowthDirection } from '$lib/game/core/cropHealth.js';
import type {
  SelectedEntityModel,
  EntityBar,
  EntityButton,
  EntityStat,
  HealthModel,
  MoodModel,
  HealthLimb,
  HealthPart,
  HealthWound,
  ArmorModel,
  ArmorLimb,
  ArmorPart
} from '$lib/components/UI/SelectedEntityCard.svelte';
import { PART_DEF_MAP } from '$lib/game/core/BodyParts.js';
import type { StatPillView, StatPillRow } from '$lib/components/UI/StatPills.svelte';
import { TURNS_PER_DAY } from '$lib/game/services/EnvironmentService';

/** A wound is highlighted when it's serious enough to matter or has gone septic. */
function woundWarn(inj: Injury): boolean {
  return inj.infected || inj.severity !== 'minor';
}

/** A pawn/mob's current movement speed as a compact "3.8/s" stat readout. */
export function moveSpeedStat(entity: Pawn | Mob): EntityStat {
  return {
    label: 'MOVE',
    value: `${pawnService.getMoveSpeed(entity).tilesPerSecond.toFixed(1)}/s`
  };
}

/** The six core attributes as compact stat readouts, in the canonical PawnStatBanner order. Values are
 *  EFFECTIVE (raw × active-condition multipliers) so they match the crippled body the sim uses — a stat
 *  the conditions have dragged below its raw value shows the warn colour. */
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

/**
 * Compact combat-readiness rows for the HEALTH panel. hit/dodge are stat multipliers (×, baseline
 * 1.0); crit is a probability shown as a percent. All three are evaluated against the live body, so
 * injuries (lower manipulation/moving/consciousness) visibly drop them next to the wounds causing it.
 */
/** Best armour `defense` protecting the body (the % of a hit it turns before armour-pen): the strongest
 *  worn layer (pawns) OR the creature's natural hide/scale/chitin (mobs) — whichever is higher, matching
 *  what Combat.partArmorReduction actually applies. 0 if bare. */
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

const COMBAT_TINT = '#7f96a8'; // steel — neutral combat-readiness pills

/** Combat-readiness pills (hit/dodge/crit/armour/load + ranged potential). Each formula-backed pill
 *  carries its derivation (formula + current factor values) for the hover breakdown — the same data the
 *  attributes panel shows. Evaluated against the live body, so injuries visibly drop them. */
function combatPills(entity: Pawn | Mob): StatPillView[] {
  const s = (id: string) => pawnStatService.evaluateStat(id, entity);
  const rows = (statId: string): StatPillRow[] =>
    pawnStatService
      .describeStat(entity, statId)
      .vars.map((v) => ({ label: v.name, value: v.value }));
  const formula = (statId: string) => pawnStatService.describeStat(entity, statId).formula;
  // The live `encumbered` condition carries the dodge/move/aim penalty — read its stage so the pill
  // matches what combat applies.
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
    // Reconstruct the load ratio from severity (sev = (ratio−0.8)/0.6) for a readable %.
    const ratio = 0.8 + encCond.severity * 0.6;
    pills.push({
      label: 'Load',
      value: `${Math.round(ratio * 100)}%`,
      color: COMBAT_TINT,
      warn: true,
      desc: `${encStage?.label ?? ''} — carried weight ÷ carry capacity; past ~100% slows you, easier to hit, worse aim. STR + bags raise the limit.`
    });
  }
  // Ranged potential (PER = precision, DEX = speed, STR = draw power), shown for every pawn so a build
  // reads at a glance whether they'd make an archer (PER), a crossbowman (DEX), etc.
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

/** Where a pawn's pain comes from: each injured sub-part (and any plain bruised/bleeding limb), as
 *  "location · wound → % of total pain" rows for the Pain pill's hover, ranked by contribution. */
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
    // Soft-tissue damage / bleeding on a limb with no specific injured part still hurts.
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

/** All health-tab pills in three clusters (health | temp | combat), separated visually. Each carries a
 *  hover breakdown. Pure presentation data for StatPills. */
function buildHealthPills(entity: Pawn | Mob): StatPillView[] {
  const health: StatPillView[] = [];
  const temp: StatPillView[] = [];

  // ── Health cluster: blood + pain ──
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

  // ── Temp cluster: live exposure meters + cold/heat tolerance ──
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
  // The bare comfort edge is the no-resistance onset; each source then shifts it toward the shown onset
  // (cold sources push it DOWN, heat sources UP), so the rows literally add up to the pill's value.
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

  // ── Combat cluster ──
  const combat = combatPills(entity);

  if (temp.length) temp[0].sep = true;
  if (combat.length) combat[0].sep = true;
  return [...health, ...temp, ...combat];
}

/**
 * NT-U1: whole-body health snapshot for the HEALTH pop-up. Reports blood + pain for the whole body,
 * then every damaged limb (missing / hurt / bleeding) — with its bleed rate and each injured
 * sub-part's individual HP (e.g. skull 41/45) and wounds — plus any active conditions. Shared by
 * pawns and mobs (both carry the 6-limb model with nested parts, a blood pool and conditions). An
 * undamaged body renders as "no damage".
 */
export function buildHealthModel(entity: Pawn | Mob): HealthModel {
  const limbs: HealthLimb[] = [];
  for (const limb of entity.limbs ?? []) {
    // Only sub-parts that are actually hurt (missing, below max HP, or carrying a wound).
    const parts: HealthPart[] = [];
    for (const part of limb.parts ?? []) {
      // −0.5 tolerance: a part that healed to within rounding of full counts as whole, so the panel
      // drops it instead of showing a "80/80" part forever (the heal pass snaps to maxHp, this guards rounding).
      const hurt = part.isMissing || part.health < part.maxHp - 0.5 || part.injuries.length > 0;
      if (!hurt) continue;
      // Per-part bleed = Σ its wounds' `bleeding` (same source the limb total rolls up), so each sub-part
      // shows where the blood is actually coming from — not just the limb container.
      const partBleed = part.injuries.reduce((s, inj) => s + (inj.bleeding ?? 0), 0);
      parts.push({
        label: partLabel(part.id),
        health: part.health,
        maxHp: part.maxHp,
        missing: part.isMissing,
        bleedRate: partBleed > 0 ? partBleed : undefined,
        wounds: part.injuries.map((inj) => ({
          // A PERMANENT (trait-stamped) wound is an old, healed-over SCAR — it reads as such (the scar
          // def's name already carries "Old …") and never "warns" (it isn't deteriorating and can't be
          // treated), distinct from an active injury.
          text: inj.permanent
            ? (woundById(inj.type)?.name ?? inj.type)
            : `${woundById(inj.type)?.name ?? inj.type} (${inj.severity})${inj.infected ? ' · infected' : ''}`,
          warn: !inj.permanent && woundWarn(inj),
          treated: inj.treatedAt != null // tended by a caretaker → green `+`
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
    // SEASONS_WEATHER: tracked cold/heat exposure meters (pawns) — kept for the "any-damage" gate.
    coldExposure: entity.needs?.coldExposure,
    heatExposure: entity.needs?.heatExposure,
    // Blood / pain / exposure / tolerance / combat — all surfaced as compact hover-breakdown pills.
    pills: buildHealthPills(entity),
    limbs
  };
}

/** Default armour share for a part with no explicit `armor` field (mirrors Combat.DEFAULT_ARMOR_SHARE). */
const DEFAULT_ARMOR_SHARE = 0.5;

/**
 * ADR-029: per-part natural-armour map for the creature GEAR pop-up. For every HITTABLE body part
 * (hitWeight > 0) computes the armour points a blow must chew through — `naturalArmor × the part's
 * share`, plus any per-part `armorMods` (carapace back-heavy, soft belly) targeting that part / its
 * limb / `all`. Grouped by limb; the thinnest spots (well below the creature's thickest plating) are
 * flagged `weak` so the reader can find the gap without being told where it is. Returns `undefined`
 * for an unarmoured creature (no hide worth reading) — that hides the GEAR button entirely.
 */
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
      if (!pdef || pdef.hitWeight <= 0) continue; // internal-only parts are never struck directly
      let armor = scalar * (pdef.armor ?? DEFAULT_ARMOR_SHARE);
      for (const m of mods)
        if (m.target === 'all' || m.target === part.id || m.target === limb.id) armor += m.defense;
      parts.push({ label: partLabel(part.id), armor });
      if (armor > thickest) thickest = armor;
    }
    if (parts.length) raw.push({ label: limbLabel(limb.id), parts });
  }
  if (!raw.length) return undefined;

  // A spot ≤ 40% of the thickest plating reads as a thin patch — relative so it scales with any hide.
  const weakCut = thickest * 0.4;
  const limbs: ArmorLimb[] = raw.map((r) => ({
    label: r.label,
    parts: r.parts.map(
      (p): ArmorPart => ({ label: p.label, armor: Math.round(p.armor), weak: p.armor <= weakCut })
    )
  }));
  return { limbs };
}

/** Debug `#id` suffix shown next to entity names when VITE_DEBUG_MODE is on. */
export function entityDebugLabel(entity: { id: string; debugId?: number }): string {
  if (import.meta.env.VITE_DEBUG_MODE !== 'true') return '';
  if (entity.debugId != null) return ` #${entity.debugId}`;
  const m = entity.id.match(/(\d+)(?!.*\d)/);
  return m ? ` #${m[1]}` : ` #${entity.id.slice(-4)}`;
}

/** Human-readable label for a pawn's current FSM state / active job. A Working pawn reads its task from
 *  the active job's jobs.jsonc `label` (caretake → "Tend", construct → "Build", refuel → "Refuel"…) —
 *  data-driven, so EVERY job type is task-specific instead of a generic "Working". */
export function pawnStateLabel(p: Pawn): string {
  const s = p.currentState ?? 'Idle';
  if (s === 'Working' && p.activeJob) {
    const label = jobService.getJobLabel(p.activeJob.type);
    if (label) return label;
  }
  return stateLabel(s);
}

/** Display name for a job's resource (resource def display name, else prettified id). */
export function jobResourceName(resourceId: string): string {
  const def = resourceObjectService.getById(resourceId);
  if (def?.displayName) return def.displayName;
  return resourceId.replace(/_/g, ' ');
}

/** 10-cell ascii progress bar for a 0–1 fraction. */
export function jobProgressBar(progress: number): string {
  const clamped = Math.max(0, Math.min(1, progress));
  const filled = Math.round(clamped * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

// Drying-speed arrow palette: slow → fast, plus reversing (wet) and stalled.
const DRY_SLOW = '#cc7a33';
const DRY_STEADY = '#c8b23a';
const DRY_FAST = '#5fc23a';
const DRY_WET = '#4aa3d4';
const DRY_STALL = '#6b6b6b';

/**
 * Compact, colour-coded drying-speed arrow for a stack — shared by the item card and the building
 * panel so the two read identically. Colour communicates HOW FAST it's curing (warmer + drier + a
 * rack's bonus ⇒ faster); the glyph the direction (↑/⇈ curing, ↓ reversing while wet, · stalled).
 * `rate` is open-ground-full-warmth-relative (1 = base; ×3 with a hay rack).
 */
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

/** Falling-growth red (a withering crop) — matches the warning red used elsewhere in the HUD. */
const GROW_FALL = '#cc5544';

/**
 * Compact growth-direction arrow for a growing resource — the crop-growth twin of {@link dryingIndicator},
 * so the tile HUD reads the two meters in the same language: ↑ rising (favourable), ↓ falling (cold/dry/
 * snow stress, the crop is slowly dying), ✓ ready (matured). Takes the direction from the shared
 * `cropGrowthDirection` model so the pill can't drift from what the sim does next tick.
 */
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

/**
 * FSM states that have a meaningful in-place task progress bar — the same ones that draw a bar above
 * the pawn's head (Working + the in-place need jobs). Moving/Idle/Sleeping have no "task" to complete,
 * so neither the head overlay nor the info panel shows a bar for them. Single source of truth, also
 * consumed by GameCanvas's over-head overlay so the two never drift apart.
 */
export const PROGRESS_BAR_STATES = new Set(['Working', 'Eating', 'Drinking', 'Washing']);

/** Toggle a pawn's drafted flag (clears its job + draft target). */
export function toggleDraft(pawnId: string) {
  gameState.command({ type: 'toggleDraft', payload: { pawnId }, save: true });
}

/** Toggle a mob's markedForHunt flag. */
export function toggleHuntMark(mobId: string) {
  gameState.command({ type: 'toggleHuntMark', payload: { mobId }, save: true });
}

/** Reactive deps for {@link buildPawnCard} (camera-follow id changes over time). */
export interface PawnCardDeps {
  cameraFollowPawnId: string | null;
  /** MARK button — begin the highlight drag for pawns. The group is only *highlighted*; the player
   *  then presses DRAFT / MOVE on the group HUD. Threaded in from GameCanvas. */
  startMark: () => void;
  /** MOVE button (shown only for a drafted pawn) — arm the Achtung-style move-aim, so the next map
   *  press draws the destination line/click. Threaded in from GameCanvas. */
  armMove: () => void;
  /** FOOD button — toggle the colony food-filter fly-out (what pawns are allowed to eat). Colony-wide,
   *  surfaced on the pawn card; owned/rendered by GameCanvas like the building FUEL panel. */
  toggleFood: () => void;
  /** Whether the food-filter fly-out is currently open (drives the FOOD button's active state). */
  foodOpen: boolean;
  /** §M Mood breakdown for the MOOD pop-up (pawnService.getMoodBreakdown). Threaded in from GameCanvas
   *  because it needs the live GameState (weather + nearby buildings), which this builder doesn't hold. */
  moodModel?: MoodModel;
}

/** Reactive deps + MARK callback for {@link buildMobCard}. */
export interface MobCardDeps {
  cameraFollowMobId: string | null;
  /** MARK button — begin the highlight drag for mobs; the player then presses HUNT on the group HUD. */
  startMark: () => void;
  /** The player colony's settlement name (home culture name) — shown when a kingdom party is marching in. */
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
  // Autohide meters that are irrelevant: BLOOD/STAMINA only matter when NOT full, WETNESS only when
  // wet, FUN only once it drops low.
  if (pawn.maxBloodVolume) {
    const curBV = pawn.bloodVolume ?? pawn.maxBloodVolume;
    if (curBV < pawn.maxBloodVolume) {
      bars.push({
        label: 'BLOOD',
        value: Math.round((curBV / pawn.maxBloodVolume) * 100),
        warn: curBV < pawn.maxBloodVolume * 0.6
      });
    }
  }
  if (pawn.maxStamina !== undefined) {
    const curST = pawn.stamina ?? pawn.maxStamina;
    if (curST < pawn.maxStamina) {
      bars.push({
        label: 'STAMINA',
        value: Math.round((curST / pawn.maxStamina) * 100),
        warn: curST < pawn.maxStamina * 0.25
      });
    }
  }
  // SEASONS_WEATHER: how soaked the pawn is, as a body-state bar like BLOOD (blue = water) — only
  // shown while actually damp.
  if ((pawn.needs.wetness ?? 0) > 0) {
    bars.push({ label: 'WETNESS', value: Math.round(pawn.needs.wetness ?? 0), color: '#4FA3D1' });
  }
  // SOCIAL: FUN is inverted (100 = entertained) and only surfaces once it drops low (a bored pawn).
  const funVal = pawn.needs.fun ?? 100;
  if (funVal < 12) {
    bars.push({
      label: 'FUN',
      value: Math.round(funVal),
      color: funVal < 5 ? '#c86030' : '#c8a030',
      warn: funVal < 5
    });
  }
  // No flat "HP" stat: the body model (limbs/blood/pain) is the real health — see the HEALTH popup.
  // Core attributes, then MOVE (current movement speed), then Mood — Mood rides with the movement
  // readout rather than the header (which is left free for the name + long state tag).
  const moodValue = moodModel ? Math.round(moodModel.mood) : Math.floor(pawn.state.mood);
  const stats: EntityStat[] = [
    ...coreStats(pawn),
    moveSpeedStat(pawn),
    { label: 'Mood', value: moodValue, warn: moodValue < 30 }
  ];
  // Sex + age footer, shown beside the map position (e.g. "Male, 34 years").
  const posMeta =
    [
      pawn.sex ? (pawn.sex === 'male' ? 'Male' : 'Female') : undefined,
      pawn.age != null ? `${pawn.age} years` : undefined
    ]
      .filter(Boolean)
      .join(', ') || undefined;
  return {
    name: pawn.name + entityDebugLabel(pawn),
    // SOCIAL-LAYER §7: a mental break overrides the FSM state tag — the player should see WHY the
    // pawn is wandering instead of working.
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
    // PAWN-GROWTH: nudge the player to the Status tab when a growth offer is waiting.
    note:
      (pawn.pendingGrowth?.length ?? 0) > 0
        ? `★ growth ready${pawn.pendingGrowth!.length > 1 ? ` (${pawn.pendingGrowth!.length})` : ''}`
        : undefined,
    // (No `job` line: it just repeated the [state] tag next to the name — replaced by the WETNESS bar.)
    // Only show a bar for states that also draw one above the pawn's head (Working / eat / drink /
    // wash). Moving/Idle/Sleeping have no in-place task to complete, so no bar.
    progress:
      pawn.activeJob && pawn.currentState != null && PROGRESS_BAR_STATES.has(pawn.currentState)
        ? (pawn.activeJob.progress ?? 0)
        : undefined,
    pos: selected ? (pawn.position ?? undefined) : undefined,
    posMeta,
    // Built for hover cards too so the shared HEALTH toggle works on hover, not just selection.
    health: buildHealthModel(pawn),
    // §M Mood breakdown for the MOOD pop-up (computed in GameCanvas, which holds the live GameState).
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
          // A drafted pawn gets a MOVE button that arms the map move-aim (right-drag/click a line);
          // hidden when undrafted (nothing to move).
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
            // Colony-wide food filter (what pawns may eat) — fly-out owned/rendered by GameCanvas.
            label: 'FOOD',
            active: foodOpen,
            onClick: () => toggleFood()
          },
          {
            // Drag a box to highlight pawns; DRAFT / MOVE then act on the whole group.
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

/** §2e display name for a mob: a T5 boss shows its rolled legend `name`; a laddered variant shows
 *  "<Species>, <Variant>" (the group + the individual); an un-laddered creature (or one whose name IS
 *  the species label, like the base wolf) shows its plain name. Species id → Title Case. */
export function mobDisplayName(mob: Mob, def: CreatureDefinition): string {
  if (mob.name) return mob.name; // a T5 boss's procedural legend name
  if (!def.species) return def.name; // un-laddered — no variant slot
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
  // STR/DEX are EFFECTIVE (raw × active-condition multipliers via coreStats), so a fractured/shocked/
  // starving creature shows the crippled body combat actually uses — not the raw creatures.jsonc stat.
  const effStats = coreStats(mob);
  return {
    // §2e name: a T5 boss shows its rolled legend name (mob.name). Every other ladder creature reads
    // "<Species>, <Variant>" ("Boar, Razorback") so the group + the individual both show; a species
    // whose name IS the species label (base wolf) or an un-laddered creature just shows its own name.
    name: mobDisplayName(mob, def) + entityDebugLabel(mob),
    // SOCIAL-LAYER: a visiting off-colony relative reads as "Kael's sister", not the creature flavour.
    flavor: mob.worldKinRelation ?? def.flavor,
    // A marching kingdom party reads as its intent (heading for the colony), not the raw FSM state.
    status:
      mob.state === 'Traveling' ? `Approaching ${deps.colonyName ?? 'the colony'}` : mob.state,
    selected,
    dismissable: selected,
    // No flat "HP" stat: the body model (limbs/blood/pain) is the real health — see the HEALTH popup.
    stats: [effStats[0], effStats[1], moveSpeedStat(mob)],
    conditionViews: getActiveConditionViews(mob),
    bars,
    note: `${def.entityClass === 'mob' ? '⚔ hostile' : '◆ neutral'} · ${def.behaviour}${
      def.tameable ? ' · tameable' : ''
    }${mob.age != null ? ` · ${mob.age} yrs` : ''}${
      mob.sex ? ` · ${mob.sex === 'male' ? '♂' : '♀'}` : ''
    }`,
    pos: selected ? { x: mob.x, y: mob.y } : undefined,
    // Built for hover cards too so the shared HEALTH toggle works on hover, not just selection.
    health: buildHealthModel(mob),
    // GEAR: creature-only per-limb natural-armour map (undefined for unarmoured beasts → no button).
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
            // Drag a box to highlight mobs; HUNT then queues the whole group for hunting.
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
