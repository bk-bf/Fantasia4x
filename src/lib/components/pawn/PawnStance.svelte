<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';

  export let pawn: Pawn;

  type Stance = NonNullable<Pawn['combatStance']>;
  const STANCE_META: Record<Stance, { label: string; title: string }> = {
    aggressive: { label: 'AGGRO', title: 'Engage any hostile within vision range' },
    defensive: { label: 'DEF', title: 'Only fight once a hostile is adjacent (default)' },
    flee: { label: 'FLEE', title: 'Retreat as soon as a hostile is seen' }
  };
  const STANCES = (Object.keys(STANCE_META) as Stance[]).map((id) => ({
    id,
    ...STANCE_META[id]
  }));

  $: current = pawn.combatStance ?? 'defensive';

  function setStance(stance: Stance) {
    gameState.command({ type: 'setPawnStance', payload: { pawnId: pawn.id, stance }, save: true });
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
    font-size: 11px;
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
