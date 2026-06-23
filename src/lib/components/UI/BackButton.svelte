<!--
  BackButton — the single shared "return to map" control for every overlay-screen header
  (Work / Crafting / Construction / Entities / Exploration…). Each screen used to hand-roll its own
  `.hdr-btn` and they drifted (different sizes / colours / padding); this is the one chokepoint so the
  back affordance is identical across tabs. Defaults to going back to the main map; pass `onClick` to
  override (e.g. a nested sub-view that pops one level).
-->
<script lang="ts">
  import { uiState } from '$lib/stores/uiState';

  let { label = 'BACK', onClick }: { label?: string; onClick?: () => void } = $props();
  const handle = () => (onClick ? onClick() : uiState.setScreen('main'));
</script>

<button class="back-btn" onclick={handle} title="Back to map">‹ {label}</button>

<style>
  /* margin-left:auto floats it to the trailing edge of any flex header — works whether it's a direct
     child of `.screen-hdr` or nested in a `.hdr-tools` group (no free space there → it's a no-op). */
  .back-btn {
    margin-left: auto;
    padding: 2px 10px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition:
      color 0.12s,
      border-color 0.12s,
      background 0.12s;
  }
  .back-btn:hover {
    color: var(--accent-hi);
    border-color: var(--border-hi);
    background: var(--bg-hover);
  }
</style>
