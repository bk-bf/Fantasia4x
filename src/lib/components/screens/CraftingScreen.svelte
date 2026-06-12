<script lang="ts">
  import { gameState, currentRace } from '$lib/stores/gameState';
  import CurrentTask from '$lib/components/UI/CurrentTask.svelte';
  import BuildCard from '$lib/components/UI/BuildCard.svelte';
  import { uiState } from '$lib/stores/uiState';
  import TaskContainer from '$lib/components/UI/TaskContainer.svelte';
  import ITEMS_DATABASE from '$lib/game/database/items.jsonc';
  import { gameEngine } from '$lib/game/systems/GameEngineImpl';
  import { itemService } from '$lib/game/services/ItemService';
  import { recipeService } from '$lib/game/services/RecipeService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { onDestroy } from 'svelte';
  import type { Item, Pawn } from '$lib/game/core/types';

  // Recipe registry: per-item recipe lookups (static DBs — plain functions, not reactive).
  const recipeOf = (itemId: string) => recipeService.getRecipeForItem(itemId);
  const stationOf = (itemId: string) => recipeOf(itemId)?.station ?? null;
  const costOf = (itemId: string): Record<string, number> => {
    const r = recipeOf(itemId);
    if (!r) return {};
    return Object.keys(r.inputs).length ? r.inputs : (r.inputAlternatives?.[0] ?? {});
  };
  /** Byproduct outputs (excluding the primary item) for display. */
  const byproductsOf = (itemId: string): [string, number][] => {
    const r = recipeOf(itemId);
    if (!r) return [];
    return Object.entries(r.outputs).filter(([id]) => id !== itemId);
  };
  const primaryQtyOf = (itemId: string): number => recipeOf(itemId)?.outputs[itemId] ?? 1;

  let race: any = null;
  let craftingQueue: any[] = [];
  let completedResearch: string[] = [];
  let availableBuildings: string[] = [];
  let currentToolLevel = 0;
  let currentPopulation = 0;
  let pawns: Pawn[] = [];

  // Read item amounts directly from the stockpile aggregate — the single source of truth.
  // gameState.item is a legacy no-op array (addToItemArray is a stub) and must not be used.
  $: itemMap = $gameState?.stockpile ?? {};

  // Station assignment: workshopType (or 'ground') → pawnId | null (null = any)
  let stationAssignments: Record<string, string | null> = {};

  // Workshop sections — derived from the recipe registry so every station with recipes
  // gets a section (curated early-game order first, the rest appended alphabetically).
  const SECTION_ORDER = ['craft_spot', 'campfire', 'hearth', 'makers_bench', 'butcher_spot'];
  const WORKSHOP_SECTIONS: Array<{ id: string; label: string }> = (() => {
    const stations = new Set<string>(SECTION_ORDER);
    for (const r of recipeService.getAllRecipes()) {
      if (r.station) stations.add(r.station);
    }
    const label = (id: string) =>
      (buildingService.getBuildingById(id)?.name ?? id.replace(/_/g, ' ')).toUpperCase();
    const ordered = SECTION_ORDER.filter((id) => stations.has(id));
    const rest = [...stations].filter((id) => !SECTION_ORDER.includes(id)).sort();
    return [...ordered, ...rest].map((id) => ({ id, label: label(id) }));
  })();

  $: getItemAmount = (itemId: string): number => itemMap[itemId] || 0;

  // All unlocked recipes — split by workshop in template.
  // Filtered by research + population only (not materials/tools/building) so recipes are always
  // visible for built stations; the per-item craftable flag controls the CRAFT button.
  $: allCraftableItems = $gameState
    ? (ITEMS_DATABASE as Item[]).filter((item) => {
        // Include carcass items for butchery
        if (item.isCarcass && item.yields) return true;
        // Include items with a producing recipe (authored or synthesised)
        const recipe = recipeOf(item.id);
        if (!recipe) return false;
        if (recipe.researchRequired && !completedResearch.includes(recipe.researchRequired))
          return false;
        if (recipe.populationRequired && currentPopulation < recipe.populationRequired)
          return false;
        return true;
      })
    : [];

  $: firstCraftingInProgress = craftingQueue.length > 0 ? craftingQueue[0] : null;

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
      const refundCost = costOf(item.id);
      const refundedItems = state.item.map((si) => {
        const refund = refundCost[si.id] || 0;
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
        return '[MAT]';
      case 'tool':
        return '[TOOL]';
      case 'weapon':
        return '[WPN]';
      case 'armor':
        return '[ARM]';
      case 'consumable':
        return '[CON]';
      case 'currency':
        return '[CUR]';
      default:
        return '[ITEM]';
    }
  }
