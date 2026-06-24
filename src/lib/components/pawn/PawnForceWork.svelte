<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';

  export let pawn: Pawn;

  $: forced = pawn.forceWork === true;

  function setForceWork(forceWork: boolean) {
    gameState.command({
      type: 'setPawnForceWork',
      payload: { pawnId: pawn.id, forceWork },
      save: true
    });
  }
</script>

<div class="row">
  <span class="lbl">FORCE WORK</span>
  <div class="seg">
    <button
      class="seg-btn"
      class:active={!forced}
      title="Normal — the pawn breaks off to eat, drink and rest when needs get pressing (default)"
      on:click={() => setForceWork(false)}
    >
      OFF
    </button>
    <button
      class="seg-btn danger"
      class:active={forced}
      title="Neglect ALL needs and keep working — no eating, drinking or resting. Can collapse or starve the pawn; for emergencies only."
      on:click={() => setForceWork(true)}
    >
      FORCE
    </button>
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
  /* The FORCE side, when active, reads as a danger state (it can kill the pawn). */
  .seg-btn.danger.active {
    background: var(--neg, #c0392b);
    color: #fff;
  }
</style>
