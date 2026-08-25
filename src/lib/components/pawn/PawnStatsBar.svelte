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