</script>

4713:1898827
<div class="crafting-screen">
  <div class="screen-hdr">
    | CRAFTING
    <button class="hdr-btn" on:click={() => uiState.setScreen('main')}>BACK</button>
  </div>

  <!-- Crafting Queue -->
  <div class="section-hdr sub">| CRAFTING QUEUE ({craftingQueue.length})</div>
  {#if craftingQueue.length > 0}
    {#each craftingQueue as qi, idx}
      {@const wReq = qi.workRequired ?? (recipeOf(qi.item.id)?.workAmount ?? 1) * 5}
      {@const wDone = qi.workDone ?? 0}
      {@const pct = Math.round(Math.min(100, (wDone / wReq) * 100))}
      <div class="queue-row">
        <span class="q-name">{qi.item.name.toUpperCase()}</span>
        <span class="q-prog">
          <span class="bar-ascii"
            >{'█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))}</span
          >
          {pct}%
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
    {@const wsItems = allCraftableItems.filter((i) => {
      // Carcass items go to butcher_spot
      if (i.isCarcass && i.yields) return ws.id === 'butcher_spot';
      // Regular items go to their recipe's station
      const st = stationOf(i.id);
      return ws.id === 'craft_spot' ? st === 'craft_spot' || st === null : st === ws.id;
    })}
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
        <div class="card-grid">
          {#each wsItems as item}
            {@const craftable = $gameState !== null && itemService.canCraftItem(item.id, $gameState)}
            {@const isCarcass = item.isCarcass && item.yields}
            {@const displayCost = isCarcass ? {} : costOf(item.id)}
            {@const affordable = isCarcass
              ? getItemAmount(item.id) > 0
              : Object.entries(displayCost).every(([id, n]) => getItemAmount(id) >= (n as number))}
            {@const intactness = $gameState?.carcassIntactness?.[item.id] ?? 100}
            {@const pct = Math.round(intactness)}
            <BuildCard
              icon={getTypeIcon(item.type ?? '')}
              name={item.name.toUpperCase()}
              badge={isCarcass ? `${pct}%` : null}
              actionLabel={!affordable
                ? 'MISSING'
                : !craftable
                  ? 'BLOCKED'
                  : isCarcass
                    ? 'BUTCHER'
                    : 'CRAFT'}
              actionEnabled={craftable}
              variant={!affordable ? 'missing' : !craftable ? 'blocked' : 'ok'}
              onAction={() => startCrafting(item)}
            >
              {#if isCarcass}
                {#each item.yields as output, ci}
                  {@const outputDef = itemService.getItemById(output.item)}
                  {@const minScaled = Math.max(1, Math.round((output.min * intactness) / 100))}
                  {@const maxScaled = Math.max(1, Math.round((output.max * intactness) / 100))}
                  {#if ci > 0}<span class="cost-sep">·</span>{/if}
                  <span class="cost-item">
                    {outputDef?.name ?? output.item}
                    <span class="cost-qty">×{minScaled}-{maxScaled}</span>
                  </span>
                {/each}
              {:else}
                {#if Object.keys(displayCost).length > 0}
                  {#each Object.entries(displayCost) as [id, n], ci}
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
                {#if primaryQtyOf(item.id) > 1 || byproductsOf(item.id).length > 0}
                  <span class="cost-sep">→</span>
                  <span class="cost-item">
                    ×{primaryQtyOf(item.id)}
                    {#each byproductsOf(item.id) as [bid, bq]}
                      <span class="cost-sep">+</span>{bid.replace(/_/g, ' ')}
                      <span class="cost-qty">×{bq}</span>
                    {/each}
                  </span>
                {/if}
              {/if}
            </BuildCard>
          {/each}
        </div>
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
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 5px;
    padding: 5px 8px;
  }
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
