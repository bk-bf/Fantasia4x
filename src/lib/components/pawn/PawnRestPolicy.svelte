<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';

  export let pawn: Pawn;

  type RestPolicy = 'never' | 'shelter' | 'always';
  const POLICIES: Array<{ id: RestPolicy; label: string; title: string }> = [
    {
      id: 'never',
      label: 'NO REST',
      title: 'Never break off to recover — keep working, accept the slow heal rate (emergencies)'
    },
    {
      id: 'shelter',
      label: 'SHELTER',
      title: 'Recover only when a bed/roofed shelter is reachable; otherwise keep working'
    },
    {
      id: 'always',
      label: 'ALWAYS',
      title: 'Recover freely, lying on the bare ground if no bed/shelter is near (default)'
    }
  ];

  $: current = (pawn.restPolicy ?? 'always') as RestPolicy;

  function setPolicy(policy: RestPolicy) {
    gameState.command({
      type: 'setPawnRestPolicy',
      payload: { pawnId: pawn.id, policy },
      save: true
    });
  }
</script>

<div class="row">
  <span class="lbl">REST</span>
  <div class="seg">
    {#each POLICIES as p (p.id)}
      <button
        class="seg-btn"
        class:active={current === p.id}
        title={p.title}
        on:click={() => setPolicy(p.id)}
      >
        {p.label}
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
