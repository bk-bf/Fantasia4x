<!--
  MoodPanel — pop-up mood readout for a selected pawn (MOOD-REWORK). Mirrors HealthPanel: it floats
  above the info card, the parent owns the open/close toggle (`open`) and the MOOD button that flips it.
  Read-only — shows the pawn's CURRENT (eased) mood, the TARGET it is easing toward, and every signed
  contribution behind that target (benefits green, debuffs red). Sourced from
  `pawnService.getMoodBreakdown` (= `computeMoodTarget`).
-->
<script lang="ts">
  import type { MoodModel } from '$lib/components/UI/SelectedEntityCard.svelte';
  import { autohideScroll } from '$lib/actions/autohideScroll';

  let { mood, open = false }: { mood: MoodModel | undefined; open?: boolean } = $props();

  // MOOD-REWORK: every contribution to the target, benefits on top and debuffs below.
  const contributions = $derived(
    [...(mood?.contributions ?? [])].sort((a, b) => b.value - a.value)
  );
  const moodVal = $derived(mood?.mood ?? 50);
  const target = $derived(mood?.target ?? moodVal);
  const gap = $derived(target - moodVal);
  const fmtInt = (n: number) => (n >= 0 ? '+' : '') + Math.round(n);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="mood-panel"
  class:open
  onmousedown={(e) => e.stopPropagation()}
  onmouseup={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
  use:autohideScroll
>
  <div class="mood-hdr">☼ MOOD</div>

  <div class="mood-now">
    <span class="mood-val" class:low={moodVal < 35} class:high={moodVal >= 65}>{moodVal}</span>
    <span class="mood-bar">
      <span class="mood-fill" style="width:{Math.max(0, Math.min(100, moodVal))}%"></span>
    </span>
  </div>

  <div class="mood-trend" class:up={gap > 0.5} class:down={gap < -0.5}>
    {#if gap > 0.5}
      ▲ rising toward {target}
    {:else if gap < -0.5}
      ▼ falling toward {target}
    {:else}
      ◦ settled at {target}
    {/if}
  </div>

  {#if contributions.length > 0}
    <div class="mood-drivers">
      {#each contributions as c (c.label)}
        <div class="mood-row" class:good={c.value > 0} class:bad={c.value < 0}>
          <span class="mood-label">{c.label}</span>
          <span class="mood-delta">{fmtInt(c.value)}</span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="mood-none">Nothing weighs on them — an even 50.</div>
  {/if}
</div>

<style>
  /* Pop-up framing copied from HealthPanel so the HUD pop-ups match. */
  .mood-panel {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    width: 300px;
    box-sizing: border-box;
    opacity: 0;
    transform: translateY(6px);
    overflow-y: auto;
    max-height: 0;
    pointer-events: none;
    background: rgba(13, 9, 3, 0.98);
    border: 1px solid #7a5e28;
    color: #c0a040;
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.5;
    z-index: 20;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      max-height 200ms ease,
      scrollbar-color 0.3s ease;
  }
  .mood-panel:global(.is-scrolling),
  .mood-panel:hover {
    scrollbar-color: #7a5e28 transparent;
  }
  .mood-panel::-webkit-scrollbar {
    width: 8px;
  }
  .mood-panel::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 4px;
  }
  .mood-panel:global(.is-scrolling)::-webkit-scrollbar-thumb,
  .mood-panel:hover::-webkit-scrollbar-thumb {
    background: #7a5e28;
  }
  .mood-panel.open {
    opacity: 1;
    transform: translateY(0);
    max-height: 360px;
    pointer-events: all;
    padding: 5px 7px;
  }
  .mood-hdr {
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 4px;
  }
  .mood-now {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 3px;
  }
  .mood-val {
    min-width: 18px;
    text-align: right;
    color: #d8b85a;
  }
  .mood-val.low {
    color: #d06a4a;
  }
  .mood-val.high {
    color: #7fae5a;
  }
  .mood-bar {
    flex: 1;
    height: 6px;
    background: rgba(120, 90, 40, 0.25);
    border: 1px solid #5a4620;
    overflow: hidden;
  }
  .mood-fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #8a6a2a, #d8b85a);
  }
  .mood-trend {
    color: #9a8048;
    margin-bottom: 5px;
  }
  .mood-trend.up {
    color: #7fae5a;
  }
  .mood-trend.down {
    color: #d06a4a;
  }
  .mood-drivers {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .mood-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .mood-row.good .mood-delta {
    color: #7fae5a;
  }
  .mood-row.bad .mood-delta {
    color: #d06a4a;
  }
  .mood-label {
    color: #b8985a;
  }
  .mood-delta {
    font-variant-numeric: tabular-nums;
  }
  .mood-none {
    color: #8a7240;
    font-style: italic;
  }
</style>
