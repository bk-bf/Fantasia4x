<script lang="ts" module>
  export interface EntityStat {
    label: string;
    value: string | number;
    warn?: boolean;
  }

  export interface SelectedEntityModel {
    /** Display name shown in the header. */
    name: string;
    /** Bracketed status label, e.g. the current state. */
    status?: string;
    /** Gold-highlighted "selected/locked" styling. */
    selected?: boolean;
    /** Show the ◈ dismiss hint (Esc to deselect). */
    dismissable?: boolean;
    /** Inline stat readouts (HP, STR, …). */
    stats?: EntityStat[];
    /** Activity / job line. `idle` greys it out. */
    job?: { text: string; idle?: boolean };
    /** Pre-formatted progress bar string (e.g. from jobProgressBar()). */
    progressBar?: string;
    /** Extra descriptive line (e.g. behaviour tags). */
    note?: string;
    /** Map position footer. */
    pos?: { x: number; y: number };
  }
</script>

<script lang="ts">
  let { model }: { model: SelectedEntityModel } = $props();
</script>

<div class="tile-hud tile-hud--pawn" class:tile-hud--selected={model.selected}>
  <div class="pawn-header">
    <span class="pawn-name">{model.name}</span>
    {#if model.status}<span class="pawn-state">[{model.status}]</span>{/if}
    {#if model.dismissable}<span class="pawn-dismiss" title="Press Esc to deselect">◈</span>{/if}
  </div>

  {#if model.stats && model.stats.length > 0}
    <div class="pawn-row">
      {#each model.stats as stat (stat.label)}
        <span class="pawn-stat-label">{stat.label}</span>
        <span class="pawn-stat-val" class:pawn-warn={stat.warn}>{stat.value}</span>
      {/each}
    </div>
  {/if}

  {#if model.job}
    <div class="pawn-job" class:pawn-idle={model.job.idle}>{model.job.text}</div>
  {/if}
  {#if model.progressBar}
    <div class="pawn-progress">[{model.progressBar}]</div>
  {/if}
  {#if model.note}
    <div class="pawn-job">{model.note}</div>
  {/if}
  {#if model.pos}
    <div class="pawn-pos">pos ({model.pos.x},{model.pos.y})</div>
  {/if}
</div>

<style>
  .tile-hud {
    position: absolute;
    bottom: 6px;
    left: 6px;
    background: rgba(28, 16, 6, 0.92);
    border: 1px solid #6b4a2a;
    color: #a07840;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    line-height: 1.5;
    padding: 2px 7px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 10;
  }
  .tile-hud--pawn {
    min-width: 180px;
    white-space: nowrap;
  }
  .pawn-header {
    display: flex;
    gap: 6px;
    align-items: baseline;
    margin-bottom: 2px;
  }
  .pawn-name {
    color: #c8a060;
    font-weight: bold;
    font-size: 11px;
  }
  .pawn-state {
    color: #7a6030;
    font-size: 9px;
  }
  .pawn-row {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: 9px;
  }
  .pawn-stat-label {
    color: #7a6030;
  }
  .pawn-stat-val {
    color: #c08040;
    min-width: 18px;
  }
  .pawn-warn {
    color: #ee8844 !important;
  }
  .pawn-job {
    color: #8a7040;
    font-size: 9px;
    margin-top: 1px;
  }
  .pawn-progress {
    color: #8a7040;
    font-size: 9px;
  }
  .tile-hud--selected {
    border-color: #f0c060;
    background: rgba(20, 14, 4, 0.96);
    color: #e8c870;
    min-width: 200px;
  }
  .tile-hud--selected .pawn-name {
    color: #ffe890;
  }
  .tile-hud--selected .pawn-state {
    color: #c0a040;
  }
  .pawn-dismiss {
    margin-left: auto;
    color: #886630;
    font-size: 9px;
  }
  .pawn-idle {
    color: #887040;
  }
  .pawn-pos {
    color: #776040;
    font-size: 9px;
  }
</style>
