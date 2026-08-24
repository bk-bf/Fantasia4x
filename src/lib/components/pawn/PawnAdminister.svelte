<!-- PawnAdminister.svelte — condition medicine THIS pawn is carrying, and who they can give it to.
     Conditions are managed by hand on purpose: the sim would have to guess which of thirteen
     conditions the player wanted cleared and which of their few phials to spend, so instead you
     equip a caretaker with what you expect to need and dose someone deliberately. Wounds are the
     automatic half — see PawnMedicinePolicy. -->
<script lang="ts">
  import type { Pawn, Item } from '$lib/game/core/types';
  import { itemService } from '$lib/game/services/ItemService';
  import { gameState } from '$lib/stores/gameState';

  let { pawn }: { pawn: Pawn } = $props();

  /** What the caretaker is CARRYING that clears a named condition. */
  const doses = $derived(
    Object.entries(pawn.inventory?.items ?? {})
      .filter(
        ([id, qty]) => qty > 0 && (itemService.getItemById(id)?.curesConditions?.length ?? 0) > 0
      )
      .map(([id, qty]) => ({ id, qty, def: itemService.getItemById(id) as Item }))
  );

  /** Anyone standing next to them — you cannot dose someone across the map. */
  const adjacent = $derived(
    ($gameState.pawns ?? []).filter((p) => {
      if (p.id === pawn.id || p.isAlive === false) return false;
      const a = pawn.position;
      const b = p.position;
      if (!a || !b) return false;
      return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
    })
  );

  /** Conditions this patient actually has that the dose would clear — so the label can say so. */
  function treats(def: Item, patient: Pawn): string[] {
    const active = new Set(Object.keys(patient.conditionTimers ?? {}));
    return (def.curesConditions ?? []).filter((c) => active.has(c));
  }

  function administer(itemId: string, patientId: string) {
    gameState.command({
      type: 'administerMedicine',
      payload: { caretakerId: pawn.id, patientId, itemId },
      save: true
    });
  }
</script>

<div class="wrap">
  <div class="hdr">ADMINISTER</div>
  {#if doses.length === 0}
    <div class="empty">carrying no condition medicine — put some in this pawn's pack</div>
  {:else if adjacent.length === 0}
    <div class="empty">nobody standing beside them</div>
  {:else}
    {#each doses as d (d.id)}
      <div class="dose">
        <span class="nm">{d.def.name}</span>
        <span class="qty">×{d.qty}</span>
        <span class="cures">{(d.def.curesConditions ?? []).join(', ')}</span>
      </div>
      <div class="targets">
        {#each adjacent as p (p.id)}
          {@const hit = treats(d.def, p)}
          <button
            class="give"
            class:relevant={hit.length > 0}
            title={hit.length
              ? `Clears ${hit.join(', ')} on ${p.name}`
              : `${p.name} has none of ${(d.def.curesConditions ?? []).join(', ')} — the dose would be wasted`}
            onclick={() => administer(d.id, p.id)}
          >
            Administer to {p.name}{hit.length ? ` · ${hit.join(', ')}` : ''}
          </button>
        {/each}
      </div>
    {/each}
  {/if}
</div>

<style>
  .wrap {
    margin: 0.4rem 0;
  }
  .hdr {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    color: var(--text-dim, #8a8a8a);
    margin-bottom: 0.25rem;
  }
  .empty {
    font-size: 0.7rem;
    color: var(--text-dim, #6a6a6a);
    font-style: italic;
  }
  .dose {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
    font-size: 0.74rem;
    margin-top: 0.3rem;
  }
  .nm {
    color: var(--text, #d8d8d8);
  }
  .qty {
    color: var(--text-dim, #8a8a8a);
  }
  .cures {
    margin-left: auto;
    font-size: 0.66rem;
    color: var(--text-dim, #6a6a6a);
  }
  .targets {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0.15rem 0 0.2rem 0.5rem;
  }
  .give {
    text-align: left;
    padding: 0.15rem 0.35rem;
    font-size: 0.68rem;
    background: var(--bg-alt, #17171a);
    color: var(--text-dim, #8a8a8a);
    border: 1px solid var(--border, #2c2c31);
    cursor: pointer;
  }
  .give:hover {
    color: var(--text, #d8d8d8);
  }
  /* The dose would actually do something for this patient. */
  .give.relevant {
    color: var(--accent, #9ec96a);
    border-color: var(--accent, #9ec96a);
  }
</style>
