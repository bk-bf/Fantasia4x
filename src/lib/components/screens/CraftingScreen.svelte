<script lang="ts">
  import { gameState, currentItem, currentRace } from '$lib/stores/gameState';
  import CurrentTask from '$lib/components/UI/CurrentTask.svelte';
  import { uiState } from '$lib/stores/uiState';
  import TaskContainer from '$lib/components/UI/TaskContainer.svelte';
  import ITEMS_DATABASE from '$lib/game/database/items.jsonc';
  import { gameEngine } from '$lib/game/systems/GameEngineImpl';
  import { itemService } from '$lib/game/services/ItemService';
  import { onDestroy } from 'svelte';
  import type { Item, Pawn } from '$lib/game/core/types';

  let itemMap: Record<string, number> = {};
  let race: any = null;
  let inventory: Record<string, number> = {};
  let craftingQueue: any[] = [];
  let completedResearch: string[] = [];
  let availableBuildings: string[] = [];
  let currentToolLevel = 0;
  let currentPopulation = 0;
  let pawns: Pawn[] = [];

  // Station assignment: workshopType (or 'ground') → pawnId | null (null = any)
  let stationAssignments: Record<string, string | null> = {};

  // Workshop sections — all crafting requires a designated station
  const WORKSHOP_SECTIONS: Array<{ id: string; label: string }> = [
    { id: 'craft_spot', label: 'CRAFT SPOT' },
    { id: 'campfire', label: 'CAMPFIRE' },
    { id: 'makers_bench', label: "MAKER'S BENCH" }
  ];

  $: getItemAmount = (itemId: string): number => itemMap[itemId] || 0;

  // All craftable items — split by workshop in template
  $: allCraftableItems = $gameState ? gameEngine.getCraftableItems() : [];

  $: firstCraftingInProgress = craftingQueue.length > 0 ? craftingQueue[0] : null;

  const unsubscribeItem = currentItem.subscribe((items) => {
    itemMap = {};
    items.forEach((item) => {
      itemMap[item.id] = Math.floor(item.amount);
    });
  });

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
    currentPopulation = value?.population || 0;
  });

  const unsubscribeGame = gameState.subscribe((state) => {
    if (!state) return;
    craftingQueue = state.craftingQueue || [];
    completedResearch = state.completedResearch || [];
    currentToolLevel = state.currentToolLevel || 0;
    pawns = state.pawns || [];

    availableBuildings = [
      ...new Set((state.buildings ?? []).filter((b) => b.status === 'complete').map((b) => b.type))
    ];

    // Sync station assignments from persisted state
    if (state.craftingStationAssignments) {
      stationAssignments = { ...state.craftingStationAssignments };
    }
  });

  onDestroy(() => {
    unsubscribeItem();
    unsubscribeRace();
    unsubscribeGame();
  });

  function setStationAssignment(wsId: string, pawnId: string | null) {
    const key = wsId;
    stationAssignments = { ...stationAssignments, [key]: pawnId };
    gameState.update((state) => ({
      ...state,
      craftingStationAssignments: { ...(state.craftingStationAssignments ?? {}), [key]: pawnId }
    }));
  }

  function startCrafting(item: Item) {
    if (!$gameState) return;
    gameEngine.craftItem(item.id, 1);
  }

  function cancelCrafting(queueIndex: number) {
    if (queueIndex < 0 || queueIndex >= craftingQueue.length) return;
    const canceledItem = craftingQueue[queueIndex];
    const item = canceledItem.item;
    gameState.update((state) => {
      const refundedItems = state.item.map((si) => {
        const refund = item.craftingCost?.[si.id] || 0;
        return { ...si, amount: si.amount + refund };
      });
      const newQueue = [...(state.craftingQueue || [])];
      newQueue.splice(queueIndex, 1);
      return { ...state, item: refundedItems, craftingQueue: newQueue };
    });
  }

  function getTypeIcon(type: string): string {
    switch (type) {
      case 'material':
        return '📦';
      case 'tool':
        return '🔧';
      case 'weapon':
        return '⚔️';
      case 'armor':
        return '🛡️';
      case 'consumable':
        return '🧪';
      case 'currency':
        return '💰';
      default:
        return '📋';
    }
  }
</script>

