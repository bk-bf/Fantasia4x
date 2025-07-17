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
    gap: 10px;
    justify-content: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .pawn-selector-btn {
    padding: 8px 16px;
    background: #000000;
    border: 1px solid #4caf50;
    color: #4caf50;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1em;
    transition: all 0.2s ease;
  }

  .pawn-selector-btn:hover {
    background: #4caf50;
    color: #000;
  }

  .pawn-selector-btn.selected {
    background: #4caf50;
    color: #000;
    font-weight: bold;
  }
</style>
