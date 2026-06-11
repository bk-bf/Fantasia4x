<script lang="ts" module>
  export interface EntityStat {
    label: string;
    value: string | number;
    warn?: boolean;
  }

  export interface EntityBar {
    label: string;
    /** Current value (0–max). */
    value: number;
    /** Maximum (defaults to 100). */
    max?: number;
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
    /** Block-character meter bars (Food, Blood, …). */
    bars?: EntityBar[];
    /** Activity / job line. `idle` greys it out. */
    job?: { text: string; idle?: boolean };
    /** Pre-formatted progress bar string (e.g. from jobProgressBar()). */
    progressBar?: string;
    /** Extra descriptive line (e.g. behaviour tags). */
    note?: string;
    /** Map position footer. */
    pos?: { x: number; y: number };
    /** Draft mode toggle — undefined = not a pawn / no draft support. */
    drafted?: boolean;
    /** Called when the draft button is clicked. */
    onDraftToggle?: () => void;
    /** Whether the camera is currently following this entity. undefined = not supported. */
    following?: boolean;
    /** Called when the follow button is clicked. */
    onFollowToggle?: () => void;
    /** Called when the view-tab button is clicked (jumps to pawns/entities screen). */
    onViewTab?: () => void;
  }
</script>

<script lang="ts">
  let { model }: { model: SelectedEntityModel } = $props();

  function blockBar(value: number, max: number, width = 8): string {
    const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }
</script>

<div
  class="tile-hud tile-hud--pawn"
  class:tile-hud--selected={model.selected}
  onmousedown={(e) => model.selected && e.stopPropagation()}
  onmouseup={(e) => model.selected && e.stopPropagation()}
  onclick={(e) => model.selected && e.stopPropagation()}
>
  <div class="pawn-header">
    <span class="pawn-name">{model.name}</span>
    {#if model.status}<span class="pawn-state">[{model.status}]</span>{/if}
    {#if model.dismissable}<span class="pawn-dismiss" title="Press Esc to deselect">◈</span>{/if}
    {#if model.onViewTab}
      <button
        class="hud-btn"
        onmousedown={(e) => e.stopPropagation()}
        onmouseup={(e) => e.stopPropagation()}
        onclick={(e) => {
          e.stopPropagation();
          model.onViewTab?.();
        }}
        title="Open in character screen"
      >
        VIEW
      </button>
    {/if}
    {#if model.following !== undefined && model.onFollowToggle}
      <button
        class="hud-btn"
        class:hud-btn--active={model.following}
        onmousedown={(e) => e.stopPropagation()}
        onmouseup={(e) => e.stopPropagation()}
        onclick={(e) => {
          e.stopPropagation();
          model.onFollowToggle?.();
        }}
        title={model.following ? 'Stop following' : 'Follow with camera'}
      >
        {model.following ? 'UNFOLLOW' : 'FOLLOW'}
      </button>
    {/if}
    {#if model.drafted !== undefined && model.onDraftToggle}
      <button
        class="hud-btn"
        class:hud-btn--active={model.drafted}
        onmousedown={(e) => e.stopPropagation()}
        onmouseup={(e) => e.stopPropagation()}
        onclick={(e) => {
          e.stopPropagation();
          model.onDraftToggle?.();
        }}
        title={model.drafted ? 'Click to undraft pawn' : 'Click to draft pawn'}
      >
        {model.drafted ? 'DRAFTED' : 'DRAFT'}
      </button>
    {/if}
  </div>

  {#if model.stats && model.stats.length > 0}
    <div class="pawn-row">
      {#each model.stats as stat (stat.label)}
        <span class="pawn-stat-label">{stat.label}</span>
        <span class="pawn-stat-val" class:pawn-warn={stat.warn}>{stat.value}</span>
      {/each}
    </div>
  {/if}

  {#if model.bars && model.bars.length > 0}
    <div class="bar-rows">
      {#each model.bars as bar (bar.label)}
        <div class="bar-row">
          <span class="bar-label">{bar.label}</span>
          <span class="bar-track" class:bar-warn={bar.warn}
            >[{blockBar(bar.value, bar.max ?? 100)}]</span
          >
          <span class="bar-val" class:bar-warn={bar.warn}>{Math.floor(bar.value)}%</span>
        </div>
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
    pointer-events: auto;
    white-space: nowrap;
    z-index: 5;
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
  .bar-rows {
    margin-top: 2px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .bar-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 9px;
  }
  .bar-label {
    color: #7a6030;
    min-width: 34px;
  }
  .bar-track {
    color: #68a030;
    letter-spacing: -0.5px;
  }
  .bar-val {
    color: #c08040;
    min-width: 24px;
  }
  .bar-warn .bar-track,
  .bar-warn .bar-val {
    color: #ee8844;
  }
  .bar-warn {
    color: #ee8844;
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
  .hud-btn {
    background: #2a1a0a;
    border: 1px solid #6b4a2a;
    color: #a07840;
    font-family: 'Courier New', monospace;
    font-size: 9px;
    padding: 1px 5px;
    cursor: pointer;
    pointer-events: auto;
    line-height: 1.3;
    position: relative;
    z-index: 20;
  }
  .hud-btn:hover {
    border-color: #c8a060;
    color: #c8a060;
  }
  .hud-btn--active {
    background: #4a2010;
    border-color: #ee8844;
    color: #ee8844;
  }
  .hud-btn--active:hover {
    background: #5a2814;
    border-color: #ffaa66;
    color: #ffaa66;
  }
  .pawn-idle {
    color: #887040;
  }
  .pawn-pos {
    color: #776040;
    font-size: 9px;
  }
</style>
