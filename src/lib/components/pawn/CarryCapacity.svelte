<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { itemService } from '$lib/game/services/ItemService';
  import { gameState } from '$lib/stores/gameState';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';

  export let pawn: Pawn;

  $: cap = itemService.getCarryCapacityBreakdown(pawn);
  $: load = itemService.getCurrentCarryLoad(pawn, $gameState);
  $: maxWeightKg = cap.weight.total;
  $: maxVolumeL = cap.volume.total;
  $: weightKg = load.weightKg;
  $: volumeL = load.volumeL;
  $: wRaw = cap.weight.capacity + cap.weight.gear;
  $: vRaw = cap.volume.capacity + cap.volume.gear;

  const r1 = (n: number) => Math.round(n * 10) / 10;
  const signed = (n: number) => (n >= 0 ? '+' : '−') + r1(Math.abs(n));
  const pct = (f: number) => `${Math.round(f * 100)}%`;

  let at: { x: number; y: number } | null = null;
  const follow = (e: MouseEvent) => (at = { x: e.clientX, y: e.clientY });
</script>

<div
  class="capacity"
  role="note"
  on:mouseenter={follow}
  on:mousemove={follow}
  on:mouseleave={() => (at = null)}
>
  <div class="meter">
    <em>Load</em><SkinBar value={weightKg / Math.max(maxWeightKg, 0.1)} ramp="honey" />
    <span>{weightKg.toFixed(1)} of {maxWeightKg.toFixed(1)} kg</span>
  </div>
  <div class="meter">
    <em>Room</em><SkinBar value={volumeL / Math.max(maxVolumeL, 0.1)} ramp="water" />
    <span>{volumeL.toFixed(1)} of {maxVolumeL.toFixed(1)} L</span>
  </div>
</div>

{#if at}
  <HoverTip x={at.x} y={at.y}>
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
            {g.name}:{#if g.weightKg}
              <span class="tv">+{r1(g.weightKg)}</span> kg,{/if}
            <span class="tv">+{r1(g.volumeL)}</span> L
          </div>
        {/each}
      </div>
    {:else}
      <div class="tip-gear">no belt or pack — equip one for more room</div>
    {/if}
  </HoverTip>
{/if}

<style>
  .capacity {
    position: relative;
    margin-top: 6px;
    cursor: help;
  }
  .meter {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 18px;
  }
  em {
    flex: none;
    width: 44px;
    font-style: normal;
  }
  .meter span {
    flex: none;
    width: 110px;
    text-align: right;
    color: var(--text-dim);
    white-space: nowrap;
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
  .tv {
    color: var(--pos);
  }
  .floor {
    color: var(--text-dim, #888);
    font-style: italic;
  }
</style>
