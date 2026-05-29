<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { getStatColor, getStatDescription } from '$lib/utils/pawnUtils';

  export let pawn: Pawn;

  function blockBar(value: number, max: number, width = 20): string {
    const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
    return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
  }
</script>

<div class="stats-section">
  <div class="section-hdr">| STATS</div>
  {#each Object.entries(pawn.stats) as [statName, statValue]}
    <div class="stat-row">
      <span class="stat-name">{statName.toUpperCase()}</span>
      <span class="block-bar" style="color: {getStatColor(statValue)}"
        >{blockBar(statValue, 20)}</span
      >
      <span class="stat-val" style="color: {getStatColor(statValue)}">{statValue}</span>
    </div>
  {/each}
</div>

<style>
  .stats-section {
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

  .stat-row {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    gap: 8px;
  }
  .stat-row:hover {
    background: var(--bg-hover);
  }

  .stat-name {
    color: var(--text-dim);
    font-size: 11px;
    letter-spacing: 0.04em;
    width: 80px;
    flex-shrink: 0;
  }

  .block-bar {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    letter-spacing: -0.02em;
    white-space: nowrap;
    flex: 1;
  }

  .stat-val {
    font-size: 11px;
    font-weight: bold;
    width: 24px;
    text-align: right;
    flex-shrink: 0;
  }
</style>
