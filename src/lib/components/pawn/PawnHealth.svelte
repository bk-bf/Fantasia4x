<!-- PawnHealth.svelte — Pawns-tab BODY section. Renders the SHARED HealthReadout (the same richer
     readout the in-game info-card HEALTH pop-up uses: blood + bleed-out ETA, cold/heat, pain, combat
     readiness, then every damaged limb with its injured sub-parts' HP + wounds). -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { buildHealthModel } from '$lib/components/UI/gameCanvas/selectionCard';
  import HealthReadout from '$lib/components/UI/gameCanvas/HealthReadout.svelte';

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
