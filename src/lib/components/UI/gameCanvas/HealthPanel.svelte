<!--
  HealthPanel — pop-up body-health readout for a selected pawn/mob (NT-U1). Mirrors
  BuildingFuelPanel: it floats above the info card and the parent owns the open/close toggle
  (passed as `open`) and the HEALTH button that flips it. Read-only — the body is the shared
  HealthReadout (blood + pain for the whole body, then every damaged limb with its bleed rate and
  injured sub-parts' HP + wounds); this component only adds the floating pop-up chrome.
-->
<script lang="ts">
  import type { HealthModel } from '$lib/components/UI/SelectedEntityCard.svelte';
  import { autohideScroll } from '$lib/actions/autohideScroll';
  import HealthReadout from './HealthReadout.svelte';

  let { health, open = false }: { health: HealthModel | undefined; open?: boolean } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="health-panel"
  class:open
  onmousedown={(e) => e.stopPropagation()}
  onmouseup={(e) => e.stopPropagation()}
  onwheel={(e) => e.stopPropagation()}
  use:autohideScroll
>
  <div class="health-hdr">◈ HEALTH</div>
  <HealthReadout {health} />
</div>

<style>
  /* Pop-up framing copied from BuildingFuelPanel so the two HUD pop-ups match. */
  .health-panel {
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
    /* Auto-hiding scrollbar via the shared `autohideScroll` action (it toggles `.is-scrolling`), so the
       bar never clutters the readout when it isn't needed. Gutter reserved so rows don't reflow. The
       bespoke #7a5e28 thumb keeps this floating panel's darker palette (matches its border). */
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      max-height 200ms ease,
      scrollbar-color 0.3s ease;
  }
  /* `is-scrolling` is toggled at runtime by the autohideScroll action — :global so Svelte doesn't
     prune it as an "unused" selector. */
  .health-panel:global(.is-scrolling),
  .health-panel:hover {
    scrollbar-color: #7a5e28 transparent;
  }
  .health-panel::-webkit-scrollbar {
    width: 8px;
  }
  .health-panel::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 4px;
  }
  .health-panel:global(.is-scrolling)::-webkit-scrollbar-thumb,
  .health-panel:hover::-webkit-scrollbar-thumb {
    background: #7a5e28;
  }
  .health-panel.open {
    opacity: 1;
    transform: translateY(0);
    max-height: 360px;
    pointer-events: all;
    padding: 5px 7px;
  }
  .health-hdr {
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 4px;
  }
</style>
