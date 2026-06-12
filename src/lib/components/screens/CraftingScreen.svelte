<script lang="ts">
  import { gameState, currentRace } from '$lib/stores/gameState';
  import BuildCard from '$lib/components/UI/BuildCard.svelte';
  import FilterTabs from '$lib/components/UI/FilterTabs.svelte';
  import { uiState } from '$lib/stores/uiState';
  import ITEMS_DATABASE from '$lib/game/database/items.jsonc';
  import { gameEngine } from '$lib/game/systems/GameEngineImpl';
  import { itemService } from '$lib/game/services/ItemService';
  import { recipeService } from '$lib/game/services/RecipeService';
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
        if (recipe.researchRequired && !completedResearch.includes(recipe.researchRequired))
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
    'WEAPONS',
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
    if (t === 'tool') return 'TOOLS';
    if (t === 'weapon') return 'WEAPONS';
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

  let selectedCat = '';
  $: if (craftCategories.length && !craftCategories.some((c) => c.id === selectedCat)) {
    selectedCat = craftCategories[0].id;
  }
  $: activeCat = craftCategories.find((c) => c.id === selectedCat) ?? craftCategories[0];

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

  function startCrafting(item: Item, selectedIngredients?: Record<string, string>) {
    if (!$gameState) return;
    gameEngine.craftItem(item.id, 1, selectedIngredients);
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

</script>

<div class="crafting-screen">
  <div class="screen-hdr">
    | CRAFTING
    <button class="hdr-btn" on:click={() => uiState.setScreen('main')}>BACK</button>
  </div>

  <!-- Crafting queue — only shown while something is crafting -->
  {#if craftingQueue.length > 0}
    <div class="section-hdr sub">| CRAFTING QUEUE ({craftingQueue.length})</div>
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
  {/if}

  <!-- Category tabs: pick a category, see its recipes -->
  {#if craftCategories.length > 0}
    <FilterTabs
      tabs={craftCategories.map((c) => ({ id: c.id, label: c.label }))}
      selected={selectedCat}
      onSelect={(id) => (selectedCat = id)}
    />
    {#if activeCat}
      <div class="card-grid">
        {#each activeCat.entries as entry (entry.key)}
            {@const item = entry.item}
            {@const recipe = recipeOf(item.id)}
            {@const isCarcass = item.isCarcass && item.yields}
            {@const isPlaceholder = !!recipe?.dynamicRecipe && !entry.selectedIngredients}
            {@const baseCost = isCarcass ? {} : { ...costOf(item.id), ...entry.dynamicCost }}
            {@const stationReady = $gameState !== null &&
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
            <BuildCard
              name={entry.name.toUpperCase()}
              charSpans={item.charSpans}
              description={entry.description}
              tint={item.color ?? 'var(--accent)'}
              workAmount={recipe?.workAmount ?? null}
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
              onAction={() => startCrafting(item, entry.selectedIngredients)}
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
                {#each Object.entries(baseCost) as [id, n], ci}
                  {@const have = getItemAmount(id)}
                  {#if ci > 0}<span class="cost-sep">·</span>{/if}
                  <span class="cost-item" class:neg-text={have < (n as number)}>
                    {id.replace(/_/g, ' ')} <span class="cost-qty">×{n}</span>
                    <span class="cost-have" class:neg-text={have < (n as number)}>({have})</span>
                  </span>
                {/each}
                {#if dynNeed}
                  {#if Object.keys(baseCost).length > 0}<span class="cost-sep">·</span>{/if}
                  <span class="cost-item neg-text">any {dynNeed} <span class="cost-qty">×1</span></span>
                {:else if Object.keys(baseCost).length === 0}
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
    {/if}
  {/if}

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
