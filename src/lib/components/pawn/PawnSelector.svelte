<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';

  export let pawns: Pawn[];
  export let selectedPawn: Pawn | null;
  export let onSelect: (pawn: Pawn) => void;
</script>

<div class="pawn-selector">
  {#each pawns as pawn}
    <button
      class="pawn-selector-btn"
      class:selected={selectedPawn?.id === pawn.id}
      on:click={() => onSelect(pawn)}
    >
      {pawn.name}
    </button>
  {/each}
</div>

<style>
  .pawn-selector {
    display: flex;
    gap: 0;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .pawn-selector-btn {
    padding: 4px 12px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text-dim);
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    transition:
      background 0.1s,
      color 0.1s;
  }

  .pawn-selector-btn:hover {
    background: var(--bg-hover);
    color: var(--accent-hi);
  }

  .pawn-selector-btn.selected {
    background: var(--tab-active);
    color: #fff;
  }
</style>
