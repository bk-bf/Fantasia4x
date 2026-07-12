<!-- PawnConsumables.svelte — §2h: colony-stock potions & beast-organs this pawn can DRINK/EAT. Drawing
     from colony stock (not the pawn's pack), the USE action makes THIS pawn consume one, applying its
     timed buff (potion) or permanent trait grant + Faustian flaw (organ) via the useConsumableItem cmd. -->
<script lang="ts">
  import type { Pawn, Item } from '$lib/game/core/types';
  import { itemService } from '$lib/game/services/ItemService';
  import { gameState } from '$lib/stores/gameState';

  let { pawn }: { pawn: Pawn } = $props();

  // A stock item is "usable here" if it's drinkable for a timed buff, grants a trait on eating, OR is a
  // weapon coating (brushed onto the pawn's mainHand).
  function isConsumable(def: Item | undefined): boolean {
    if (!def) return false;
    return (
      (!!def.grantsConditions?.length && !!def.conditionDurationTurns) ||
      !!def.grantsTraitOnConsume ||
      !!def.coatingEffect
    );
  }

  const rows = $derived(
    Object.entries($gameState.stockpile ?? {})
      .filter(([id, qty]) => qty > 0 && isConsumable(itemService.getItemById(id)))
      .map(([id, qty]) => {
        const def = itemService.getItemById(id) as Item;
        const traitId = def.grantsTraitOnConsume;
        const isCoating = !!def.coatingEffect;
        // An organ whose trait the pawn already carries is a no-op (the command won't spend it); a
        // coating needs a mainHand weapon to brush onto.
        const alreadyGained = !!traitId && (pawn.traits ?? []).some((t) => t.id === traitId);
        const noWeapon = isCoating && !pawn.equipment?.mainHand;
        return { id, qty, def, isOrgan: !!traitId, isCoating, alreadyGained, noWeapon };
      })
      .sort((a, b) => a.def.name.localeCompare(b.def.name))
  );

  function use(itemId: string) {
    gameState.command({
      type: 'useConsumableItem',
      payload: { pawnId: pawn.id, itemId },
      save: true
    });
  }

  function coat(itemId: string) {
    gameState.command({
      type: 'applyWeaponCoating',
      payload: { pawnId: pawn.id, itemId },
      save: true
    });
  }
</script>

{#if rows.length > 0}
  <div class="inv-section">
    <div class="section-hdr">| CONSUMABLES</div>
    <div class="list">
      {#each rows as row (row.id)}
        <div class="row" title={row.def.description ?? ''}>
          <span class="name">{row.def.name}</span>
          <span class="qty">×{row.qty}</span>
          {#if row.isCoating}
            <button
              class="use coating"
              disabled={row.noWeapon}
              title={row.noWeapon
                ? 'No mainHand weapon to coat — equip one first.'
                : 'Coat — brush it onto this pawn’s weapon for a while.'}
              onclick={() => coat(row.id)}
            >
              COAT
            </button>
          {:else}
            <button
              class="use"
              class:organ={row.isOrgan}
              disabled={row.alreadyGained}
              title={row.alreadyGained
                ? 'This pawn already carries this gift.'
                : row.isOrgan
                  ? 'Eat — a permanent gift, and a flaw with it.'
                  : 'Drink — a buff for a while.'}
              onclick={() => use(row.id)}
            >
              {row.alreadyGained ? 'GAINED' : row.isOrgan ? 'EAT' : 'DRINK'}
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .inv-section {
    margin-bottom: 1rem;
  }
  .section-hdr {
    font-family: var(--font-mono, monospace);
    color: var(--accent, #0f0);
    font-size: 0.75rem;
    margin-bottom: 0.4rem;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 0 2px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-mono, monospace);
    font-size: 0.72rem;
    color: var(--text, #ccc);
  }
  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .qty {
    color: var(--text-dim, #666);
  }
  .use {
    border: 1px solid var(--accent, #0f0);
    background: transparent;
    color: var(--accent, #0f0);
    font-family: inherit;
    font-size: 0.66rem;
    letter-spacing: 0.05em;
    padding: 1px 6px;
    cursor: pointer;
  }
  .use.organ {
    border-color: var(--accent-hi, #ffd24a);
    color: var(--accent-hi, #ffd24a);
  }
  .use.coating {
    border-color: #9c6ad6;
    color: #b98fe6;
  }
  .use:hover:not(:disabled) {
    background: var(--accent, #0f0);
    color: var(--bg, #000);
  }
  .use.organ:hover:not(:disabled) {
    background: var(--accent-hi, #ffd24a);
  }
  .use.coating:hover:not(:disabled) {
    background: #9c6ad6;
    color: var(--bg, #000);
  }
  .use:disabled {
    border-color: var(--text-dim, #666);
    color: var(--text-dim, #666);
    cursor: default;
  }
</style>
