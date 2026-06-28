<script lang="ts">
  import { gameState, currentRace } from '$lib/stores/gameState';
  import BuildCard from '$lib/components/UI/BuildCard.svelte';
  import ItemPills, { type ItemPillView } from '$lib/components/UI/ItemPills.svelte';
  import FilterTabs from '$lib/components/UI/FilterTabs.svelte';
  import SearchBar from '$lib/components/UI/SearchBar.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';
  import BackButton from '$lib/components/UI/BackButton.svelte';
  import ITEMS_DATABASE from '$lib/game/database/items.jsonc';
  import { itemService } from '$lib/game/services/ItemService';
  import { recipeService } from '$lib/game/services/RecipeService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { jobService } from '$lib/game/services/JobService';
  import { getMaterialProperty } from '$lib/game/core/materialProperties';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
  import { releaseReservation } from '$lib/game/core/GameState';
  import { onDestroy } from 'svelte';
  import type { Item } from '$lib/game/core/types';

  // Recipe registry: per-item recipe lookups (static DBs — plain functions, not reactive).
  const recipeOf = (itemId: string) => recipeService.getRecipeForItem(itemId);
  // `category:plank`-style slots are expanded to a representative concrete item for display so the
  // cost row shows a real material name, never a raw `category:` key.
  const costOf = (itemId: string): Record<string, number> => itemService.calculateCraftingCost(itemId);
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
  /** Named implement a recipe REQUIRES to be worked (recipe/station `toolRequirement` → the work
   *  category's gating tool, e.g. a Clay Cooking Pot for stews). Surfaced on the card so the player
   *  knows why a stew won't cook without a pot — the requirement is otherwise invisible (toolTier is 0)
   *  and doesn't block queuing. `met` = the colony holds one (in stock or carried by a pawn). */
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
  /** Human label for the WORK CATEGORY (labor) a craft belongs to — the recipe/station tool-requirement
   *  workType (Butchery / Leatherworking / Metalworking / …), with Cooking for food and General Crafting
   *  as the catch-all. Surfaced in the recipe's hover panel so the player knows which labor performs it. */
  const workName = (id: string): string =>
    WORK_CATEGORIES.find((c) => c.id === id)?.name ?? id.replace(/_/g, ' ');
  function jobLabelOf(item: Item): string {
    if (item.isCarcass) return 'Butchery';
    const req = recipeService.toolRequirementForRecipe(recipeOf(item.id));
    if (req?.workType) return workName(req.workType);
    // Mirror JobService._jobTypeToWorkKey: a food/edible craft is Cooking, everything else General Crafting.
    const t = String(item.type ?? '');
    const c = item.category ?? '';
    if (t === 'food' || ['food', 'cooking', 'drink', 'meat'].includes(c)) return 'Cooking';
    return 'General Crafting';
  }

  // §M One-line "what this ingredient brings" note under a chosen dish slot: the dynamic-recipe
  // variant's nutrition tweak (food) and/or the material's stat property (crafted-gear materials).
  function dishSlotNote(itemId: string, slotKey: string, ingredientId: string): string | null {
    const parts: string[] = [];
    const variant = recipeOf(itemId)?.dynamicRecipe?.[slotKey]?.variants?.[ingredientId];
    const nb = variant?.nutritionBonus;
    if (nb) parts.push(`${nb > 0 ? '+' : ''}${nb} nutrition`);
    const mp = getMaterialProperty(ingredientId);
    if (mp) parts.push(`${mp.label}: ${mp.desc}`);
    return parts.length ? parts.join(' · ') : null;
  }

  let race: any = null;
  let craftingQueue: any[] = [];
  let completedResearch: string[] = [];
  let currentPopulation = 0;

  // Read item amounts directly from the stockpile aggregate — the single source of truth.
  // gameState.item is a legacy no-op array (addToItemArray is a stub) and must not be used.
  $: itemMap = $gameState?.stockpile ?? {};

  // Per-carcass-type average condition (0–100) — drives the badge + yield-pill scaling below. Computed
  // worker-side and shipped on the snapshot (`_carcassCondition`); no per-unit arrays cross the boundary.
  $: carcassConditions = $gameState?._carcassCondition ?? {};

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

  // A craftable card. A SINGLE-slot dynamic recipe (e.g. spit_meat over any meat) expands into one
  // entry per available ingredient (pick by picking a card). A MULTI-slot dish (stew/pie) renders ONE
  // card with a per-slot ingredient picker (see `slots`); the chosen ids drive the cost + composed name.
  type DishSlot = { key: string; label: string; quantity: number; options: Item[] };
  type CraftEntry = {
    key: string;
    item: Item;
    name: string;
    description: string | null;
    category: string;
    selectedIngredients?: Record<string, string>;
    /** Extra inputs contributed by the chosen dynamic ingredient(s). */
    dynamicCost: Record<string, number>;
    /** Multi-slot dish: the per-slot pickers to render in the card body. */
    slots?: DishSlot[];
  };

  // Per-dish manual ingredient selection: dish itemId → slotKey → chosen ingredient itemId.
  // The player picks each slot; an empty/partial selection leaves the card a non-craftable placeholder.
  let dishSel: Record<string, Record<string, string>> = {};
  function setDishSlot(itemId: string, slotKey: string, ingredientId: string) {
    const cur = { ...(dishSel[itemId] ?? {}) };
    if (ingredientId) cur[slotKey] = ingredientId;
    else delete cur[slotKey];
    dishSel = { ...dishSel, [itemId]: cur }; // reassign → craftEntries recompute
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
    if ((item.isCarcass && item.yields) || !recipe?.dynamicRecipe) return plain();

    const slotEntries = Object.entries(recipe.dynamicRecipe);

    // MULTI-slot dish → one card with a picker per slot. The composed name/cost come from the live
    // selection; all slots must be chosen before it's craftable (a partial pick stays a placeholder).
    if (slotEntries.length > 1) {
      const slots: DishSlot[] = slotEntries.map(([key, slot]) => {
        const cats = recipeService.slotCategories(slot);
        // EVERY individual ingredient of the slot's categories (venison, rabbit, trout, …), not just
        // what's in stock — full ingredient control, in-stock sorted first, exactly like the building
        // material picker. Out-of-stock picks just render the slot short (MISSING/QUEUE), same as a wall.
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
      const composed = allPicked
        ? itemService.composeDynamicDishName(item.id, chosen)
        : undefined;
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

    // Single-slot dynamic recipe → a card per in-stock ingredient (the established shape).
    const [slotKey, slot] = slotEntries[0];
    const cats = recipeService.slotCategories(slot);
    // Dedupe by id across cats; getItemsByCategory is pseudo-category aware (`log`/`plank` match by id
    // suffix, not item.category — logs share the `wood` category with planks/beams).
    const variantItems = [
      ...new Map(cats.flatMap((c) => itemService.getItemsByCategory(c)).map((i) => [i.id, i])).values()
    ];
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

  $: craftEntries = allCraftableItems.flatMap((i) => entriesFor(i, itemMap, dishSel));

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
    <BackButton />
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
          {@const toolReq = requiredToolOf(item.id)}
          {@const toolReqMet = toolReq?.met ?? true}
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
              {@const yieldPills = (item.yields ?? []).map((output) => ({
                itemId: output.item,
                qty: `×${Math.max(1, Math.round((output.min * intactness) / 100))}-${Math.max(
                  1,
                  Math.round((output.max * intactness) / 100)
                )}`
              })) satisfies ItemPillView[]}
              <ItemPills pills={yieldPills} />
            {:else}
              {#if entry.slots}
                <!-- Multi-slot dish: pick each ingredient. The dish names itself from the picks and is
                     craftable once every slot is chosen. -->
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
                <!-- A multi-slot dish's ingredient pickers ARE its cost, so "free" must not show there. -->
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
    font-family: var(--font-mono);
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

  /* Multi-slot dish ingredient pickers (stew/pie) — the SAME "any X" dropdown pattern as the building
     material picker (BuildingMenu .mat-select), so picking a stew's meat reads like picking a wall's
     plank. */
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
    font-size: 10px;
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
  /* An unchosen slot reads as a dashed, dimmed prompt so it's obvious it still needs a pick. */
  .mat-select.unset {
    border-style: dashed;
    color: var(--text-dim);
  }
  .cost-have {
    opacity: 0.6;
  }
  /* §M chosen-ingredient effect line under a picker (nutrition / material stat). */
  .mat-effect {
    display: block;
    color: #7e9fbf;
    font-size: 9px;
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
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1;
    padding: 0 1px;
    cursor: pointer;
  }
  .job-x:hover {
    color: var(--neg);
  }
</style>
