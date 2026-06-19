// Selection-card builders for GameCanvas (P-4). Turn a pawn / mob into the SelectedEntityCard
// view model shown in the tile HUD. Extracted from GameCanvas as free functions; the bits that
// close over component-reactive state (the camera-follow ids) and the drag callback are threaded
// in via the `deps` argument, so the reactive `$:` blocks in GameCanvas re-run when they change.
import { uiState } from '$lib/stores/uiState.js';
import { gameState } from '$lib/stores/gameState.js';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService.js';
import { type CreatureDefinition, getCreatureById } from '$lib/game/core/Creatures.js';
import type { Pawn, Mob, LimbId, Injury } from '$lib/game/core/types.js';
import { getActiveConditionViews } from '$lib/utils/conditionInfo.js';
import { pawnService } from '$lib/game/services/PawnService.js';
import { pawnStatService } from '$lib/game/services/PawnStatService.js';
import { itemService } from '$lib/game/services/ItemService.js';
import { getConditionCurrentStage } from '$lib/game/core/needs.js';
import type {
  SelectedEntityModel,
  EntityBar,
  EntityButton,
  EntityStat,
  HealthModel,
  HealthLimb,
  HealthPart,
  HealthWound,
  CombatStat
} from '$lib/components/UI/SelectedEntityCard.svelte';

/** Short limb labels for the HEALTH view. */
const LIMB_LABEL: Record<LimbId, string> = {
  head: 'Head',
  torso: 'Torso',
  left_arm: 'L.Arm',
  right_arm: 'R.Arm',
  left_leg: 'L.Leg',
  right_leg: 'R.Leg'
};

/** "leftUpperArm" → "left upper arm" for per-part labels. */
function prettyPart(id: string): string {
  return id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toLowerCase());
}

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

function combatStats(entity: Pawn | Mob): CombatStat[] {
  const s = (id: string) => pawnStatService.evaluateStat(id, entity);
  // The live `encumbered` condition (set by the sim from worn-armour + pack load ÷ capacity) carries
  // the dodge/move/aim penalty — read its active stage so the panel matches what combat applies.
  const encCond = ('conditions' in entity ? entity.conditions : undefined)?.find(
    (c) => c.id === 'encumbered'
  );
  const encStage = encCond ? getConditionCurrentStage(encCond) : undefined;
  const dodge = s('dodge') * (encStage?.modifiers.dodge ?? 1);
  const armor = bestArmorDefense(entity);
  const out: CombatStat[] = [
    { label: 'Hit', value: `×${s('hit_chance').toFixed(2)}`, title: 'melee accuracy (× sight × manipulation)' },
    {
      label: 'Dodge',
      value: `×${dodge.toFixed(2)}`,
      title: encStage
        ? `evasion, including −${Math.round((1 - (encStage.modifiers.dodge ?? 1)) * 100)}% from being ${encStage.label}`
        : 'evasion multiplier (× moving; lower when injured)'
    },
    { label: 'Crit', value: `${Math.round(s('crit_chance') * 100)}%`, title: 'base crit chance (weapons add their own)' },
    { label: 'Armor', value: `${armor}`, title: 'best armour (worn, or a creature’s natural hide) — % of a hit it turns before armour-pen' }
  ];
  if (encCond) {
    // Reconstruct the load ratio from severity (sev = (ratio−0.8)/0.6) for a readable %.
    const ratio = 0.8 + encCond.severity * 0.6;
    out.push({
      label: 'Load',
      value: `${Math.round(ratio * 100)}% · ${encStage?.label ?? ''}`.trim(),
      title: 'carried weight (worn armour + pack) ÷ carry capacity — past ~100% encumbers: slower, easier to hit, worse aim. STR + bags raise the limit.'
    });
  }
  // Ranged potential (PER = precision, DEX = speed, STR = draw power) — shown for every pawn so a
  // build reads at a glance whether they'd make an archer (PER), a crossbowman (DEX), etc.
  out.push(
    { label: 'Aim', value: `×${s('aim_accuracy').toFixed(2)}`, title: 'ranged accuracy — PER (precision)' },
    { label: 'Fire', value: `×${s('aim_speed').toFixed(2)}`, title: 'ranged fire-rate — DEX (speed)' },
    { label: 'Reach', value: `×${s('aim_range').toFixed(2)}`, title: 'ranged reach — PER, capped by vision' },
    { label: 'Reload', value: `×${s('reload_speed').toFixed(2)}`, title: 'crossbow reload — DEX' },
    { label: 'Shot', value: `×${s('ranged_damage').toFixed(2)}`, title: 'bow/throw damage — STR (draw/throw power)' }
  );
  return out;
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
      parts.push({
        label: prettyPart(part.id),
        health: part.health,
        maxHp: part.maxHp,
        wounds: part.injuries.map((inj) => ({
          text: `${inj.type} (${inj.severity})${inj.infected ? ' · infected' : ''}`,
          warn: woundWarn(inj)
        }))
      });
    }
    const damaged =
      limb.isMissing || Math.round(limb.health) < 100 || limb.bleedRate > 0 || parts.length > 0;
    if (!damaged) continue;
    limbs.push({
      label: LIMB_LABEL[limb.id] ?? limb.id,
      health: limb.health,
      missing: limb.isMissing,
      bleedRate: limb.bleedRate,
      parts
    });
  }

  return {
    blood:
      entity.bloodVolume != null && entity.maxBloodVolume != null
        ? { current: entity.bloodVolume, max: entity.maxBloodVolume }
        : undefined,
    pain: entity.pain,
    // SEASONS_WEATHER: tracked cold/heat exposure meters (pawns) — surfaced as % next to Blood.
    coldExposure: entity.needs?.coldExposure,
    heatExposure: entity.needs?.heatExposure,
    combat: combatStats(entity),
    limbs
  };
}

