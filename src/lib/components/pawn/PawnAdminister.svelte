<script lang="ts">
  import type { Pawn, Item } from '$lib/game/core/types';
  import { itemService } from '$lib/game/services/ItemService';
  import { carriedQuantities, isFluidId, servingL } from '$lib/game/core/rules/gear/vessels';
  import { gameState } from '$lib/stores/gameState';
  import { conditionViewForId } from '$lib/components/util/conditionInfo';
  import { woundById } from '$lib/game/core/defs/wounds';

  let { pawn }: { pawn: Pawn } = $props();

  function clears(def: Item): string[] {
    return [
      ...(def.curesConditions ?? []).map((c) => conditionViewForId(c)?.name ?? c),
      ...(def.mendsWounds ?? []).map((w) => woundById(w)?.name ?? w)
    ];
  }

  const doses = $derived(
    Object.entries(carriedQuantities(pawn))
      .filter(([id, qty]) => {
        const def = itemService.getItemById(id);
        return qty > 0 && !!def && clears(def).length > 0;
      })
      .map(([id, qty]) => ({
        id,
        qty: isFluidId(id) ? Math.floor(qty / servingL(id)) : qty,
        def: itemService.getItemById(id) as Item
      }))
      .filter((d) => d.qty > 0)
  );

  const adjacent = $derived(
    ($gameState.pawns ?? []).filter((p) => {
      if (p.id === pawn.id || p.isAlive === false) return false;
      const a = pawn.position;
      const b = p.position;
      if (!a || !b) return false;
      return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
    })
  );

  function treats(def: Item, patient: Pawn): string[] {
    const active = new Set(Object.keys(patient.conditionTimers ?? {}));
    const carried = new Set<string>();
    for (const l of patient.limbs ?? [])
      for (const pt of l.parts ?? []) for (const w of pt.injuries) carried.add(w.type);
    return [
      ...(def.curesConditions ?? [])
        .filter((c) => active.has(c))
        .map((c) => conditionViewForId(c)?.name ?? c),
      ...(def.mendsWounds ?? []).filter((w) => carried.has(w)).map((w) => woundById(w)?.name ?? w)
    ];
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
        <span class="cures">{clears(d.def).join(', ')}</span>
      </div>
      <div class="targets">
        {#each adjacent as p (p.id)}
          {@const hit = treats(d.def, p)}
          <button
            class="give"
            class:relevant={hit.length > 0}
            title={hit.length
              ? `Clears ${hit.join(', ')} on ${p.name}`
              : `${p.name} has none of ${clears(d.def).join(', ')} — the dose would be wasted`}
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
  .give.relevant {
    color: var(--accent, #9ec96a);
    border-color: var(--accent, #9ec96a);
  }
</style>
