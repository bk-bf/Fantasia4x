<!-- StatBar.svelte — the one reusable meter bar: LABEL [████░░░░] VALUE.
     Used for needs, conditions, item freshness/condition, blood/stamina — one style everywhere. -->
<script lang="ts">
  export let label: string;
  export let value: number; // current value
  export let max = 100;
  export let color: string;
  /** Right-hand readout. Defaults to the rounded value; pass e.g. "72/100" or "72%" to override. */
  export let valueText: string | null = null;
  export let width = 8;

  $: frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  $: filled = Math.round(frac * width);
  $: blocks = '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
</script>

<div class="stat-bar">
  <span class="sb-label">{label}</span>
  <span class="sb-track" style="color: {color}">[{blocks}]</span>
  <span class="sb-val" style="color: {color}">{valueText ?? Math.round(value)}</span>
</div>

<style>
  .stat-bar {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    line-height: 1.5;
  }
  .sb-label {
    min-width: 58px;
    color: var(--text-dim);
    letter-spacing: 0.04em;
  }
  .sb-track {
    letter-spacing: -1px;
    white-space: nowrap;
  }
  .sb-val {
    flex-shrink: 0;
    margin-left: auto;
  }
</style>
