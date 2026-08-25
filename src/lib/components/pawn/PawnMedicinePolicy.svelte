<!-- PawnMedicinePolicy.svelte — the ceiling on what an auto-tend may spend dressing THIS pawn's
     wounds. Conditions are not managed here: those are administered by hand from a caretaker's pack
     (see PawnAdminister), because the sim should not be guessing which phial the player meant. -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';

  export let pawn: Pawn;

  const TIERS: Array<{ id: number | null; label: string; title: string }> = [
    { id: null, label: 'BEST', title: 'Dress wounds with the best medicine in stock (default)' },
    { id: 0, label: 'PRIM', title: 'Nothing above foraged moss, woundwort and chewed poultice' },
    {
      id: 1,
      label: 'BRONZE',
      title: 'Up to honey salve — keep the worked medicine for someone else'
    },
    { id: 2, label: 'IRON', title: 'Up to spirit tincture' },
    { id: 3, label: 'STEEL', title: "Up to a surgeon's dressing" }
  ];

  $: current = pawn.medicineTierCap ?? null;

  function setTier(tier: number | null) {
    gameState.command({
      type: 'setPawnMedicineTier',
      payload: { pawnId: pawn.id, tier },
      save: true
    });
  }
</script>

<div class="row">
  <span class="lbl" title="Ceiling on medicine spent dressing this pawn's wounds">MEDS</span>
  <div class="seg">
    {#each TIERS as t (t.label)}
      <button
        class="opt"
        class:on={current === t.id}
        title={t.title}
        on:click={() => setTier(t.id)}
      >
        {t.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.25rem 0;
  }
  .lbl {
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--text-dim, #8a8a8a);
    min-width: 3.2rem;
  }
  .seg {
    display: flex;
    flex: 1;
    gap: 2px;
  }
  .opt {
    flex: 1;
    padding: 0.18rem 0.2rem;
    font-size: 0.66rem;
    letter-spacing: 0.04em;
    background: var(--bg-alt, #17171a);
    color: var(--text-dim, #8a8a8a);
    border: 1px solid var(--border, #2c2c31);
    cursor: pointer;
  }
  .opt:hover {
    color: var(--text, #d8d8d8);
  }
  .opt.on {
    background: var(--accent-bg, #23301f);
    color: var(--accent, #9ec96a);
    border-color: var(--accent, #9ec96a);
  }
</style>
