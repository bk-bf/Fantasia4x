<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { stateLabel } from '$lib/game/core/stateDefs';

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
      <span class="name">{pawn.name}</span>
      {#if pawn.cultureName}<span class="culture">{pawn.cultureName}</span>{/if}
      <span class="state">{stateLabel(pawn.currentState).toUpperCase()}</span>
    </button>
  {/each}
</div>

<style>
  .pawn-selector {
    display: flex;
    gap: 0;
    background: var(--bg-panel);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border-hi);
    flex-wrap: wrap;
  }

  .pawn-selector-btn {
    padding: 4px 12px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text-dim);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    transition:
      background 0.1s,
      color 0.1s;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
  }

  .pawn-selector-btn:hover {
    background: var(--bg-hover);
    color: var(--accent-hi);
  }

  .pawn-selector-btn.selected {
    background: var(--bg-active);
    color: var(--accent-hi);
    border-left: 2px solid var(--accent-hi);
    padding-left: 10px;
  }

  .name {
    font-size: 12px;
  }

  .culture {
    font-size: 10px;
    color: var(--accent-hi);
    opacity: 0.85;
    letter-spacing: 0.04em;
  }

  .state {
    font-size: 10px;
    color: var(--text-muted);
    letter-spacing: 0.08em;
  }

  .pawn-selector-btn.selected .state {
    color: var(--accent-hi);
    opacity: 0.7;
  }
</style>
