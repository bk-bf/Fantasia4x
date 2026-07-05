<!-- PawnStatsBar.svelte — pawn name header + the shared core-attribute grid; spans the full status
     panel width. The grid itself is PawnStatBanner (the SAME component the Attributes tab uses), so
     both tabs show identical condition-adjusted values + deltas — one panel, one source of truth. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import PawnStatBanner from './PawnStatBanner.svelte';

  export let pawn: Pawn;
</script>

<div class="stats-bar">
  <div class="section-hdr">| {pawn.name.toUpperCase()}</div>
  <PawnStatBanner {pawn} />
</div>

<style>
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 12px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }
</style>
