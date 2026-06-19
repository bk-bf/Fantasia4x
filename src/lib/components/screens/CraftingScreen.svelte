<script lang="ts">
  import { gameState, currentRace } from '$lib/stores/gameState';
  import BuildCard from '$lib/components/UI/BuildCard.svelte';
  import ItemPills, { type ItemPillView } from '$lib/components/UI/ItemPills.svelte';
  import FilterTabs from '$lib/components/UI/FilterTabs.svelte';
  import SearchBar from '$lib/components/UI/SearchBar.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';
  import { uiState } from '$lib/stores/uiState';
  import ITEMS_DATABASE from '$lib/game/database/items.jsonc';
  import { itemService } from '$lib/game/services/ItemService';
  import { recipeService } from '$lib/game/services/RecipeService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { releaseReservation } from '$lib/game/core/GameState';
  import { onDestroy } from 'svelte';
  import type { Item } from '$lib/game/core/types';

  // Recipe registry: per-item recipe lookups (static DBs — plain functions, not reactive).
  const recipeOf = (itemId: string) => recipeService.getRecipeForItem(itemId);
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
  /** Required workstation display name for a recipe, or null when hand-craftable (no station). */
  const stationNameOf = (itemId: string): string | null => {
    const stationId = recipeOf(itemId)?.station;
    if (!stationId) return null;
    return buildingService.getBuildingById(stationId)?.name ?? stationId.replace(/_/g, ' ');
  };

  let race: any = null;
  let craftingQueue: any[] = [];
  let completedResearch: string[] = [];
  let currentToolLevel = 0;
  let currentPopulation = 0;

  // Read item amounts directly from the stockpile aggregate — the single source of truth.
  // gameState.item is a legacy no-op array (addToItemArray is a stub) and must not be used.
  $: itemMap = $gameState?.stockpile ?? {};

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
        // DEBUG `_devResearchGateOff`: show research-locked recipes too (toggle in the DEBUG tab).
        if (
          !$gameState._devResearchGateOff &&
          recipe.researchRequired &&
          !completedResearch.includes(recipe.researchRequired)
        )
          return false;
        if (recipe.populationRequired && currentPopulation < recipe.populationRequired)
          return false;
        return true;
      })
    : [];

  $: firstCraftingInProgress = craftingQueue.length > 0 ? craftingQueue[0] : null;

  // Craft categories (filter tabs). Maps an item's data category onto a player-facing group.
  const CRAFT_CAT_ORDER = [
    'BUTCHERING',
    'COOKING',
    'WOOD & FUEL',
    'STONE',
    'METAL',
    'LEATHER',
    'TOOLS',
    'PACKS',
    'WEAPONS',
    'ARMOR',
    'MAGIC WEAPONS',
    'MAGIC GEAR',
    'GOODS',
    'MEDICINE'
  ];
  const CAT_GROUP: Record<string, string> = {
    wood: 'WOOD & FUEL',
    fuel: 'WOOD & FUEL',
    woodcutting: 'WOOD & FUEL',
    stone: 'STONE',
    construction: 'STONE',
    metal: 'METAL',
    ore: 'METAL',
    metalworking: 'METAL',
    leather: 'LEATHER',
    medicine: 'MEDICINE'
  };
  function craftCategory(item: Item): string {
    const t = String(item.type ?? '');
    const c = item.category ?? '';
    // Raw cuts have category 'meat' and no dynamicRecipe; preserved/cooked meats
    // (salted/dried) share category 'meat' but *consume* meat via a dynamicRecipe.
    const consumesMeat = !!recipeOf(item.id)?.dynamicRecipe;
    if (item.isCarcass || (c === 'meat' && !consumesMeat)) return 'BUTCHERING';
    // §M magic, split in two (checked before the type/material fallbacks):
    //   • arcane staves → MAGIC WEAPONS (caught before WEAPONS);
    //   • jewelry (rings/amulets/crowns) + cut/attuned gems → MAGIC GEAR.
    if (item.weaponProperties?.arcane) return 'MAGIC WEAPONS';
    if (c === 'jewelry' || c === 'gem' || c === 'magic_gem' || item.grantsConditions?.length)
      return 'MAGIC GEAR';
    // Worn carry containers (packs, quivers, pouches, tool rolls) are type:tool but belong with gear,
    // not hand tools — split them out by their inventory bonus before the tool check.
    if (item.inventoryBonus) return 'PACKS';
    if (t === 'tool') return 'TOOLS';
    if (t === 'weapon') return 'WEAPONS';
    // Worn protection (helmets, shields, body/limb armour, cloaks) — its own group, not GOODS/LEATHER.
    if (t === 'armor') return 'ARMOR';
    // Cooking = everything else edible/drinkable, incl. preserved meat.
    if (t === 'food' || ['food', 'cooking', 'drink', 'meat'].includes(c)) return 'COOKING';
    return CAT_GROUP[c] ?? 'GOODS';
  }

  // A craftable card. Dynamic recipes (e.g. spit_meat over any meat) expand into one
  // entry per available ingredient so the player chooses by picking a card.
  type CraftEntry = {
    key: string;
    item: Item;
    name: string;
    description: string | null;
    category: string;
    selectedIngredients?: Record<string, string>;
    /** Extra inputs contributed by the chosen dynamic ingredient. */
    dynamicCost: Record<string, number>;
  };

  function entriesFor(item: Item, amounts: Record<string, number>): CraftEntry[] {
    const cat = craftCategory(item);
    const recipe = recipeOf(item.id);
    const plain = (): CraftEntry[] => [
      {
        key: item.id,
        item,
        name: item.name,
        description: item.description ?? null,
        category: cat,
        dynamicCost: {}
      }
    ];
    if ((item.isCarcass && item.yields) || !recipe?.dynamicRecipe) return plain();

    // Single-slot dynamic recipe (the only authored shape) → a card per in-stock ingredient.
    const [slotKey, slot] = Object.entries(recipe.dynamicRecipe)[0];
    const variantItems = (ITEMS_DATABASE as Item[]).filter(
      (i) => i.category === slot.acceptsCategory
    );
    const inStock = variantItems.filter((vi) => (amounts[vi.id] ?? 0) >= slot.quantity);
    if (inStock.length === 0) {
      // Empty larder: one discoverability card with the recipe's default identity (renders MISSING).
      return [
        {
          key: item.id,
          item,
          name: slot.default?.name ?? item.name,
          description: slot.default?.description ?? item.description ?? null,
          category: cat,
          dynamicCost: {}
        }
      ];
    }
    return inStock.map((vi) => {
      const v = slot.variants?.[vi.id];
      return {
        key: `${item.id}:${vi.id}`,
        item,
        name: v?.name ?? `${slot.default?.name ?? item.name} (${vi.name})`,
        description: v?.description ?? slot.default?.description ?? item.description ?? null,
        category: cat,
        selectedIngredients: { [slotKey]: vi.id },
        dynamicCost: { [vi.id]: slot.quantity }
      };
    });
  }

  $: craftEntries = allCraftableItems.flatMap((i) => entriesFor(i, itemMap));

  $: craftCategories = CRAFT_CAT_ORDER.map((cat) => ({
    id: cat,
    label: cat,
    entries: craftEntries.filter((e) => e.category === cat)
  })).filter((c) => c.entries.length > 0);

  // Restored across tab toggles (persist helper); the guard below falls back to the first category if
  // the remembered one no longer exists (e.g. research changed the available list).
  let selectedCat = persisted('crafting.cat', '');
  $: if (craftCategories.length && !craftCategories.some((c) => c.id === selectedCat)) {
    selectedCat = craftCategories[0].id;
  }
  $: persist('crafting.cat', selectedCat);
  $: activeCat = craftCategories.find((c) => c.id === selectedCat) ?? craftCategories[0];

  // Live search. When the query is non-empty it spans every category (tabs are bypassed);
  // otherwise the active category's entries are shown.
  let searchQuery = '';
  $: searchTerm = searchQuery.trim().toLowerCase();
  $: displayedEntries = searchTerm
    ? craftEntries.filter((e) => e.name.toLowerCase().includes(searchTerm))
    : (activeCat?.entries ?? []);

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
    currentPopulation = value?.population || 0;
  });

  const unsubscribeGame = gameState.subscribe((state) => {
    if (!state) return;
    craftingQueue = state.craftingQueue || [];
    completedResearch = state.completedResearch || [];
    currentToolLevel = state.currentToolLevel || 0;
  });

  onDestroy(() => {
    unsubscribeRace();
    unsubscribeGame();
  });

  function startCrafting(item: Item, selectedIngredients?: Record<string, string>, quantity = 1) {
    if (!$gameState) return;
    gameState.command({
      type: 'craftItem',
      payload: { itemId: item.id, quantity, selectedIngredients },
      save: true
    });
  }

  function cancelCrafting(queueIndex: number) {
    if (queueIndex < 0 || queueIndex >= craftingQueue.length) return;
    // ADR-016: nothing was consumed at queue time — releaseReservation frees the (reserved or
    // staged) inputs, then the order is dropped (by id). See commands.ts `cancelCrafting`.
    gameState.command({
      type: 'cancelCrafting',
      payload: { queueId: craftingQueue[queueIndex].id }
    });
  }
