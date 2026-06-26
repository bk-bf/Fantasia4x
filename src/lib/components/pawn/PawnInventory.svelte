<!-- PawnInventory.svelte — shows items the pawn is currently carrying -->
<script lang="ts">
  import type { Pawn, Item, ItemInstance } from '$lib/game/core/types';
  import ITEMS_DATABASE from '$lib/game/database/items.jsonc';
  import { itemService } from '$lib/game/services/ItemService';
  import { gameState } from '$lib/stores/gameState';

  export let pawn: Pawn;

  $: pinned = new Set(pawn.pinnedItems ?? []);
  // Pinned items sort to the top; otherwise stable order.
  $: carried = Object.entries(pawn.inventory?.items ?? {})
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => (pinned.has(b) ? 1 : 0) - (pinned.has(a) ? 1 : 0));
  // Every tracked instance in the pack — a fetched/carried TOOL or weapon (axe, hammer, pick), a
  // hauled carcass, or a rescued colonist being carried as a `carried_pawn` body. Tools live in
  // `inventory.instances` (not the bulk count map), so without listing all instances a carried axe
  // was invisible in the carry UI. Each unit is one row (instances aren't stackable — they have
  // per-unit durability/quality).
  $: carriedInstances = pawn.inventory?.instances ?? [];

  function instanceLabel(inst: ItemInstance): string {
    if (inst.famed && inst.famedName) return inst.famedName;
    return itemService.getItemDisplayName({
      resourceId: inst.itemId,
      name: inst.name,
      quality: inst.quality
    });
  }

  function dropInstance(inst: ItemInstance) {
    gameState.command({
      type: 'dropCarriedItem',
      payload: { pawnId: pawn.id, itemId: inst.itemId, instanceId: inst.instanceId },
      save: true
    });
  }

  function togglePin(itemId: string) {
    gameState.command({ type: 'togglePinItem', payload: { pawnId: pawn.id, itemId }, save: true });
  }

  function dropItem(itemId: string) {
    gameState.command({
      type: 'dropCarriedItem',
      payload: { pawnId: pawn.id, itemId },
      save: true
    });
  }
  // Derive load + budget from the service (single source of truth = item defs). The cached
  // pawn.inventory.weightKg is a write-only initial-shape field that is never updated on
  // inventory mutation, so reading it showed a stale 0.0 (review R5 / playtest 2026-06-13).
  $: cap = itemService.getCarryCapacityBreakdown(pawn);
  $: load = itemService.getCurrentCarryLoad(pawn, $gameState);
  $: maxWeightKg = cap.weight.total;
  $: maxVolumeL = cap.volume.total;
  $: weightKg = load.weightKg;
  $: volumeL = load.volumeL;
  // Raw (pre-floor) sums — when below 1 the budget is clamped to the 1.0 minimum.
  $: wRaw = cap.weight.capacity + cap.weight.gear;
  $: vRaw = cap.volume.capacity + cap.volume.gear;
  $: isEmpty = carried.length === 0 && carriedInstances.length === 0;

  const r1 = (n: number) => Math.round(n * 10) / 10;
  const signed = (n: number) => (n >= 0 ? '+' : '−') + r1(Math.abs(n));
  const pct = (f: number) => `${Math.round(f * 100)}%`;

  function itemName(id: string): string {
    return (ITEMS_DATABASE as Item[]).find((i) => i.id === id)?.name ?? id;
  }
</script>

