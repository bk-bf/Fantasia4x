<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import type { MoodModel } from './SelectedEntityCard.svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { pawnCultureLabel } from '$lib/components/util/pawnUtils';
  import { getActiveConditionViews } from '$lib/components/util/conditionInfo';
  import { getBackgroundById } from '$lib/game/core/defs/backgrounds';
  import { needMeters } from '../../pawn/needMeters';
  import ConditionRows from '../../pawn/ConditionRows.svelte';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import MeterRow from '../widget/MeterRow.svelte';
  import PanelTitle from '../widget/PanelTitle.svelte';
  import PawnSprite from '../widget/PawnSprite.svelte';
  import SkinBar from '../widget/SkinBar.svelte';
  import MoodPanel from '../canvas/MoodPanel.svelte';
  import { moodToggle } from '../canvas/moodToggle.svelte';
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
  <section class="card" {@attach chrome('card')}>
    <div class="c-top">
      <button
        class="portrait"
        aria-label="Open {pawn.name}"
        onclick={() => openPawnWindow(pawn.id, 'status')}
        {@attach chrome('well')}
      >
        <PawnSprite id={pawn.id} cultureId={pawn.cultureId} height={48} />
      </button>
      <div class="c-id">
        <PanelTitle>{pawn.name}</PanelTitle>
        <p>{line}</p>
        <p class="job">{job}</p>
      </div>
    </div>
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
        <MeterRow label={m.label} value={m.value / m.max} ramp={m.ramp}>{m.word}</MeterRow>
      {/each}
    </div>
    {#if conditions.length > 0}
      <div class="c-conds"><ConditionRows views={conditions} inline /></div>
    {/if}
    {#if selected}
      <div class="c-verbs">
        <ChromeButton glyph="sword" on={!!pawn.drafted} onclick={() => toggleDraft(pawn.id)}
          >Draft</ChromeButton
        >
        {#if pawn.drafted && onmove}<ChromeButton onclick={onmove}>Move</ChromeButton>{/if}
        <ChromeButton
          glyph="eye"
          on={following}
          onclick={() => uiState.setFollowPawn(following ? null : pawn.id)}>Follow</ChromeButton
        >
        <ChromeButton on={bodyOpen} onclick={() => uiState.toggleWindow('health')}
          >Body</ChromeButton
        >
        <ChromeButton on={moodToggle.open} onclick={() => (moodToggle.open = !moodToggle.open)}
          >Mood</ChromeButton
        >
        <ChromeButton onclick={() => openPawnWindow(pawn.id, 'gear')}>Gear</ChromeButton>
        {#if onfood}<ChromeButton on={foodOpen} onclick={onfood}>Food</ChromeButton>{/if}
      </div>
    {/if}
  </section>
  {#if selected && moodModel}<MoodPanel mood={moodModel} open={moodToggle.open} />{/if}
</div>

<style>
  .card-wrap {
    position: relative;
    pointer-events: auto;
  }
  .card {
    width: 344px;
    box-sizing: border-box;
    padding: 11px 13px;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  .c-top {
    display: flex;
    gap: 10px;
  }
  .portrait {
    flex: none;
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .c-id {
    flex: 1;
    min-width: 0;
  }
  .c-id :global(h3) {
    color: var(--text);
  }
  p {
    margin: 0;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  p.job {
    color: var(--accent-hi);
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
  .c-bars {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 12px;
    margin-top: 3px;
  }
  .c-bars :global(.meter-row em) {
    width: 48px;
  }
  .c-bars :global(.meter-row > span) {
    width: 52px;
  }
  .c-conds {
    margin-top: 6px;
  }
  .c-verbs {
    display: flex;
    gap: 4px;
    margin-top: 7px;
  }
  .c-verbs :global(.cbtn) {
    flex: 1;
    padding: 0 4px;
  }
</style>
