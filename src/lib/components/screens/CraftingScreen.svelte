<script lang="ts">
  import { gameState, currentCulture } from '$lib/stores/gameState';
  import BuildCard from '$lib/components/UI/hud/BuildCard.svelte';
  import ItemPills, { type ItemPillView } from '$lib/components/UI/widget/ItemPills.svelte';
  import FilterTabs from '$lib/components/UI/widget/FilterTabs.svelte';
  import SearchBar from '$lib/components/UI/widget/SearchBar.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';
  import BackButton from '$lib/components/UI/widget/BackButton.svelte';
  import ITEMS_DATABASE from '$lib/game/database/items/items.jsonc';
  import { itemService } from '$lib/game/services/ItemService';
  import { recipeService } from '$lib/game/services/RecipeService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { jobService } from '$lib/game/services/JobService';
  import { getMaterialProperty } from '$lib/game/core/defs/materials';
  import { WORK_CATEGORIES } from '$lib/game/core/defs/work';
  import { releaseReservation } from '$lib/game/core/state/stockpile';
  import { categoryPath, labelFor } from '$lib/components/util/itemCategoryTree';
  import { onDestroy } from 'svelte';
  import type { Item } from '$lib/game/core/types';

  const recipeOf = (itemId: string) => recipeService.getRecipeForItem(itemId);
  const costOf = (itemId: string): Record<string, number> =>
    itemService.calculateCraftingCost(itemId);
  const byproductsOf = (itemId: string): [string, number][] => {
    const r = recipeOf(itemId);
    if (!r) return [];
    return Object.entries(r.outputs).filter(([id]) => id !== itemId);
  };
  const primaryQtyOf = (itemId: string): number => recipeOf(itemId)?.outputs[itemId] ?? 1;
  const stationNameOf = (itemId: string): string | null => {
    const stationId = recipeOf(itemId)?.station;
    if (!stationId) return null;
    return buildingService.getBuildingById(stationId)?.name ?? stationId.replace(/_/g, ' ');
  };
  const requiredToolOf = (itemId: string): { name: string; met: boolean } | null => {
    const req = recipeService.toolRequirementForRecipe(recipeOf(itemId));
    if (!req) return null;
    const toolIds = WORK_CATEGORIES.find((c) => c.id === req.workType)?.toolsRequired ?? [];
    if (toolIds.length === 0) return null;
    const minTier = req.minTier ?? 1;
    const pick =
      toolIds.find(
        (id) => ((itemService.getItemById(id) as { tier?: number })?.tier ?? 1) >= minTier
      ) ?? toolIds[0];
    const name = itemService.getItemById(pick)?.name ?? pick;
    const gs = $gameState;
    const met =
      !!gs &&
      (jobService.colonyHasToolFor(gs, req.workType, minTier) ||
        (gs.pawns ?? []).some((p) => jobService.pawnHasToolFor(p, req.workType, minTier)));
    return { name, met };
  };
  const workName = (id: string): string =>
    WORK_CATEGORIES.find((c) => c.id === id)?.name ?? id.replace(/_/g, ' ');
  function jobLabelOf(item: Item): string {
    if (item.category === 'carcass') return 'Butchery';
    const req = recipeService.toolRequirementForRecipe(recipeOf(item.id));
    if (req?.workType) return workName(req.workType);
    const t = String(item.type ?? '');
    const c = item.category ?? '';
    if (t === 'food' || ['food', 'cooking', 'drink', 'meat'].includes(c)) return 'Cooking';
    return 'General Crafting';
  }

  function dishSlotNote(itemId: string, slotKey: string, ingredientId: string): string | null {
    const parts: string[] = [];
    const variant = recipeOf(itemId)?.dynamicRecipe?.[slotKey]?.variants?.[ingredientId];
    const nb = variant?.nutritionBonus;
    if (nb) parts.push(`${nb > 0 ? '+' : ''}${nb} nutrition`);
    const mp = getMaterialProperty(ingredientId);
    if (mp) parts.push(`${mp.label}: ${mp.desc}`);
    return parts.length ? parts.join(' · ') : null;
  }

  let culture: any = null;
  let craftingQueue: any[] = [];
  let completedResearch: string[] = [];
  let currentPopulation = 0;

  $: itemMap = $gameState?.stockpile ?? {};

  $: carcassConditions = $gameState?._carcassCondition ?? {};

  $: getItemAmount = (itemId: string): number => itemMap[itemId] || 0;

  $: allCraftableItems = $gameState
    ? (ITEMS_DATABASE as Item[]).filter((item) => {
        if (item.category === 'carcass') return true;
        const recipe = recipeOf(item.id);
        if (!recipe) return false;
        if (
          Object.keys(recipe.inputs ?? {}).some(
            (i) => itemService.getItemById(i)?.category === 'carcass'
          )
        )
          return false;
        if (Object.keys(recipe.outputs ?? {})[0] !== item.id) return false;
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

  const CRAFT_TAB_ORDER: string[] = [
    labelFor('tools'),
    labelFor('melee'),
    labelFor('ranged'),
    labelFor('ammunition'),
    'Armor',
    labelFor('jewelry'),
    labelFor('meat'),
    labelFor('meals'),
    labelFor('drinks'),
    labelFor('medicine'),
    labelFor('wood'),
    labelFor('stone'),
    labelFor('metals'),
    labelFor('gems'),
    labelFor('textiles'),
    labelFor('organic'),
    labelFor('soil'),
    labelFor('fuel'),
    labelFor('primitive'),
    labelFor('storage'),
    labelFor('light')
  ];
  function craftCategory(item: Item): string {
    if (item.category === 'jewelry') return 'Jewelry';
    if (String(item.type) === 'armor') return 'Armor';
    const path = categoryPath(item);
    if (path[0] === 'weapons') {
      if (path[1] === 'shields') return 'Armor';
      if (path[1] === 'melee') return labelFor('melee');
      if (path[1] === 'ranged') return labelFor('ranged');
      if (path[1] === 'ammunition') return labelFor('ammunition');
      return labelFor('weapons');
    }
    if (path[0] === 'tools') return labelFor('tools');
    return labelFor(path[path.length - 1]);
  }

  type DishSlot = { key: string; label: string; quantity: number; options: Item[] };
  type CraftEntry = {
    key: string;
    item: Item;
    name: string;
    description: string | null;
    category: string;
    selectedIngredients?: Record<string, string>;
    dynamicCost: Record<string, number>;
    slots?: DishSlot[];
  };

  let dishSel: Record<string, Record<string, string>> = {};
  function setDishSlot(itemId: string, slotKey: string, ingredientId: string) {
    const cur = { ...(dishSel[itemId] ?? {}) };
    if (ingredientId) cur[slotKey] = ingredientId;
    else delete cur[slotKey];
    dishSel = { ...dishSel, [itemId]: cur };
  }

  function entriesFor(
    item: Item,
    amounts: Record<string, number>,
    sel: Record<string, Record<string, string>>
  ): CraftEntry[] {
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
    if (item.category === 'carcass' || !recipe?.dynamicRecipe) return plain();

    const slotEntries = Object.entries(recipe.dynamicRecipe);

    if (slotEntries.length > 1) {
      const slots: DishSlot[] = slotEntries.map(([key, slot]) => {
        const cats = recipeService.slotCategories(slot);
        const seen = new Set<string>();
        const options = cats
          .flatMap((c) => itemService.getItemsByCategory(c))
          .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
          .sort((a, b) => ((amounts[b.id] ?? 0) > 0 ? 1 : 0) - ((amounts[a.id] ?? 0) > 0 ? 1 : 0));
        return { key, label: cats.join('/'), quantity: slot.quantity, options };
      });
      const chosen = sel[item.id] ?? {};
      const allPicked = slotEntries.every(([key]) => chosen[key]);
      const dynamicCost: Record<string, number> = {};
      if (allPicked) {
        for (const [key, slot] of slotEntries) {
          const id = chosen[key];
          dynamicCost[id] = (dynamicCost[id] ?? 0) + slot.quantity;
        }
      }
      const composed = allPicked ? itemService.composeDynamicDishName(item.id, chosen) : undefined;
      return [
        {
          key: item.id,
          item,
          name: composed ?? item.name,
          description: item.description ?? null,
          category: cat,
          selectedIngredients: allPicked ? { ...chosen } : undefined,
          dynamicCost,
          slots
        }
      ];
    }

    const [slotKey, slot] = slotEntries[0];
    const cats = recipeService.slotCategories(slot);
    const variantItems = [
      ...new Map(
        cats.flatMap((c) => itemService.getItemsByCategory(c)).map((i) => [i.id, i])
      ).values()
    ];
    const inStock = variantItems.filter((vi) => (amounts[vi.id] ?? 0) >= slot.quantity);
    if (inStock.length === 0) {
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

  $: craftEntries = allCraftableItems.flatMap((i) => entriesFor(i, itemMap, dishSel));

  $: presentCats = new Set(craftEntries.map((e) => e.category));
  $: orderedCats = [
    ...CRAFT_TAB_ORDER.filter((c) => presentCats.has(c)),
    ...[...presentCats].filter((c) => !CRAFT_TAB_ORDER.includes(c)).sort()
  ];
  $: craftCategories = orderedCats.map((cat) => ({
    id: cat,
    label: cat,
    entries: craftEntries.filter((e) => e.category === cat)
  }));

  let selectedCat = persisted('crafting.cat', '');
  $: if (craftCategories.length && !craftCategories.some((c) => c.id === selectedCat)) {
    selectedCat = craftCategories[0].id;
  }
  $: persist('crafting.cat', selectedCat);
  $: activeCat = craftCategories.find((c) => c.id === selectedCat) ?? craftCategories[0];

  let searchQuery = '';
  $: searchTerm = searchQuery.trim().toLowerCase();
  $: displayedEntries = searchTerm
    ? craftEntries.filter((e) => e.name.toLowerCase().includes(searchTerm))
    : (activeCat?.entries ?? []);

  const unsubscribeCulture = currentCulture.subscribe((value) => {
    culture = value;
    currentPopulation = value?.population || 0;
  });

  const unsubscribeGame = gameState.subscribe((state) => {
    if (!state) return;
    craftingQueue = state.craftingQueue || [];
    completedResearch = state.completedResearch || [];
  });

  onDestroy(() => {
    unsubscribeCulture();
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

  function cancelCrafting(queueId: string) {
    gameState.command({ type: 'cancelCrafting', payload: { queueId } });
  }

  $: buildingsList = $gameState?.buildings ?? [];
  const stationTypeOf = (qi: any): string | null => {
    const b = buildingsList.find(
      (b: any) => b.id === qi.stationBuildingId && b.status === 'complete'
    );
    return b ? b.type : null;
  };
  $: craftLanes = (() => {
    const hostIds = new Set<string>();
    let hasHand = false;
    for (const qi of craftingQueue) {
      const need = qi.stationType;
      if (!need) {
        hasHand = true;
        continue;
      }
      const hosts = buildingsList.filter(
        (b: any) => b.status === 'complete' && buildingService.stationFulfills(b.type, need)
      );
      if (hosts.length === 0) hasHand = true;
      else for (const b of hosts) hostIds.add(b.id);
    }
    const lanes: { id: string | null; label: string; items: any[] }[] = [];
    const typesShown = new Set<string>();
    for (const host of buildingsList.filter((b: any) => hostIds.has(b.id))) {
      if (typesShown.has(host.type)) continue;
      typesShown.add(host.type);
      const name = buildingService.getBuildingById(host.type)?.name ?? host.type.replace(/_/g, ' ');
      const stations = buildingsList.filter(
        (b: any) => b.type === host.type && b.status === 'complete'
      );
      stations.forEach((b: any, i: number) => {
        lanes.push({
          id: b.id,
          label: stations.length > 1 ? `${name} ${i + 1}` : name,
          items: craftingQueue.filter((q) => q.stationBuildingId === b.id)
        });
      });
    }
    if (hasHand)
      lanes.push({
        id: null,
        label: 'Hand Crafting',
        items: craftingQueue.filter((q) => stationTypeOf(q) === null)
      });
    return lanes;
  })();

  let dragId: string | null = null;
  function moveOnChip(targetId: string, stationId: string | null) {
    const id = dragId;
    dragId = null;
    if (!id || id === targetId) return;
    gameState.command({
      type: 'moveCraftOrder',
      payload: { queueId: id, stationBuildingId: stationId ?? undefined, beforeId: targetId },
      save: true
    });
  }
  function moveOnLane(stationId: string | null) {
    const id = dragId;
    dragId = null;
    if (!id || stationId === null) return;
    gameState.command({
      type: 'moveCraftOrder',
      payload: { queueId: id, stationBuildingId: stationId },
      save: true
    });
  }
  function pauseCrafting(queueId: string) {
    gameState.command({ type: 'toggleCraftPaused', payload: { queueId }, save: true });
  }
</script>

<div class="crafting-screen">
  <div class="screen-hdr">
    | CRAFTING
    <BackButton />
  </div>

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

    {#if craftingQueue.length > 0}
      <div class="build-jobs">
        <div class="jobs-hdr">| CRAFTING QUEUE ({craftingQueue.length})</div>
        {#each craftLanes as lane (lane.id ?? 'hand')}
          <div
            class="craft-lane"
            class:lane-active={dragId !== null && lane.id !== null}
            role="list"
            on:dragover|preventDefault
            on:drop|preventDefault={() => moveOnLane(lane.id)}
          >
            <div class="jobs-station">
              {lane.label}{#if lane.items.length === 0}<span class="lane-empty"> · empty</span>{/if}
            </div>
            <div class="jobs-grid">
              {#each lane.items as qi (qi.id)}
                {@const wReq = qi.workRequired ?? (recipeOf(qi.item.id)?.workAmount ?? 1) * 5}
                {@const prog = Math.round(Math.min(100, ((qi.workDone ?? 0) / wReq) * 100))}
                {@const qty = qi.quantity ?? 1}
                <div
                  class="job-chip"
                  class:pending={qi.pending}
                  class:paused={qi.paused}
                  class:drag-over={dragId !== null && dragId !== qi.id}
                  draggable="true"
                  role="listitem"
                  on:dragstart={() => (dragId = qi.id)}
                  on:dragend={() => (dragId = null)}
                  on:dragover|preventDefault
                  on:drop|preventDefault|stopPropagation={() => moveOnChip(qi.id, lane.id)}
                  title={qi.paused
                    ? `${qi.item.name} ×${qty} — paused (${prog}%)`
                    : qi.pending
                      ? `${qi.item.name} ×${qty} — waiting for materials`
                      : `${qi.item.name} ×${qty} — ${prog}%`}
                >
                  {#if !qi.pending}<span class="job-fill" style="width:{prog}%"></span>{/if}
                  <span class="job-grip">⠿</span>
                  <span class="job-name"
                    >{qi.item.name.toUpperCase()}{#if qty > 1}
                      ×{qty}{/if}</span
                  >
                  <span class="job-pct"
                    >{qi.paused ? 'PAUSE' : qi.pending ? 'WAIT' : `${prog}%`}</span
                  >
                  <button
                    class="job-pause"
                    title={qi.paused ? 'Resume' : 'Pause'}
                    on:click|stopPropagation={() => pauseCrafting(qi.id)}
                    >{qi.paused ? '▶' : '⏸'}</button
                  >
                  <button class="job-x" title="Cancel" on:click={() => cancelCrafting(qi.id)}
                    >✕</button
                  >
                </div>
              {/each}
              {#if lane.items.length === 0}
                <span class="lane-drop-hint">drop a task here</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if displayedEntries.length > 0}
      <div class="card-grid">
        {#each displayedEntries as entry (entry.key)}
          {@const item = entry.item}
          {@const recipe = recipeOf(item.id)}
          {@const toolReq = requiredToolOf(item.id)}
          {@const toolReqMet = toolReq?.met ?? true}
          {@const isCarcass = item.category === 'carcass'}
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
          {@const craftable =
            toolReqMet &&
            (isCarcass
              ? $gameState !== null && itemService.canCraftItem(item.id, $gameState)
              : stationReady && affordable)}
          {@const intactness = carcassConditions[item.id] ?? 100}
          {@const pct = Math.round(intactness)}
          {@const dynNeed =
            !entry.slots && isPlaceholder && recipe?.dynamicRecipe
              ? recipeService.slotCategories(Object.values(recipe.dynamicRecipe)[0]).join('/')
              : null}
          {@const canQueue =
            $gameState !== null && itemService.canQueueCraft(item.id, $gameState) && toolReqMet}
          {@const useQty = !isCarcass && !isPlaceholder}
          <BuildCard
            name={entry.name.toUpperCase()}
            charSpans={item.charSpans}
            description={entry.description}
            statItem={item}
            statRecipe={recipe}
            statIngredients={entry.slots
              ? (dishSel[item.id] ?? {})
              : (entry.selectedIngredients ?? {})}
            jobLabel={jobLabelOf(item)}
            tint={item.color ?? 'var(--accent)'}
            workAmount={recipe?.workAmount ?? null}
            station={stationNameOf(item.id)}
            toolTier={recipe?.toolTierRequired ?? null}
            toolMet={$gameState !== null && itemService.hasRequiredTools(item.id, $gameState)}
            requiredTool={toolReq?.name ?? null}
            requiredToolMet={toolReqMet}
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
              {@const carcassRecipe = $gameState
                ? itemService.resolveCarcassRecipe(item.id, $gameState)
                : undefined}
              {@const yieldPills = Object.entries(carcassRecipe?.outputs ?? {}).map(
                ([itemId, qty]) => ({
                  itemId,
                  qty: `×${Math.max(1, Math.round(((qty as number) * intactness) / 100))}`
                })
              ) satisfies ItemPillView[]}
              <ItemPills pills={yieldPills} />
            {:else}
              {#if entry.slots}
                <div class="dish-pickers">
                  {#each entry.slots as s (s.key)}
                    {@const sel = dishSel[item.id]?.[s.key] ?? ''}
                    {@const have = sel ? getItemAmount(sel) : 0}
                    {@const short = !!sel && have < s.quantity}
                    <!-- svelte-ignore a11y_no_onchange -->
                    <span class="cost-item cost-cat" class:neg-text={!sel || short}>
                      <select
                        class="mat-select"
                        class:unset={!sel}
                        value={sel}
                        on:change={(e) => setDishSlot(item.id, s.key, e.currentTarget.value)}
                        title="choose {s.label} to use"
                      >
                        <option value="">any {s.label}</option>
                        {#each s.options as opt (opt.id)}
                          <option value={opt.id}>{opt.name} ({getItemAmount(opt.id)})</option>
                        {/each}
                      </select>
                      <span class="cost-qty">×{s.quantity}</span>
                      {#if sel}<span class="cost-have" class:neg-text={short}>({have})</span>{/if}
                    </span>
                    {#if sel}
                      {@const note = dishSlotNote(item.id, s.key, sel)}
                      {#if note}<span class="mat-effect">▸ {note}</span>{/if}
                    {/if}
                  {/each}
                </div>
              {/if}
              {@const costPills = Object.entries(baseCost).map(([id, n]) => {
                const have = getItemAmount(id);
                return { itemId: id, qty: `×${n}`, sub: `(${have})`, dim: have < (n as number) };
              }) satisfies ItemPillView[]}
              {#if costPills.length > 0}<ItemPills pills={costPills} />{/if}
              {#if dynNeed}
                <span class="cost-item neg-text"
                  >any {dynNeed} <span class="cost-qty">×1</span></span
                >
              {:else if costPills.length === 0 && !entry.slots}
                <span class="muted-text">free</span>
              {/if}
              {#if primaryQtyOf(item.id) > 1 || byproductsOf(item.id).length > 0}
                {@const outPills = [
                  { itemId: item.id, qty: `×${primaryQtyOf(item.id)}` },
                  ...byproductsOf(item.id).map(([bid, bq]) => ({ itemId: bid, qty: `×${bq}` }))
                ] satisfies ItemPillView[]}
                <div class="cost-out">
                  <span class="cost-arrow">→</span><ItemPills pills={outPills} />
                </div>
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
</div>

<style>
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 5px;
    padding: 5px 8px;
  }

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
  .filter-bar-tabs :global(.filter-tabs) {
    border-bottom: none;
  }
  .crafting-screen {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    display: flex;
    flex-direction: column;
  }

  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 12px;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
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

  .dish-pickers {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-bottom: 3px;
  }
  .cost-cat {
    margin-top: 2px;
  }
  .mat-select {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--accent-hi);
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 0 2px;
    max-width: 120px;
    cursor: pointer;
    outline: none;
  }
  .mat-select:hover {
    border-color: var(--border-hi);
  }
  .mat-select:focus {
    border-color: var(--accent-hi);
  }
  .mat-select.unset {
    border-style: dashed;
    color: var(--text-dim);
  }
  .cost-have {
    opacity: 0.6;
  }
  .mat-effect {
    display: block;
    color: #7e9fbf;
    font-size: 10px;
    margin: 0 0 2px 4px;
  }

  .muted-text {
    color: var(--text-dim);
  }

  .neg-text {
    color: var(--neg);
  }

  .muted-row {
    padding: 4px 10px;
    font-size: 11px;
    color: var(--text-dim);
  }

  .build-jobs {
    padding: 5px 8px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }
  .jobs-hdr {
    color: var(--accent);
    font-size: 11px;
    letter-spacing: 0.08em;
    padding: 0 0 4px;
  }
  .craft-lane {
    border: 1px solid transparent;
    border-radius: 2px;
    padding: 3px 6px 6px;
    margin-bottom: 3px;
  }
  .craft-lane.lane-active {
    border-color: var(--border-hi);
    border-style: dashed;
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .jobs-station {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 3px 0 2px;
  }
  .lane-empty {
    opacity: 0.6;
    font-style: italic;
  }
  .lane-drop-hint {
    color: var(--text-dim);
    font-size: 10px;
    font-style: italic;
    opacity: 0.5;
    padding: 2px 0;
  }
  .jobs-grid {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 4px;
    min-height: 26px;
  }
  .job-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 170px;
    padding: 2px 5px;
    border: 1px solid var(--border);
    background: var(--bg-panel);
    overflow: hidden;
    font-size: 11px;
    cursor: grab;
  }
  .job-chip:active {
    cursor: grabbing;
  }
  .job-chip.pending {
    border-style: dashed;
    opacity: 0.7;
  }
  .job-chip.paused {
    border-style: dotted;
    opacity: 0.6;
  }
  .job-chip.drag-over:hover {
    border-color: var(--accent-hi);
  }
  .job-grip {
    position: relative;
    z-index: 1;
    color: var(--text-dim);
    font-size: 10px;
    cursor: grab;
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
    font-size: 10px;
  }
  .job-x {
    position: relative;
    z-index: 1;
    background: none;
    border: none;
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1;
    padding: 0 1px;
    cursor: pointer;
  }
  .job-x:hover {
    color: var(--neg);
  }
  .job-pause {
    position: relative;
    z-index: 1;
    background: none;
    border: none;
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1;
    padding: 0 1px;
    cursor: pointer;
  }
  .job-pause:hover {
    color: var(--accent-hi);
  }
</style>
