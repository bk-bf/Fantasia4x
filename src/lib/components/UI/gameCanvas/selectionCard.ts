// Selection-card builders for GameCanvas (P-4). Turn a pawn / mob into the SelectedEntityCard
// view model shown in the tile HUD. Extracted from GameCanvas as free functions; the bits that
// close over component-reactive state (the camera-follow ids) and the drag callback are threaded
// in via the `deps` argument, so the reactive `$:` blocks in GameCanvas re-run when they change.
import { uiState } from '$lib/stores/uiState.js';
import { gameState } from '$lib/stores/gameState.js';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService.js';
import { type CreatureDefinition } from '$lib/game/core/Creatures.js';
import type { Pawn, Mob } from '$lib/game/core/types.js';
import type {
  SelectedEntityModel,
  EntityBar,
  EntityButton,
  EntityStat
} from '$lib/components/UI/SelectedEntityCard.svelte';

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

/** Toggle a pawn's drafted flag (clears its job + draft target). */
export function toggleDraft(pawnId: string) {
  gameState.updateWithSave((state) => ({
    ...state,
    pawns: state.pawns.map((p) =>
      p.id === pawnId
        ? {
            ...p,
            drafted: !p.drafted,
            draftTarget: undefined,
            activeJob: undefined,
            currentState: 'Idle'
          }
        : p
    )
  }));
}

/** Toggle a mob's markedForHunt flag. */
export function toggleHuntMark(mobId: string) {
  gameState.updateWithSave((state) => ({
    ...state,
    mobs: (state.mobs ?? []).map((m) =>
      m.id === mobId ? { ...m, markedForHunt: !m.markedForHunt } : m
    )
  }));
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
  const stats: EntityStat[] = [
    { label: 'HP', value: Math.floor(pawn.state.health ?? 100) },
    { label: 'Mood', value: Math.floor(pawn.state.mood) }
  ];
  const painPct = Math.round(pawn.pain ?? 0);
  if (painPct > 0) stats.push({ label: 'PAIN', value: painPct, warn: painPct >= 55 });
  return {
    name: pawn.name + entityDebugLabel(pawn),
    status: pawnStateLabel(pawn),
    selected,
    dismissable: selected,
    stats,
    bars,
    job: pawn.activeJob
      ? {
          text: `→ ${pawnStateLabel(pawn)}${
            pawn.activeJob.resourceId ? ` ${jobResourceName(pawn.activeJob.resourceId)}` : ''
          }`
        }
      : { text: '→ Idle', idle: true },
    // Sleeping has no task to "complete" (it's need-driven), so don't show a progress bar for it.
    progressBar:
      pawn.activeJob && pawn.currentState !== 'Sleeping'
        ? jobProgressBar(pawn.activeJob.progress ?? 0)
        : undefined,
    pos: selected ? (pawn.position ?? undefined) : undefined,
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
  return {
    name: def.name + entityDebugLabel(mob),
    status: mob.state,
    selected,
    dismissable: selected,
    stats: [
      {
        label: 'HP',
        value: `${Math.floor(mob.health)}/${mob.maxHealth}`,
        warn: mob.health < mob.maxHealth * 0.35
      },
      { label: 'STR', value: mob.stats.strength },
      { label: 'DEX', value: mob.stats.dexterity }
    ],
    bars: [
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
    ] satisfies EntityBar[],
    note: `${def.entityClass === 'mob' ? '⚔ hostile' : '◆ neutral'} · ${def.behaviour}${
      def.tameable ? ' · tameable' : ''
    }`,
    pos: selected ? { x: mob.x, y: mob.y } : undefined,
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
