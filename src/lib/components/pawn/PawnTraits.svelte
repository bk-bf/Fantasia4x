<!-- PawnTraits.svelte — the pawn STATUS tab's trait section. Thin wrapper over the shared
     TraitCards grid (also used by the race tab) so there's one source of truth for trait rendering. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import TraitCards from './TraitCards.svelte';

  export let pawn: Pawn;
</script>

<div class="traits-section">
  <div class="section-hdr">| TRAITS ({pawn.traits?.length || 0})</div>
  {#if pawn.traits && pawn.traits.length > 0}
    <TraitCards traits={pawn.traits} />
  {:else}
    <div class="empty-row"><span class="muted">no traits</span></div>
  {/if}
</div>

<style>
  .traits-section {
    border-bottom: 1px solid var(--border);
  }
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 12px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 1px;
  }
  .empty-row {
    padding: 6px 8px;
  }
  .muted {
    color: var(--text-muted);
    font-style: italic;
    font-size: 12px;
  }
</style>