/** Debug `#id` suffix shown next to entity names when VITE_DEBUG_MODE is on. */
export function entityDebugLabel(entity: { id: string; debugId?: number }): string {
  if (import.meta.env.VITE_DEBUG_MODE !== 'true') return '';
  if (entity.debugId != null) return ` #${entity.debugId}`;
  const m = entity.id.match(/(\d+)(?!.*\d)/);
  return m ? ` #${m[1]}` : ` #${entity.id.slice(-4)}`;
}

/** Human-readable label for a pawn's current FSM state / active job. */
export function pawnStateLabel(p: Pawn): string {
  const s = p.currentState ?? 'Idle';
  if (s === 'Working' && p.activeJob) {
    const t = p.activeJob.type;
    if (t === 'harvest') return 'Harvesting';
    if (t === 'haul') return 'Hauling';
    if (t === 'construct') return 'Building';
    if (t === 'craft') return 'Crafting';
  }
  return s.replace(/([A-Z])/g, ' $1').trim();
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
}

/** Reactive deps + drag callback for {@link buildMobCard}. */
export interface MobCardDeps {
  cameraFollowMobId: string | null;
  startHuntDrag: (mob: Mob) => void;
}

export function buildPawnCard(
  pawn: Pawn,
  selected: boolean,
  deps: PawnCardDeps
): SelectedEntityModel {
  const { cameraFollowPawnId } = deps;
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
  // SEASONS_WEATHER: how soaked the pawn is, as a body-state bar like BLOOD (blue = water). This
  // replaces the old redundant job line — the activity is already shown by the [state] tag + pills.
  bars.push({
    label: 'WETNESS',
    value: Math.round(pawn.needs.wetness ?? 0),
    color: '#4FA3D1'
  });
  // No flat "HP" stat: the body model (limbs/blood/pain) is the real health — see the HEALTH popup.
  // Mood moves to the header (right of the name); MOVE shows current movement speed.
  const stats: EntityStat[] = [moveSpeedStat(pawn)];
  return {
    name: pawn.name + entityDebugLabel(pawn),
    status: pawnStateLabel(pawn),
    selected,
    dismissable: selected,
    mood: Math.floor(pawn.state.mood),
    stats,
    conditionViews: getActiveConditionViews(pawn),
    bars,
    // (No `job` line: it just repeated the [state] tag next to the name — replaced by the WETNESS bar.)
    // Only show a bar for states that also draw one above the pawn's head (Working / eat / drink /
    // wash). Moving/Idle/Sleeping have no in-place task to complete, so no bar.
    progress:
      pawn.activeJob && pawn.currentState != null && PROGRESS_BAR_STATES.has(pawn.currentState)
        ? (pawn.activeJob.progress ?? 0)
        : undefined,
    pos: selected ? (pawn.position ?? undefined) : undefined,
    // Built for hover cards too so the shared HEALTH toggle works on hover, not just selection.
    health: buildHealthModel(pawn),
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

export function buildMobCard(
  mob: Mob,
  def: CreatureDefinition,
  selected: boolean,
  deps: MobCardDeps
): SelectedEntityModel {
  const { cameraFollowMobId, startHuntDrag } = deps;
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
  return {
    name: def.name + entityDebugLabel(mob),
    status: mob.state,
    selected,
    dismissable: selected,
    // No flat "HP" stat: the body model (limbs/blood/pain) is the real health — see the HEALTH popup.
    stats: [
      { label: 'STR', value: mob.stats.strength },
      { label: 'DEX', value: mob.stats.dexterity },
      moveSpeedStat(mob)
    ],
    conditionViews: getActiveConditionViews(mob),
    bars,
    note: `${def.entityClass === 'mob' ? '⚔ hostile' : '◆ neutral'} · ${def.behaviour}${
      def.tameable ? ' · tameable' : ''
    }`,
    pos: selected ? { x: mob.x, y: mob.y } : undefined,
    // Built for hover cards too so the shared HEALTH toggle works on hover, not just selection.
    health: buildHealthModel(mob),
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
            onClick: () => startHuntDrag(mob)
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
