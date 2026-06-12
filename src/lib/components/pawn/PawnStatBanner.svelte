<!-- PawnStatBanner.svelte — the six base-stat chips (STR DEX CON INT PER CHA).
     Shared between the Status tab (PawnOverview) and the Attributes tab (PawnAttributes). -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  export let pawn: Pawn;

  $: cells = [
    ['STR', pawn.stats.strength],
    ['DEX', pawn.stats.dexterity],
    ['CON', pawn.stats.constitution],
    ['INT', pawn.stats.intelligence],
    ['PER', pawn.stats.perception],
    ['CHA', pawn.stats.charisma]
  ] as const;
</script>

<div class="stats-grid">
  {#each cells as [lbl, val]}
    <div class="stat-cell">
      <span class="stat-lbl">{lbl}</span>
      <span class="stat-val">{val}</span>
    </div>
  {/each}
</div>

<style>
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
