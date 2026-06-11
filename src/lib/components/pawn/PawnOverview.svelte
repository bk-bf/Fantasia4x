<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import type { GameState } from '$lib/game/core/types';
  import {
    getMoodColor,
    getMoodDescription,
    getHealthColor,
    getHealthDescription,
    getPawnTaskSummary
  } from '$lib/utils/pawnUtils';
  import { pawnService } from '$lib/game/services/PawnService';
  import PawnStance from './PawnStance.svelte';

  export let pawn: Pawn;
  export let gameState: GameState;

  $: taskSummary = getPawnTaskSummary(pawn, gameState);
  $: moveSpeed = pawnService.getMoveSpeed(pawn);

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
  <div class="section-hdr">| {pawn.name.toUpperCase()}</div>

  <!-- Core stats grid -->
  <div class="stats-grid">
    <div class="stat-cell">
      <span class="stat-lbl">STR</span>
      <span class="stat-val">{pawn.stats.strength}</span>
    </div>
    <div class="stat-cell">
      <span class="stat-lbl">DEX</span>
      <span class="stat-val">{pawn.stats.dexterity}</span>
    </div>
    <div class="stat-cell">
      <span class="stat-lbl">CON</span>
      <span class="stat-val">{pawn.stats.constitution}</span>
    </div>
    <div class="stat-cell">
      <span class="stat-lbl">INT</span>
      <span class="stat-val">{pawn.stats.intelligence}</span>
    </div>
    <div class="stat-cell">
      <span class="stat-lbl">PER</span>
      <span class="stat-val">{pawn.stats.perception}</span>
    </div>
    <div class="stat-cell">
      <span class="stat-lbl">CHA</span>
      <span class="stat-val">{pawn.stats.charisma}</span>
    </div>
  </div>

  <div class="row">
    <span class="lbl">STATE</span>
    <span class="val" style="color: {stateColor(pawn.currentState)}"
      >{taskSummary.currentState}</span
    >
  </div>
  <PawnStance {pawn} />
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
    <span class="lbl">SIZE</span><span class="val">{pawn.physicalTraits.size}</span>
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
      >{pawn.state.health ?? 100}% — {getHealthDescription(pawn.state.health ?? 100)}</span
    >
  </div>
</div>

<style>
  .pawn-overview {
    border-bottom: 1px solid var(--border);
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
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

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }

  .stat-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 2px 0;
  }

  .stat-lbl {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.04em;
  }

  .stat-val {
    color: var(--accent-hi);
    font-size: 12px;
    font-weight: 600;
  }
</style>
