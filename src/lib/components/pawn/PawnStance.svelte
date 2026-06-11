<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';

  export let pawn: Pawn;

  type Stance = 'aggressive' | 'defensive' | 'flee';
  const STANCES: Array<{ id: Stance; label: string; title: string }> = [
    { id: 'aggressive', label: 'AGGRO', title: 'Engage any hostile within vision range' },
    { id: 'defensive', label: 'DEF', title: 'Only fight once a hostile is adjacent (default)' },
    { id: 'flee', label: 'FLEE', title: 'Retreat as soon as a hostile is seen' }
  ];

  $: current = (pawn.combatStance ?? 'defensive') as Stance;

  function setStance(stance: Stance) {
    gameState.updateWithSave((state) => ({
      ...state,
      pawns: state.pawns.map((p) => (p.id === pawn.id ? { ...p, combatStance: stance } : p))
    }));
  }
</script>

<div class="row">
  <span class="lbl">STANCE</span>
  <div class="seg">
    {#each STANCES as s (s.id)}
      <button
        class="seg-btn"
        class:active={current === s.id}
        title={s.title}
        on:click={() => setStance(s.id)}
      >
        {s.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .row {
    display: flex;
    padding: 2px 8px;
    align-items: center;
    gap: 6px;
  }

  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    min-width: 80px;
    flex-shrink: 0;
  }

  .seg {
    display: flex;
    margin-left: auto;
    border: 1px solid var(--border);
  }

  .seg-btn {
    background: var(--bg-panel);
    color: var(--text-dim);
    border: none;
    border-left: 1px solid var(--border);
    padding: 2px 8px;
    font-family: inherit;
    font-size: 10px;
    letter-spacing: 0.04em;
    cursor: pointer;
  }
  .seg-btn:first-child {
    border-left: none;
  }
  .seg-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .seg-btn.active {
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
  }
</style>
