<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import type { GameState } from '$lib/game/core/types';
  import {
    getMoodColor,
    getMoodDescription,
    getHealthColor,
    getHealthDescription,
    getPawnTaskSummary
  } from '$lib/components/util/pawnUtils';
  import { pawnService } from '$lib/game/services/PawnService';
  import { sizeFromHeight } from '$lib/game/core/Culture';
  import PawnStance from './PawnStance.svelte';
  import PawnRestPolicy from './PawnRestPolicy.svelte';
  import PawnForceWork from './PawnForceWork.svelte';
  import PawnGrowthPanel from './PawnGrowthPanel.svelte';
  import { DAYS_PER_SEASON } from '$lib/game/services/EnvironmentService';

  export let pawn: Pawn;
  export let gameState: GameState;

  // PAWN-GROWTH: name the pawn's fixed birthday (season + day within it) for the AGE row's tooltip.
  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  $: birthdayLabel =
    pawn.birthDayOfYear != null
      ? `born ${SEASONS[Math.floor(pawn.birthDayOfYear / DAYS_PER_SEASON)]} day ${
          (pawn.birthDayOfYear % DAYS_PER_SEASON) + 1
        }`
      : '';

  $: taskSummary = getPawnTaskSummary(pawn, gameState);
  $: moveSpeed = pawnService.getMoveSpeed(pawn);
  // Culture overhaul: surface the pawn's culture + archetype (colonies are mixed now).
  $: culture = gameState.culturePool?.find((r) => r.id === pawn.cultureId);
  $: cultureLabel = pawn.cultureName
    ? `${pawn.cultureName}${culture?.archetype ? ` · ${culture.archetype}` : ''}`
    : 'unknown';

  function stateColor(state: string | undefined): string {
    const normalized = (state ?? 'Idle').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    switch (normalized) {
      case 'working':
      case 'moving_to_resource':
      case 'moving_to_deposit':
      case 'moving_to_need':
        return '#4a9';
      case 'hungry':
      case 'eating':
        return '#f44';
      case 'tired':
      case 'sleeping':
        return '#fa0';
      default:
        return 'var(--text-muted)';
    }
  }
</script>

<!-- Pawn Overview -->
<div class="pawn-overview">
  <div class="section-hdr">| STATUS</div>

  <!-- PAWN-GROWTH: pending growth offer(s) surface here for the pick-two. -->
  <PawnGrowthPanel {pawn} />

  <div class="row">
    <span class="lbl">CULTURE</span>
    <span class="val culture-val" title={culture?.lore?.epithet ?? ''}>{cultureLabel}</span>
  </div>
  {#if pawn.age != null}
    <div class="row">
      <span class="lbl">AGE</span><span class="val" title={birthdayLabel}>{pawn.age} yrs</span>
    </div>
  {/if}
  <div class="row">
    <span class="lbl">STATE</span>
    <span class="val" style="color: {stateColor(pawn.currentState)}"
      >{taskSummary.currentState}</span
    >
  </div>
  <PawnStance {pawn} />
  <PawnRestPolicy {pawn} />
  <PawnForceWork {pawn} />
  <div class="row">
    <span class="lbl">WORK</span><span class="val">{taskSummary.workAssignment}</span>
  </div>
  <div class="row">
    <span class="lbl">TASK</span><span class="val">{taskSummary.currentTask}</span>
  </div>
  <div class="row">
    <span class="lbl">NEXT</span><span class="val">{taskSummary.nextTask}</span>
  </div>
  <div class="row">
    <span class="lbl">SPEED</span>
    <span class="val" title={moveSpeed.sources.join('  ')}
      >{moveSpeed.tilesPerSecond.toFixed(1)} t/s</span
    >
  </div>
  <div class="row">
    <span class="lbl">HEIGHT</span><span class="val">{pawn.physicalTraits.height}cm</span>
  </div>
  <div class="row">
    <span class="lbl">WEIGHT</span><span class="val">{pawn.physicalTraits.weight}kg</span>
  </div>
  <div class="row">
    <span class="lbl">SIZE</span><span class="val"
      >{sizeFromHeight(pawn.physicalTraits.height)}</span
    >
  </div>
  <div class="row">
    <span class="lbl">MOOD</span>
    <span class="val" style="color: {getMoodColor(pawn.state.mood)}"
      >{Math.round(pawn.state.mood)}% — {getMoodDescription(pawn.state.mood)}</span
    >
  </div>
  <div class="row">
    <span class="lbl">HEALTH</span>
    <span class="val" style="color: {getHealthColor(pawn.state.health ?? 100)}"
      >{Math.round(pawn.state.health ?? 100)}% — {getHealthDescription(
        pawn.state.health ?? 100
      )}</span
    >
  </div>
</div>

<style>
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 12px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }

  .row {
    display: flex;
    padding: 2px 8px;
    align-items: baseline;
    gap: 6px;
  }
  .row:hover {
    background: var(--bg-hover);
  }

  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    min-width: 80px;
    flex-shrink: 0;
  }

  .val {
    color: var(--text);
    margin-left: auto;
    text-align: right;
  }
  .culture-val {
    color: var(--accent-hi);
    font-weight: bold;
    letter-spacing: 0.03em;
  }
</style>
