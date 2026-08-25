<!--
  What the vessels in THIS pawn's pack are holding, and what it can do with it right there. A phial of
  potion on a pawn's belt is no use to anybody if the only way to drink it is to haul it back to the
  stockpile first, so the same DRINK / COAT actions the colony-stock list offers are offered here,
  spending the dose out of the carried vessel instead of the colony's stock.

  Water is the exception, and deliberately: drinking is a NEED, so it routes through the FSM as a
  drink order rather than resolving instantly — the pawn stops what it is doing and takes a drink.
-->
<script lang="ts">
  import type { Item, ItemInstance, Pawn } from '$lib/game/core/types';
  import { itemService } from '$lib/game/services/ItemService';
  import { gameState } from '$lib/stores/gameState';
  import { servingL, vesselOf } from '$lib/game/core/rules/gear/vessels';

  let { pawn }: { pawn: Pawn } = $props();

  /** A fluid the pawn can act on: a timed draught, a trait-granting essence, or a weapon coating. */
  function usableKind(def: Item | undefined): 'drink' | 'consume' | 'coat' | null {
    if (!def) return null;
    if (def.id === 'water') return 'drink';
    if (def.coatingEffect) return 'coat';
    if ((def.grantsConditions?.length && def.conditionDurationTurns) || def.grantsTraitOnConsume)
      return 'consume';
    return null;
  }

  const rows = $derived(
    (pawn.inventory?.instances ?? [])
      .filter((inst) => vesselOf(inst.itemId) && inst.contents?.length)
      .flatMap((inst) =>
        (inst.contents ?? []).map((e) => {
          const def = itemService.getItemById(e.itemId);
          const vessel = itemService.getItemById(inst.itemId);
          return {
            key: `${inst.instanceId}:${e.itemId}`,
            inst,
            def,
            vesselName: vessel?.name ?? inst.itemId,
            // Fluids read in litres because that is what the vessel measures; solids in units.
            amount: e.litres != null ? `${e.litres} L` : `×${e.amount}`,
            doses: e.litres != null ? Math.floor(e.litres / servingL(e.itemId)) : (e.amount ?? 0),
            kind: usableKind(def)
          };
        })
      )
      .filter((r) => r.def)
  );

  function act(row: (typeof rows)[number]) {
    if (row.kind === 'drink') {
      // A need, not an instant effect — the pawn walks off the job and drinks, out of the very skin
      // it is carrying (handleDrinking reaches for a carried vessel before anything else).
      gameState.command({
        type: 'setPawnDraftTarget',
        payload: {
          pawnId: pawn.id,
          target: { type: 'drink', x: pawn.position?.x ?? 0, y: pawn.position?.y ?? 0 }
        },
        save: true
      });
      return;
    }
    gameState.command({
      type: row.kind === 'coat' ? 'applyWeaponCoating' : 'useConsumableItem',
      payload: {
        pawnId: pawn.id,
        itemId: row.def!.id,
        vesselInstanceId: row.inst.instanceId
      },
      save: true
    });
  }

  const label = (kind: string | null) =>
    kind === 'drink' ? 'Drink' : kind === 'coat' ? 'Coat' : 'Use';
</script>

{#if rows.length > 0}
  <div class="inv-section">
    <div class="section-hdr">| IN VESSELS</div>
    <div class="list">
      {#each rows as row (row.key)}
        <div class="row" title={row.def?.description ?? ''}>
          <span class="name">{row.def?.name}</span>
          <span class="vessel">in {row.vesselName}</span>
          <span class="qty">{row.amount}</span>
          {#if row.kind}
            <button
              class="use"
              disabled={row.doses < 1 || (row.kind === 'coat' && !pawn.equipment?.mainHand)}
              title={row.kind === 'coat' && !pawn.equipment?.mainHand
                ? 'No mainHand weapon to coat — equip one first.'
                : row.doses < 1
                  ? 'Not enough left for a dose.'
                  : ''}
              onclick={() => act(row)}>{label(row.kind)}</button
            >
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .inv-section {
    margin-top: 6px;
  }
  .section-hdr {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-dim, #888);
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vessel {
    color: var(--text-dim, #777);
  }
  .qty {
    color: var(--text-dim, #999);
    min-width: 44px;
    text-align: right;
  }
  .use {
    background: transparent;
    border: 1px solid var(--border, #555);
    color: var(--text, #ccc);
    font-family: inherit;
    font-size: 10px;
    padding: 0 5px;
    cursor: pointer;
  }
  .use:hover:not(:disabled) {
    border-color: var(--accent-hi, #ffd24a);
    color: var(--accent-hi, #ffd24a);
  }
  .use:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
