<script lang="ts">
  import type { GameState, Pawn, StatusEffectDef } from '$lib/game/core/types';
  import { getNeedColor, getNeedDescription } from '$lib/utils/pawnUtils';
  import { getPawnTaskSummary } from '$lib/utils/pawnUtils';
  import statusEffectsData from '$lib/game/database/status-effects.jsonc';

  const STATUS_EFFECTS_DB = statusEffectsData as unknown as StatusEffectDef[];

  export let pawn: Pawn;
  export let gameState: GameState;

  $: needs = pawn.needs;
  $: taskSummary = getPawnTaskSummary(pawn, gameState);
  $: activeEffects = (pawn.activeEffects ?? [])
    .map((id) => STATUS_EFFECTS_DB.find((e) => e.id === id))
    .filter((e): e is StatusEffectDef => e !== undefined);

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

<div class="needs-section">
  <div class="section-hdr">| NEEDS</div>

  <div class="need-row">
    <span class="lbl">HUNGER</span>
    <div class="bar">
      <div
        class="fill"
        style="width: {needs.hunger}%; background: {getNeedColor(needs.hunger)}"
      ></div>
    </div>
    <span class="val" style="color: {getNeedColor(needs.hunger)}">{Math.round(needs.hunger)}%</span>
    <span class="desc">{getNeedDescription('hunger', needs.hunger)}</span>
  </div>

  <div class="need-row">
    <span class="lbl">REST</span>
    <div class="bar">
      <div
        class="fill"
        style="width: {needs.fatigue}%; background: {getNeedColor(needs.fatigue)}"
      ></div>
    </div>
    <span class="val" style="color: {getNeedColor(needs.fatigue)}"
      >{Math.round(needs.fatigue)}%</span
    >
    <span class="desc">{getNeedDescription('fatigue', needs.fatigue)}</span>
  </div>

  <div class="section-hdr sub">| STATUS TRACKER</div>

  {#if activeEffects.length > 0}
  <div class="effects-row">
    {#each activeEffects as effect}
    <div class="effect-card" style="border-color: {effect.color}; color: {effect.color}" title={effect.description}>
      <span class="effect-name">{effect.name.toUpperCase()}</span>
    </div>
    {/each}
  </div>
  {/if}

  <div class="row">
    <span class="lbl">STATE</span>
    <span class="val full state" style="color: {stateColor(pawn.currentState)}"
      >{taskSummary.currentState}</span
    >
  </div>
  <div class="row">
    <span class="lbl">TASK</span><span class="val full">{taskSummary.currentTask}</span>
  </div>
  <div class="row">
    <span class="lbl">NEXT</span><span class="val full">{taskSummary.nextTask}</span>
  </div>
  <div class="row">
    <span class="lbl">WORK</span><span class="val full">{taskSummary.workAssignment}</span>
  </div>

  <!-- TODO: draft-control mode will re-enable direct REST/EAT/WORK/IDLE commands later.
  <div class="btn-row">
    <button class="act-btn">REST</button>
    <button class="act-btn">EAT</button>
    <button class="act-btn">WORK</button>
    <button class="act-btn">IDLE</button>
  </div>
  -->
</div>

<style>
  .needs-section {
    border-bottom: 1px solid var(--border);
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 1px;
  }
  .section-hdr.sub {
    background: var(--bg);
    color: var(--text-dim);
    border-top: none;
  }

  .need-row {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    gap: 8px;
  }
  .need-row:hover {
    background: var(--bg-hover);
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
    font-size: 11px;
    width: 70px;
    flex-shrink: 0;
  }
  .val {
    color: var(--text);
    font-size: 11px;
    width: 36px;
    text-align: right;
    flex-shrink: 0;
  }
  .val.full {
    width: auto;
    margin-left: auto;
    text-align: left;
  }

  .state {
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .desc {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    flex: 1;
  }

  .bar {
    flex: 1;
    height: 4px;
    background: var(--bg-active);
  }
  .fill {
    height: 100%;
  }

  .effects-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 8px;
  }

  .effect-card {
    border: 1px solid;
    padding: 1px 6px;
    font-size: 10px;
    letter-spacing: 0.06em;
    background: color-mix(in srgb, currentColor 8%, var(--bg));
    cursor: default;
  }

  .effect-name {
    font-weight: bold;
  }
</style>
