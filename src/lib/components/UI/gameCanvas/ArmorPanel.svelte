<!--
  ArmorPanel — pop-up natural-armour readout for a selected creature (forked from HealthPanel). Floats
  above the info card; the parent owns the open/close toggle (`open`) and the GEAR button that flips it.
  Read-only: shows how thick the beast's hide is over each body part so the player can read where the
  plating is heavy and where it is thin. The soft spots are marked but not spelled out — reading the map
  is the point.
-->
<script lang="ts">
  import type { ArmorModel } from '$lib/components/UI/SelectedEntityCard.svelte';
  import { autohideScroll } from '$lib/actions/autohideScroll';

  let { armor, open = false }: { armor: ArmorModel | undefined; open?: boolean } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="armor-panel"
  class:open
  onmousedown={(e) => e.stopPropagation()}
  onmouseup={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
  use:autohideScroll
>
  <div class="armor-hdr">◈ HIDE</div>
  {#if armor}
    {#each armor.limbs as limb (limb.label)}
      <div class="armor-limb">{limb.label}</div>
      {#each limb.parts as part (part.label)}
        <div class="armor-row" class:weak={part.weak}>
          <span class="armor-part">{part.label}</span>
          <span class="armor-val">{part.armor}</span>
        </div>
      {/each}
    {/each}
  {/if}
</div>

<style>
  /* Pop-up framing copied from HealthPanel so the HUD pop-ups match. */
  .armor-panel {
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
  .armor-panel:global(.is-scrolling),
  .armor-panel:hover {
    scrollbar-color: #7a5e28 transparent;
  }
  .armor-panel::-webkit-scrollbar {
    width: 8px;
  }
  .armor-panel::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 4px;
  }
  .armor-panel:global(.is-scrolling)::-webkit-scrollbar-thumb,
  .armor-panel:hover::-webkit-scrollbar-thumb {
    background: #7a5e28;
  }
  .armor-panel.open {
    opacity: 1;
    transform: translateY(0);
    max-height: 360px;
    pointer-events: all;
    padding: 5px 7px;
  }
  .armor-hdr {
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 4px;
  }
  .armor-limb {
    color: #8a7030;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 3px;
  }
  .armor-row {
    display: flex;
    justify-content: space-between;
    padding-left: 8px;
  }
  /* A thin spot in the hide reads brighter/greener — the gap the player wants, without a caption saying so. */
  .armor-row.weak {
    color: #7fbf5f;
  }
  .armor-val {
    font-variant-numeric: tabular-nums;
  }
</style>