<div class="crafting-screen">
  <div class="screen-hdr">
    | CRAFTING
    <button class="hdr-btn" on:click={() => uiState.setScreen('main')}>BACK</button>
  </div>

  <!-- Crafting Queue -->
  <div class="section-hdr sub">| CRAFTING QUEUE ({craftingQueue.length})</div>
  {#if craftingQueue.length > 0}
    {#each craftingQueue as qi, idx}
      {@const pct = Math.round(
        ((qi.item.craftingTime - qi.turnsRemaining) / qi.item.craftingTime) * 100
      )}
      <div class="queue-row">
        <span class="q-name">{qi.item.name.toUpperCase()}</span>
        <span class="q-prog">
          <span class="bar-ascii"
            >{'█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))}</span
          >
          {qi.turnsRemaining}t
        </span>
        <button class="act-btn-sm" on:click={() => cancelCrafting(idx)}>CANCEL</button>
      </div>
    {/each}
  {:else}
    <div class="muted-row">no active crafting</div>
  {/if}

  <!-- Workshop sections: built stations first, unbuilt collapsed -->
  {#each WORKSHOP_SECTIONS as ws}
    <!-- CRAFT SPOT also shows items with no workshopType (basic crafting needs a safe spot) -->
    {@const wsItems = allCraftableItems.filter((i) =>
      ws.id === 'craft_spot'
        ? (i.workshopType ?? null) === 'craft_spot' || (i.workshopType ?? null) === null
        : (i.workshopType ?? null) === ws.id
    )}
    {@const wsBuilt = availableBuildings.includes(ws.id)}
    {@const stationKey = ws.id}
    {@const assignedPawnId = stationAssignments[stationKey] ?? null}

    {#if wsBuilt}
      <!-- Built station — show full section -->
      <div class="section-hdr">
        | {ws.label}
        <span class="ws-badge ws-ready">[READY]</span>
      </div>

      <!-- Pawn assignment row -->
      <div class="station-assign-row">
        <span class="assign-label">ASSIGNED:</span>
        <select
          class="assign-select"
          value={assignedPawnId ?? ''}
          on:change={(e) =>
            setStationAssignment(ws.id, (e.currentTarget as HTMLSelectElement).value || null)}
        >
          <option value="">any eligible pawn</option>
          {#each pawns as p}
            <option value={p.id}>{p.name}</option>
          {/each}
        </select>
      </div>

      {#if wsItems.length > 0}
        {#each wsItems as item}
          {@const craftable = $gameState !== null && itemService.canCraftItem(item.id, $gameState)}
          {@const affordable = item.craftingCost
            ? Object.entries(item.craftingCost).every(
                ([id, n]) => getItemAmount(id) >= (n as number)
              )
            : true}
          <div class="recipe-row">
            <span class="recipe-name">{getTypeIcon(item.type ?? '')} {item.name.toUpperCase()}</span
            >
            <span class="recipe-cost">
              {#if item.craftingCost && Object.keys(item.craftingCost).length > 0}
                {#each Object.entries(item.craftingCost) as [id, n], ci}
                  {@const have = getItemAmount(id)}
                  {#if ci > 0}<span class="cost-sep">·</span>{/if}
                  <span class="cost-item" class:neg-text={have < (n as number)}>
                    {id.replace(/_/g, ' ')} <span class="cost-qty">×{n}</span>
                    <span class="cost-have" class:neg-text={have < (n as number)}>({have})</span>
                  </span>
                {/each}
              {:else}
                <span class="muted-text">free</span>
              {/if}
            </span>
            <button
              class="act-btn-sm"
              class:active={craftable}
              on:click={() => startCrafting(item)}
              disabled={!craftable}
            >
              {#if !affordable}MISSING
              {:else if !craftable}BLOCKED
              {:else}CRAFT{/if}
            </button>
          </div>
        {/each}
      {:else}
        <div class="muted-row">no recipes for this station</div>
      {/if}
    {:else if wsItems.length > 0}
      <!-- Unbuilt station — show dim header only -->
      <div class="section-hdr locked">
        | {ws.label}
        <span class="ws-badge ws-need">[BUILD FIRST]</span>
        <span class="ws-count">{wsItems.length} recipes</span>
      </div>
    {/if}
  {/each}

  {#if allCraftableItems.length === 0}
    <div class="muted-row">no recipes available</div>
  {/if}
</div>

<style>
  .crafting-screen {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    display: flex;
    flex-direction: column;
  }

  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
  }

  .hdr-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--accent);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 2px 6px;
    cursor: pointer;
  }

  .section-hdr {
    padding: 5px 10px 3px;
    color: var(--accent-hi);
    font-size: 10px;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border);
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .section-hdr.sub {
    color: var(--accent);
    margin-top: 2px;
  }
  .section-hdr.locked {
    opacity: 0.45;
  }

  .ws-badge {
    font-size: 9px;
    padding: 1px 4px;
    border: 1px solid;
  }
  .ws-ready {
    color: var(--pos);
    border-color: var(--pos);
  }
  .ws-need {
    color: var(--text-dim);
    border-color: var(--border);
  }
  .ws-count {
    font-size: 9px;
    color: var(--text-dim);
    margin-left: auto;
  }

  .station-assign-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
    background: color-mix(in srgb, var(--bg-panel) 60%, transparent);
  }

  .assign-label {
    font-size: 9px;
    color: var(--text-dim);
    letter-spacing: 0.06em;
    flex-shrink: 0;
  }

  .assign-select {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--accent);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 1px 4px;
    flex: 1;
    max-width: 200px;
  }

  .queue-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  }

  .q-name {
    flex: 0 0 160px;
    font-size: 11px;
    color: var(--text);
  }

  .q-prog {
    flex: 1;
    display: flex;
    gap: 4px;
    align-items: center;
    font-size: 10px;
    color: var(--text-dim);
  }

  .bar-ascii {
    color: var(--accent);
    font-size: 9px;
    letter-spacing: -1px;
  }

  .recipe-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
    flex-wrap: wrap;
  }
  .recipe-row:hover {
    background: var(--bg-hover);
  }

  .recipe-name {
    flex: 0 0 160px;
    font-size: 11px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recipe-cost {
    flex: 1;
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    align-items: center;
    font-size: 10px;
    color: var(--text-dim);
  }

  .cost-sep {
    color: var(--text-dim);
    opacity: 0.4;
    margin: 0 1px;
  }

  .cost-item {
    display: inline-flex;
    gap: 2px;
    align-items: center;
  }

  .cost-qty {
    color: var(--accent);
  }

  .cost-have {
    opacity: 0.6;
  }

  .muted-text {
    color: var(--text-dim);
  }

  .neg-text {
    color: var(--neg);
  }

  .act-btn-sm {
    flex: 0 0 auto;
    background: none;
    border: 1px solid var(--border);
    color: var(--accent);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 2px 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  .act-btn-sm.active,
  .act-btn-sm:hover:not(:disabled) {
    border-color: var(--accent-hi);
    color: var(--accent-hi);
    background: var(--bg-active);
  }
  .act-btn-sm:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .muted-row {
    padding: 4px 10px;
    font-size: 10px;
    color: var(--text-dim);
  }
</style>
