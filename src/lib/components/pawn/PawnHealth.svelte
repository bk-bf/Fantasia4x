<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { buildHealthModel } from '$lib/components/UI/canvas/selectionCard';
  import HealthReadout from '$lib/components/UI/canvas/HealthReadout.svelte';

  let { pawn }: { pawn: Pawn } = $props();

  const health = $derived(buildHealthModel(pawn));
</script>

<div class="health-section">
  <div class="section-hdr">| BODY</div>
  <div class="health-body">
    <HealthReadout {health} />
  </div>
</div>

<style>
  .health-section {
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }

  .health-body {
    padding: 4px 8px 6px;
  }
</style>