<div class="inv-section">
  <div class="section-hdr">
    | CARRYING
    <span class="capacity">
      [{weightKg.toFixed(1)}/{maxWeightKg.toFixed(1)} kg · {volumeL.toFixed(1)}/{maxVolumeL.toFixed(
        1
      )} L]
      <div class="cap-tip">
        <div class="tip-formula">CARRY CAPACITY — {cap.size} · {cap.bodyWeight}kg</div>
        <div class="tip-row">
          weight = <span class="tv">{cap.bodyWeight}kg</span> ×
          <span class="tv">{pct(cap.weight.loadFraction)}</span> load (STR {cap.strength}){#if cap.weight.gear}
            <span class="tv">{signed(cap.weight.gear)}</span> gear{/if} =
          <span class="tv">{r1(maxWeightKg)}</span> kg{#if wRaw < maxWeightKg}
            <span class="floor">(min 1)</span>{/if}
        </div>
        <div class="tip-row">
          volume = <span class="tv">{cap.bodyWeight}kg</span> ×
          <span class="tv">{pct(cap.volume.fraction)}</span>{#if cap.volume.gear}
            <span class="tv">{signed(cap.volume.gear)}</span> gear{/if} =
          <span class="tv">{r1(maxVolumeL)}</span> L{#if vRaw < maxVolumeL}
            <span class="floor">(min 1)</span>{/if}
        </div>
        {#if cap.gearSources.length}
          <div class="tip-gear">
            {#each cap.gearSources as g}
              <div>
                {g.name}: <span class="tv">+{r1(g.weightKg)}</span> kg,
                <span class="tv">+{r1(g.volumeL)}</span> L
              </div>
            {/each}
          </div>
        {:else}
          <div class="tip-gear">no belt/back container — equip one to raise capacity</div>
        {/if}
      </div>
    </span>
  </div>

  {#if isEmpty}
    <div class="empty">nothing carried</div>
  {:else}
    {#each carriedInstances as inst (inst.instanceId)}
      <div class="row instance">
        <span class="carry-mark">⚑</span>
        <span class="item-name">{instanceLabel(inst)}</span>
        {#if inst.itemId === 'carried_pawn'}
          <span class="qty">carried</span>
          <button
            class="drop-btn"
            title="Set down — lay the carried colonist on the pawn's tile and end the carry."
            on:click={() => dropItem(inst.itemId)}>↓</button
          >
        {:else}
          <span class="qty">×1</span>
          <button
            class="drop-btn"
            title="Drop now — put this item down on the pawn's tile."
            on:click={() => dropInstance(inst)}>↓</button
          >
        {/if}
      </div>
    {/each}
    {#each carried as [itemId, qty]}
      <div class="row" class:pinned={pinned.has(itemId)}>
        <button
          class="pin-btn"
          class:active={pinned.has(itemId)}
          title={pinned.has(itemId)
            ? 'Pinned — kept in hand, never deposited. Click to unpin.'
            : 'Pin — keep this item (the pawn never deposits it).'}
          on:click={() => togglePin(itemId)}>{pinned.has(itemId) ? '★' : '☆'}</button
        >
        <span class="item-name">{itemName(itemId)}</span>
        <span class="qty">×{qty}</span>
        <button
          class="drop-btn"
          title="Drop now — put this stack down on the pawn's tile."
          on:click={() => dropItem(itemId)}>↓</button
        >
      </div>
    {/each}
  {/if}
</div>

<style>
  .inv-section {
    margin-bottom: 1rem;
  }

  .section-hdr {
    font-family: var(--font-mono, monospace);
    color: var(--accent, #0f0);
    font-size: 0.75rem;
    margin-bottom: 0.4rem;
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }

  .capacity {
    position: relative;
    color: var(--text-dim, #666);
    font-size: 0.7rem;
    cursor: help;
  }

  .cap-tip {
    display: none;
    position: absolute;
    z-index: 60;
    left: 0;
    top: 100%;
    min-width: 240px;
    max-width: 340px;
    padding: 6px 8px;
    background: var(--bg-panel, #0c1118);
    border: 1px solid var(--border-hi, #3a4658);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    color: var(--text, #ccc);
    font-size: 10px;
    line-height: 1.5;
    text-transform: none;
    pointer-events: none;
  }
  .capacity:hover .cap-tip {
    display: block;
  }
  .tip-formula {
    color: var(--accent-hi, #ffd24a);
  }
  .tip-row {
    margin-top: 3px;
    color: var(--text-dim, #888);
  }
  .tip-gear {
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px solid var(--border, #222);
    color: var(--text-dim, #888);
    font-style: italic;
  }
  .cap-tip .tv {
    color: #4caf50;
  }
  .cap-tip .floor {
    color: var(--text-dim, #888);
    font-style: italic;
  }

  .empty {
    color: var(--text-dim, #666);
    font-size: 0.75rem;
    font-style: italic;
    padding-left: 0.5rem;
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    padding: 0.1rem 0.5rem;
  }

  .pin-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-size: 0.8rem;
    line-height: 1;
    color: var(--text-dim, #666);
  }
  .pin-btn:hover {
    color: var(--text, #ccc);
  }
  .pin-btn.active {
    color: var(--accent-hi, #ffd24a);
  }

  .drop-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0 0 0.3rem;
    font-size: 0.8rem;
    line-height: 1;
    color: var(--text-dim, #666);
  }
  .drop-btn:hover {
    color: var(--neg, #e05a5a);
  }

  .row.pinned .item-name {
    color: var(--accent-hi, #ffd24a);
  }
  .row.instance .item-name {
    color: var(--accent-hi, #ffd24a);
    text-transform: none;
  }
  .carry-mark {
    color: var(--neg, #e05a5a);
    font-size: 0.8rem;
    line-height: 1;
  }

  .item-name {
    color: var(--text, #ccc);
    text-transform: uppercase;
  }

  .qty {
    color: var(--accent, #0f0);
    font-weight: bold;
    margin-left: auto;
  }
</style>
