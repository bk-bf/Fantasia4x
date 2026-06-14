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
    /** Explicit bar colour. Falls back to warn-red / default-green when omitted. */
    color?: string;
    /** Right-hand readout. Defaults to `<rounded>%`. */
    valueText?: string;
  }

  export interface EntityButton {
    label: string;
    onClick: () => void;
    /** Highlighted/active state (e.g. UNFOLLOW, DRAFTED). */
    active?: boolean;
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
    /** Free-form text lines rendered below the header (description, progress, refund, etc.). */
    lines?: string[];
    /** Action buttons shown in a 3-column grid. Only rendered on selected cards. */
    buttons?: EntityButton[];
    /** Called when a non-selected hover card is clicked (to select the entity). */
    onSelect?: () => void;
  }
</script>

<script lang="ts">
  import StatBar from './StatBar.svelte';

  let { model }: { model: SelectedEntityModel } = $props();

  // Bar colours when an EntityBar doesn't specify its own: red on warn, green otherwise.
  const BAR_WARN = '#ee8844';
  const BAR_OK = '#68a030';
</script>

<!--
  Always stop mousedown/mouseup from reaching the canvas so canvas drag/click
  handlers never fire when the user interacts with any HUD card (fixes the
  FOLLOW/UNFOLLOW glitch that deselected the pawn via handleTileClick).
  Hover cards use onSelect to forward the "select entity" action instead.
-->
<!-- NT-U2: the action buttons sit in their own column to the RIGHT of and OUTSIDE the
     bordered info box. NT-U3: the info box is a fixed-width skeleton so long descriptions
     wrap inside it instead of stretching the panel across the viewport. The wrapper carries
     the absolute positioning so both columns stay anchored together. -->
<div
  class="tile-hud-wrap"
  onmousedown={(e) => {
    e.stopPropagation();
    if (!model.selected) model.onSelect?.();
  }}
  onmouseup={(e) => e.stopPropagation()}
  onclick={(e) => e.stopPropagation()}
>
  <div class="tile-hud tile-hud--pawn" class:tile-hud--selected={model.selected}>
    <div class="pawn-header">
      <div class="pawn-meta">
        <span class="pawn-name">{model.name}</span>
        {#if model.status}<span class="pawn-state">[{model.status}]</span>{/if}
        {#if model.dismissable}<span class="pawn-dismiss" title="Press Esc to deselect">◈</span
          >{/if}
      </div>
    </div>

    {#if model.lines && model.lines.length > 0}
      <div class="text-lines">
        {#each model.lines as line}
          <div class="text-line">{line}</div>
        {/each}
      </div>
    {/if}

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
          <StatBar
            label={bar.label}
            value={bar.value}
            max={bar.max ?? 100}
            color={bar.color ?? (bar.warn ? BAR_WARN : BAR_OK)}
            valueText={bar.valueText ?? `${Math.floor(bar.value)}%`}
          />
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

  {#if model.buttons && model.buttons.length > 0}
    <div class="btn-col">
      {#each model.buttons as btn (btn.label)}
        <button
          class="hud-btn"
          class:hud-btn--active={btn.active}
          onmousedown={(e) => e.stopPropagation()}
          onmouseup={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation();
            btn.onClick();
          }}
        >
          {btn.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Wrapper anchors the card to the canvas; the info box and the button column are its
     two children laid out side by side (NT-U2). */
  .tile-hud-wrap {
    position: absolute;
    bottom: 6px;
    left: 6px;
    display: flex;
    align-items: flex-start;
    gap: 4px;
    pointer-events: auto;
    z-index: 5;
  }
  .tile-hud {
    background: rgba(28, 16, 6, 0.92);
    border: 1px solid #6b4a2a;
    color: #a07840;
    font-family: 'Courier New', monospace;
    font-size: 9px;
    line-height: 1.25;
    padding: 2px 7px;
    pointer-events: auto;
  }
  /* NT-U3: fixed-width skeleton, identical for every object type, so long descriptions
     wrap inside the box instead of stretching it across the map. */
  .tile-hud--pawn {
    width: 232px;
    box-sizing: border-box;
  }
  .pawn-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 2px;
  }
  .pawn-meta {
    display: flex;
    align-items: baseline;
    gap: 5px;
    flex-wrap: wrap;
  }
  .pawn-name {
    color: #c8a060;
    font-weight: bold;
    font-size: 10px;
  }
  .pawn-state {
    color: #7a6030;
    font-size: 9px;
  }
  .pawn-dismiss {
    color: #886630;
    font-size: 9px;
  }
  /* ── Button column (NT-U2: outside the box, to the right) ────── */
  .btn-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex-shrink: 0;
    pointer-events: auto;
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
    white-space: nowrap;
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
  /* ── Text lines (description, progress, refund, etc.) ───────── */
  .text-lines {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-bottom: 2px;
  }
  .text-line {
    color: #c0a040;
    font-size: 9px;
    white-space: normal;
    overflow-wrap: break-word;
  }
  /* ── Stats / bars ─────────────────────────────────────────────── */
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
  .pawn-job {
    color: #8a7040;
    font-size: 9px;
    margin-top: 1px;
    white-space: normal;
    overflow-wrap: break-word;
  }
  .pawn-progress {
    color: #8a7040;
    font-size: 9px;
  }
  .tile-hud--selected {
    border-color: #f0c060;
    background: rgba(20, 14, 4, 0.96);
    color: #e8c870;
  }
  .tile-hud--selected .pawn-name {
    color: #ffe890;
  }
  .tile-hud--selected .pawn-state {
    color: #c0a040;
  }
  .pawn-idle {
    color: #887040;
  }
  .pawn-pos {
    color: #776040;
    font-size: 9px;
  }
</style>
