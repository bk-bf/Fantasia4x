<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import type { MoodModel } from './entityCard';
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { pawnCultureLabel } from '$lib/components/util/pawnUtils';
  import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
  import { getBackgroundById } from '$lib/game/core/defs/backgrounds';
  import { needMeters } from '../../pawn/needMeters';
  import ConditionRows from '../../pawn/ConditionRows.svelte';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import HudCard from './HudCard.svelte';
  import MeterRow from '../widget/MeterRow.svelte';
  import PawnSprite from '../widget/PawnSprite.svelte';
  import SkinBar from '../widget/SkinBar.svelte';
  import {
    openPawnWindow,
    pawnStateLabel,
    PROGRESS_BAR_STATES,
    toggleDraft
  } from '../canvas/selectionCard';

  let {
    pawn,
    selected,
    moodModel,
    foodOpen = false,
    onmove,
    onfood
  }: {
    pawn: Pawn;
    selected: boolean;
    moodModel?: MoodModel;
    foodOpen?: boolean;
    onmove?: () => void;
    onfood?: () => void;
  } = $props();

  const line = $derived(
    [pawnCultureLabel(pawn, $gameState?.culturePool), getBackgroundById(pawn.adulthoodId)?.title]
      .filter(Boolean)
      .join(' · ')
  );
  const job = $derived(
    pawn.socialBreak
      ? pawn.socialBreak.kind === 'crisis'
        ? 'In crisis'
        : 'On a break'
      : pawnStateLabel(pawn)
  );
  const progress = $derived(
    pawn.activeJob && pawn.currentState != null && PROGRESS_BAR_STATES.has(pawn.currentState)
      ? (pawn.activeJob.progress ?? 0)
      : null
  );
  const health = $derived(Math.round(pawn.state.health ?? 100));
  const mood = $derived(Math.round(moodModel?.mood ?? pawn.state.mood));
  const needs = $derived(
    needMeters(pawn).filter((m) => m.label === 'Hunger' || m.label === 'Rest')
  );
  const conditions = $derived(getActiveConditionViews(pawn));
  const following = $derived($uiState.cameraFollowPawnId === pawn.id);
  const bodyOpen = $derived($uiState.windows.includes('health'));
  const moodOpen = $derived($uiState.windows.includes('mood'));

  function select(e: MouseEvent) {
    e.stopPropagation();
    if (selected) return;
    uiState.selectPawn(pawn.id);
    uiState.selectMob(null);
  }
</script>

<div
  class="card-wrap"
  role="presentation"
  onmousedown={select}
  onmouseup={(e) => e.stopPropagation()}
>
  <HudCard
    title={pawn.name}
    wellLabel="Open {pawn.name}"
    onwell={() => openPawnWindow(pawn.id, 'status')}
    verbs={selected ? pawnVerbs : undefined}
  >
    {#snippet well()}<PawnSprite id={pawn.id} cultureId={pawn.cultureId} height={48} />{/snippet}
    {#snippet lines()}<p>{line}</p>
      <p class="hot">{job}</p>{/snippet}
    {#if progress != null}
      <div class="prog">
        <SkinBar value={progress} ramp="ember" />
        <span>{Math.round(progress * 100)}%</span>
      </div>
    {/if}
    <div class="c-bars">
      <MeterRow label="Health" value={health / 100} ramp="leaf">{health}</MeterRow>
      <MeterRow label="Mood" value={mood / 100} ramp="honey">{mood}</MeterRow>
      {#each needs as m (m.label)}
        <MeterRow label={m.label} value={m.value / m.max} ramp={m.ramp} title={m.word}
          >{m.word}</MeterRow
        >
      {/each}
    </div>
    {#if conditions.length > 0}
      <div class="c-conds"><ConditionRows views={conditions} inline /></div>
    {/if}
  </HudCard>
</div>

{#snippet pawnVerbs()}
  <ChromeButton glyph="sword" on={!!pawn.drafted} onclick={() => toggleDraft(pawn.id)}
    >Draft</ChromeButton
  >
  {#if pawn.drafted && onmove}<ChromeButton onclick={onmove}>Move</ChromeButton>{/if}
  <ChromeButton
    glyph="eye"
    on={following}
    onclick={() => uiState.setFollowPawn(following ? null : pawn.id)}>Follow</ChromeButton
  >
  <ChromeButton on={bodyOpen} onclick={() => uiState.toggleWindow('health')}>Body</ChromeButton>
  <ChromeButton on={moodOpen} onclick={() => uiState.toggleWindow('mood')}>Mood</ChromeButton>
  <ChromeButton onclick={() => openPawnWindow(pawn.id, 'gear')}>Gear</ChromeButton>
  {#if onfood}<ChromeButton on={foodOpen} onclick={onfood}>Food</ChromeButton>{/if}
{/snippet}

<style>
  .card-wrap {
    position: relative;
    pointer-events: auto;
  }
  .prog {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 18px;
    margin-top: 4px;
  }
  .prog span {
    flex: none;
    width: 34px;
    text-align: right;
    color: var(--accent-hi);
  }
</style>
