<!-- CarryCapacity.svelte — the "[w/W kg · v/V L]" load readout + the capacity-breakdown hover tooltip
     for the CARRYING header. Split out of PawnInventory to keep it within the component-size limit. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { itemService } from '$lib/game/services/ItemService';
  import { gameState } from '$lib/stores/gameState';

  export let pawn: Pawn;

  // Derive load + budget from the service (single source of truth = item defs). The cached
  // pawn.inventory.weightKg is a write-only initial-shape field that is never updated on
  // inventory mutation, so reading it showed a stale 0.0 (review R5 / playtest 2026-06-13).
  $: cap = itemService.getCarryCapacityBreakdown(pawn);
  $: load = itemService.getCurrentCarryLoad(pawn, $gameState);
  $: maxWeightKg = cap.weight.total;
  $: maxVolumeL = cap.volume.total;
  $: weightKg = load.weightKg;
  $: volumeL = load.volumeL;
  // Raw (pre-floor) sums — when below 1 the budget is clamped to the 1.0 minimum.
  $: wRaw = cap.weight.capacity + cap.weight.gear;
  $: vRaw = cap.volume.capacity + cap.volume.gear;

  const r1 = (n: number) => Math.round(n * 10) / 10;
  const signed = (n: number) => (n >= 0 ? '+' : '−') + r1(Math.abs(n));
  const pct = (f: number) => `${Math.round(f * 100)}%`;
</script>

<span class="capacity">
  [{weightKg.toFixed(1)}/{maxWeightKg.toFixed(1)} kg · {volumeL.toFixed(1)}/{maxVolumeL.toFixed(1)} L]
  <div class="cap-tip">
    <div class="tip-formula">CARRY CAPACITY — {cap.size} · {cap.bodyWeight}kg</div>
    <div class="tip-row">
      weight = <span class="tv">{cap.bodyWeight}kg</span> ×
      <span class="tv">{pct(cap.weight.loadFraction)}</span> load (STR {cap.strength}){#if cap.weight.gear}
        <span class="tv">{signed(cap.weight.gear)}</span> gear{/if} =
      <span class="tv">{r1(maxWeightKg)}</span> kg{#if wRaw < maxWeightKg}
        <span class="floor">(min 1)</span>{/if}
    </div>
    <div class="tip-row">
      volume = <span class="tv">{cap.bodyWeight}kg</span> ×
      <span class="tv">{pct(cap.volume.fraction)}</span>{#if cap.volume.gear}
        <span class="tv">{signed(cap.volume.gear)}</span> gear{/if} =
      <span class="tv">{r1(maxVolumeL)}</span> L{#if vRaw < maxVolumeL}
        <span class="floor">(min 1)</span>{/if}
    </div>
    {#if cap.gearSources.length}
      <div class="tip-gear">
        {#each cap.gearSources as g}
          <div>
            {g.name}: <span class="tv">+{r1(g.weightKg)}</span> kg,
            <span class="tv">+{r1(g.volumeL)}</span> L
          </div>
        {/each}
      </div>
    {:else}
      <div class="tip-gear">no belt/back container — equip one to raise capacity</div>
    {/if}
  </div>
</span>

<style>
  .capacity {
    position: relative;
    color: var(--text-dim, #666);
    font-size: 0.7rem;
    cursor: help;
  }

  .cap-tip {
    display: none;
    position: absolute;
    z-index: 60;
    left: 0;
    top: 100%;
    min-width: 240px;
    max-width: 340px;
    padding: 6px 8px;
    background: var(--bg-panel, #0c1118);
    border: 1px solid var(--border-hi, #3a4658);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    color: var(--text, #ccc);
    font-size: 11px;
    line-height: 1.5;
    text-transform: none;
    pointer-events: none;
  }
  .capacity:hover .cap-tip {
    display: block;
  }
  .tip-formula {
    color: var(--accent-hi, #ffd24a);
  }
  .tip-row {
    margin-top: 3px;
    color: var(--text-dim, #888);
  }
  .tip-gear {
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px solid var(--border, #222);
    color: var(--text-dim, #888);
    font-style: italic;
  }
  .cap-tip .tv {
    color: #4caf50;
  }
  .cap-tip .floor {
    color: var(--text-dim, #888);
    font-style: italic;
  }
</style>