</script>

<div class="crafting-screen">
  <div class="screen-hdr">
    | CRAFTING
    <button class="hdr-btn" on:click={() => uiState.setScreen('main')}>BACK</button>
  </div>

  <!-- Category tabs: pick a category, see its recipes. Sticky so they stay reachable on scroll. -->
  {#if craftCategories.length > 0}
    <div class="filter-bar">
      <div class="filter-bar-tabs">
        <FilterTabs
          tabs={craftCategories.map((c) => ({ id: c.id, label: c.label }))}
          selected={selectedCat}
          onSelect={(id) => (selectedCat = id)}
        />
      </div>
      <SearchBar
        variant="inline"
        placeholder="search recipes…"
        bind:value={searchQuery}
        cacheKey="crafting"
      />
    </div>
    {#if displayedEntries.length > 0}
      <div class="card-grid">
        {#each displayedEntries as entry (entry.key)}
          {@const item = entry.item}
          {@const recipe = recipeOf(item.id)}
          {@const isCarcass = item.isCarcass && item.yields}
          {@const isPlaceholder = !!recipe?.dynamicRecipe && !entry.selectedIngredients}
          {@const baseCost = isCarcass ? {} : { ...costOf(item.id), ...entry.dynamicCost }}
          {@const stationReady =
            $gameState !== null &&
            itemService.hasRequiredBuilding(item.id, $gameState) &&
            itemService.hasRequiredTools(item.id, $gameState)}
          {@const affordable = isCarcass
            ? getItemAmount(item.id) > 0
            : !isPlaceholder &&
              Object.entries(baseCost).every(([id, n]) => getItemAmount(id) >= (n as number))}
          {@const craftable = isCarcass
            ? $gameState !== null && itemService.canCraftItem(item.id, $gameState)
            : stationReady && affordable}
          {@const intactness = $gameState?.carcassIntactness?.[item.id] ?? 100}
          {@const pct = Math.round(intactness)}
          {@const dynNeed =
            isPlaceholder && recipe?.dynamicRecipe
              ? Object.values(recipe.dynamicRecipe)[0].acceptsCategory
              : null}
          {@const canQueue = $gameState !== null && itemService.canQueueCraft(item.id, $gameState)}
          {@const useQty = !isCarcass && !isPlaceholder}
          <BuildCard
            name={entry.name.toUpperCase()}
            charSpans={item.charSpans}
            description={entry.description}
            statItem={item}
            statRecipe={recipe}
            statIngredients={entry.selectedIngredients ?? {}}
            tint={item.color ?? 'var(--accent)'}
            workAmount={recipe?.workAmount ?? null}
            station={stationNameOf(item.id)}
            toolTier={recipe?.toolTierRequired ?? null}
            toolMet={(recipe?.toolTierRequired ?? 0) <= currentToolLevel}
            badge={isCarcass ? `${pct}%` : null}
            actionLabel={useQty
              ? !canQueue
                ? 'BLOCKED'
                : affordable
                  ? 'CRAFT'
                  : 'QUEUE'
              : !affordable
                ? 'MISSING'
                : !craftable
                  ? 'BLOCKED'
                  : isCarcass
                    ? 'BUTCHER'
                    : 'CRAFT'}
            actionEnabled={useQty ? canQueue : craftable}
            variant={useQty
              ? !canQueue
                ? 'blocked'
                : affordable
                  ? 'ok'
                  : 'pending'
              : !affordable
                ? 'missing'
                : !craftable
                  ? 'blocked'
                  : 'ok'}
            quantities={useQty ? [3, 5, 10] : null}
            onQuantity={useQty ? (n) => startCrafting(item, entry.selectedIngredients, n) : null}
            onAction={() => startCrafting(item, entry.selectedIngredients)}
          >
            {#if isCarcass}
              {@const yieldPills = (item.yields ?? []).map((output) => ({
                itemId: output.item,
                qty: `×${Math.max(1, Math.round((output.min * intactness) / 100))}-${Math.max(
                  1,
                  Math.round((output.max * intactness) / 100)
                )}`
              })) satisfies ItemPillView[]}
              <ItemPills pills={yieldPills} />
            {:else}
              {@const costPills = Object.entries(baseCost).map(([id, n]) => {
                const have = getItemAmount(id);
                return { itemId: id, qty: `×${n}`, sub: `(${have})`, dim: have < (n as number) };
              }) satisfies ItemPillView[]}
              {#if costPills.length > 0}<ItemPills pills={costPills} />{/if}
              {#if dynNeed}
                <span class="cost-item neg-text"
                  >any {dynNeed} <span class="cost-qty">×1</span></span
                >
              {:else if costPills.length === 0}
                <span class="muted-text">free</span>
              {/if}
              {#if primaryQtyOf(item.id) > 1 || byproductsOf(item.id).length > 0}
                {@const outPills = [
                  { itemId: item.id, qty: `×${primaryQtyOf(item.id)}` },
                  ...byproductsOf(item.id).map(([bid, bq]) => ({ itemId: bid, qty: `×${bq}` }))
                ] satisfies ItemPillView[]}
                <div class="cost-out"><span class="cost-arrow">→</span><ItemPills pills={outPills} /></div>
              {/if}
            {/if}
          </BuildCard>
        {/each}
      </div>
    {:else if searchTerm}
      <div class="muted-row">no recipes match "{searchQuery}"</div>
    {/if}
  {/if}

  {#if allCraftableItems.length === 0}
    <div class="muted-row">no recipes available</div>
  {/if}

  <!-- Active crafting queue — compact chips, kept below the recipe tabs (mirrors CONSTRUCTION) -->
  {#if craftingQueue.length > 0}
    <div class="build-jobs">
      <div class="jobs-hdr">| CRAFTING QUEUE ({craftingQueue.length})</div>
      <div class="jobs-grid">
        {#each craftingQueue as qi, idx (qi.id)}
          {@const wReq = qi.workRequired ?? (recipeOf(qi.item.id)?.workAmount ?? 1) * 5}
          {@const prog = Math.round(Math.min(100, ((qi.workDone ?? 0) / wReq) * 100))}
          {@const qty = qi.quantity ?? 1}
          <div
            class="job-chip"
            class:pending={qi.pending}
            title={qi.pending
              ? `${qi.item.name} ×${qty} — waiting for materials`
              : `${qi.item.name} ×${qty} — ${prog}%`}
          >
            {#if !qi.pending}<span class="job-fill" style="width:{prog}%"></span>{/if}
            <span class="job-name"
              >{qi.item.name.toUpperCase()}{#if qty > 1}
                ×{qty}{/if}</span
            >
            <span class="job-pct">{qi.pending ? 'WAIT' : `${prog}%`}</span>
            <button class="job-x" title="Cancel" on:click={() => cancelCrafting(idx)}>✕</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 5px;
    padding: 5px 8px;
  }

  /* Sticky filter + search bar — stays pinned while the card grid scrolls under it. */
  .filter-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: stretch;
    background: var(--bg);
    border-bottom: 2px solid var(--border-hi);
  }
  .filter-bar-tabs {
    flex: 1 1 auto;
    min-width: 0;
  }
  /* FilterTabs renders its own bottom border; the wrapper owns it here. */
  .filter-bar-tabs :global(.filter-tabs) {
    border-bottom: none;
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

  .cost-item {
    display: inline-flex;
    gap: 2px;
    align-items: baseline;
    white-space: nowrap;
  }

  .cost-qty {
    color: var(--accent);
  }

  /* Recipe outputs row (→ pills) sits below the ingredient pills. */
  .cost-out {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-top: 2px;
  }
  .cost-arrow {
    color: var(--text-dim);
    opacity: 0.6;
  }

  .muted-text {
    color: var(--text-dim);
  }

  .neg-text {
    color: var(--neg);
  }

  .muted-row {
    padding: 4px 10px;
    font-size: 10px;
    color: var(--text-dim);
  }

  /* ── Active crafting queue (compact chips, below the tabs — mirrors CONSTRUCTION) ── */
  .build-jobs {
    padding: 4px 8px 8px;
    border-top: 1px solid var(--border);
    margin-top: 4px;
  }
  .jobs-hdr {
    color: var(--accent);
    font-size: 10px;
    letter-spacing: 0.08em;
    padding: 2px 0 5px;
  }
  .jobs-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .job-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 170px;
    padding: 2px 5px;
    border: 1px solid var(--border);
    background: var(--bg-panel);
    overflow: hidden;
    font-size: 10px;
  }
  .job-chip.pending {
    border-style: dashed;
    opacity: 0.7;
  }
  .job-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    pointer-events: none;
    z-index: 0;
  }
  .job-name {
    position: relative;
    z-index: 1;
    max-width: 100px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .job-pct {
    position: relative;
    z-index: 1;
    color: var(--accent);
    font-size: 9px;
  }
  .job-x {
    position: relative;
    z-index: 1;
    background: none;
    border: none;
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1;
    padding: 0 1px;
    cursor: pointer;
  }
  .job-x:hover {
    color: var(--neg);
  }
</style>
