<!-- PawnStatBanner.svelte — the six base-stat chips (STR DEX CON INT PER CHA), showing the
     condition-adjusted (effective) value with a signed delta. The single source of truth for the
     stat grid: rendered by the Attributes tab (PawnAttributes) and the Status tab (via PawnStatsBar,
     which adds the name header), plus anywhere else the core attributes are shown. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { conditionStatMultipliers } from '$lib/game/core/needs';
  export let pawn: Pawn;

  // Active conditions (shock, malnutrition, hypothermia…) scale the RAW attributes. Show the
  // EFFECTIVE value so the banner matches the crippled body the sim actually uses, with a signed
  // delta + a tooltip naming the base × multiplier — that's the "stat loss" surfaced on the pawn tab.
  $: sm = conditionStatMultipliers(pawn);
  $: cells = [
    ['STR', pawn.stats.strength, sm.strength],
    ['DEX', pawn.stats.dexterity, sm.dexterity],
    ['CON', pawn.stats.constitution, sm.constitution],
    ['INT', pawn.stats.intelligence, sm.intelligence],
    ['PER', pawn.stats.perception, sm.perception],
    ['CHA', pawn.stats.charisma, 1]
  ] as const;

  const eff = (base: number, mult: number) => Math.round(base * mult);
  const pct = (mult: number) => `${mult < 1 ? '−' : '+'}${Math.abs(Math.round((mult - 1) * 100))}%`;
</script>

<div class="stats-grid">
  {#each cells as [lbl, base, mult]}
    <div
      class="stat-cell"
      title={mult !== 1
        ? `${lbl} ${base} × ${mult.toFixed(2)} (conditions) = ${eff(base, mult)}`
        : ''}
    >
      <span class="stat-lbl">{lbl}</span>
      <span class="stat-val" class:penalized={mult < 1} class:boosted={mult > 1}>
        {eff(base, mult)}
      </span>
      {#if mult !== 1}
        <span class="stat-delta" class:neg={mult < 1}>{pct(mult)}</span>
      {/if}
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
  .stat-val.penalized {
    color: var(--neg, #ff5252);
  }
  .stat-val.boosted {
    color: var(--pos, #4caf50);
  }
  .stat-delta {
    font-size: 8px;
    line-height: 1;
    color: var(--pos, #4caf50);
  }
  .stat-delta.neg {
    color: var(--neg, #ff5252);
  }
</style>
