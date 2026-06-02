<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
  import { modifierSystem } from '$lib/game/systems/ModifierSystem';
  import { getPawnTaskSummary, getEfficiencyColor } from '$lib/utils/pawnUtils';
  import { stateColor, stateLabel, needBar } from '$lib/utils/workUtils';
  import type { Pawn } from '$lib/game/core/types';

  interface Props {
    pawn: Pawn;
  }
  let { pawn }: Props = $props();

  let taskSummary = $derived(getPawnTaskSummary(pawn, $gameState));
  let workEfficiency = $derived(
    Object.fromEntries(
      WORK_CATEGORIES.map((wc) => [
        wc.id,
        modifierSystem.calculateWorkEfficiency(pawn.id, wc.id, $gameState)
      ])
    )
  );
  let sortedCategories = $derived(
    [...WORK_CATEGORIES].sort(
      (a, b) => (workEfficiency[b.id]?.totalValue ?? 0) - (workEfficiency[a.id]?.totalValue ?? 0)
    )
  );
</script>

<div class="section-hdr">| {pawn.name.toUpperCase()} — PAWN DETAIL</div>
<div class="detail-row">
  <span class="lbl">ACTIVITY</span>
  <span style="color:{stateColor(pawn)}">{stateLabel(pawn)}</span>
</div>
<div class="detail-row">
  <span class="lbl">TASK</span>
  <span class="sval">{taskSummary?.currentTask ?? 'idle'}</span>
</div>
<div class="detail-row">
  <span class="lbl">NEXT</span>
  <span class="sval">{taskSummary?.nextTask ?? 'no work'}</span>
</div>
<div class="need-row">
  <span class="lbl">HUNGER</span>
  <span class="bar-ascii">{needBar(pawn.needs.hunger)}</span>
  <span class="val" class:neg={pawn.needs.hunger > 70}>{Math.round(pawn.needs.hunger)}%</span>
</div>
<div class="need-row">
  <span class="lbl">FATIGUE</span>
  <span class="bar-ascii">{needBar(pawn.needs.fatigue)}</span>
  <span class="val" class:neg={pawn.needs.fatigue > 70}>{Math.round(pawn.needs.fatigue)}%</span>
</div>
<div class="stats-row">
  {#each Object.entries(pawn.stats) as [stat, val]}
    <span class="stat-chip">
      <span class="slbl">{stat.slice(0, 3).toUpperCase()}</span>
      <span class="sval">{val}</span>
    </span>
  {/each}
</div>
<div class="section-hdr sub">| WORK EFFICIENCY</div>
<div class="eff-grid">
  {#each sortedCategories as wc}
    {@const eff = workEfficiency[wc.id]}
    {#if eff}
      <div class="eff-item" title="{wc.name}: {eff.totalValue.toFixed(2)}x">
        <span class="eff-name">{wc.name.toUpperCase()}</span>
        <span class="eff-val" style="color:{getEfficiencyColor(eff.totalValue)}"
          >{eff.totalValue.toFixed(2)}x</span
        >
      </div>
    {/if}
  {/each}
</div>

<style>
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
  }
  .detail-row {
    display: flex;
    padding: 2px 8px;
    gap: 8px;
    align-items: baseline;
    font-size: 11px;
    font-family: 'Courier New', monospace;
  }
  .need-row {
    display: flex;
    align-items: center;
    padding: 2px 8px;
    gap: 6px;
    font-family: 'Courier New', monospace;
  }
  .lbl {
    color: var(--text-dim);
    font-size: 11px;
    width: 60px;
    flex-shrink: 0;
  }
  .bar-ascii {
    font-size: 11px;
    color: var(--accent);
    letter-spacing: -1px;
  }
  .val {
    font-size: 11px;
  }
  .val.neg {
    color: #f44;
  }
  .stats-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 8px;
  }
  .stat-chip {
    display: flex;
    gap: 2px;
    font-size: 10px;
    border: 1px solid var(--border);
    padding: 1px 4px;
    font-family: 'Courier New', monospace;
  }
  .slbl {
    color: var(--text-muted, #555);
  }
  .sval {
    color: var(--text);
  }
  .eff-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 2px;
    padding: 4px 8px;
  }
  .eff-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 1px solid var(--border);
    padding: 2px 4px;
    cursor: default;
    font-family: 'Courier New', monospace;
  }
  .eff-item:hover {
    background: var(--bg-hover);
  }
  .eff-name {
    font-size: 9px;
    color: var(--text-muted);
    letter-spacing: 0.04em;
  }
  .eff-val {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
</style>
