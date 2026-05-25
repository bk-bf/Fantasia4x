<script lang="ts">
  import { gameState, currentItem, currentRace } from '$lib/stores/gameState';
  import CurrentTask from '$lib/components/UI/CurrentTask.svelte';
  import { uiState } from '$lib/stores/uiState';
  import TaskContainer from '$lib/components/UI/TaskContainer.svelte';
  import { ITEMS_DATABASE } from '$lib/game/core/Items';
  import { gameEngine } from '$lib/game/systems/GameEngineImpl';
  import { onDestroy } from 'svelte';
  import type { Item } from '$lib/game/core/types';

  let itemMap: Record<string, number> = {};
  let race: any = null;
  let inventory: Record<string, number> = {};
  let craftingQueue: any[] = [];
  let completedResearch: string[] = [];
  let availableBuildings: string[] = [];
  let currentToolLevel = 0;
  let currentPopulation = 0;

  // Enhanced item type filter with new categories
  let selectedItemType = 'all';
  let itemTypes = ['all', 'material', 'tool', 'weapon', 'armor', 'consumable', 'currency'];

  // Enhanced category filter for more granular control
  let selectedCategory = 'all';
  let categories = [
    'all',
    'harvesting',
    'crafting',
    'woodworking',
    'stoneworking',
    'metalworking',
    'leatherworking',
    'cooking',
    'magical'
  ];

  // Reuse item fetching pattern from BuildingMenu
  $: getItemAmount = (itemId: string): number => {
    return itemMap[itemId] || 0;
  };

  $: getInventoryAmount = (itemId: string): number => {
    return inventory[itemId] || 0;
  };

  // Enhanced filtering with both type and category
  $: availableCraftableItems = (() => {
    if (!$gameState) return [];
    let items = gameEngine.getCraftableItems();

    // Filter by type if specified
    if (selectedItemType !== 'all') {
      items = items.filter((item) => item.type === selectedItemType);
    }

    // Filter by category if specified
    if (selectedCategory !== 'all') {
      items = items.filter((item) => item.category === selectedCategory);
    }

    return items;
  })();

  // Get first crafting item for CurrentTask component
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
    craftingQueue = state.craftingQueue || [];
    completedResearch = state.completedResearch || [];
    currentToolLevel = state.currentToolLevel || 0;

    // Get available buildings (reuse pattern from ResearchScreen)
    availableBuildings = Object.keys(state.buildingCounts || {}).filter(
      (buildingId) => (state.buildingCounts || {})[buildingId] > 0
    );
  });

  onDestroy(() => {
    unsubscribeItem();
    unsubscribeRace();
    unsubscribeGame();
  });

  function startCrafting(item: Item) {
    if (!$gameState) {
      console.log('Cannot craft:', item.name);
      return;
    }

    // COORDINATION: Start crafting through GameEngine
    gameEngine.craftItem(item.id, 1);
  }

  function cancelCrafting(queueIndex: number) {
    if (queueIndex < 0 || queueIndex >= craftingQueue.length) return;

    const canceledItem = craftingQueue[queueIndex];
    const item = canceledItem.item;

    gameState.update((state) => {
      // Refund items (reuse pattern from BuildingMenu)
      const refundedItems = state.item.map((stateItem) => {
        const refund = item.craftingCost?.[stateItem.id] || 0;
        return { ...stateItem, amount: stateItem.amount + refund };
      });

      // Remove from queue
      const newQueue = [...(state.craftingQueue || [])];
      newQueue.splice(queueIndex, 1);

      return {
        ...state,
        item: refundedItems,
        craftingQueue: newQueue
      };
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

  function getCategoryIcon(category: string): string {
    switch (category) {
      case 'harvesting':
        return '🌲';
      case 'crafting':
        return '🔨';
      case 'woodworking':
        return '🪚';
      case 'stoneworking':
        return '🗿';
      case 'metalworking':
        return '⚒️';
      case 'leatherworking':
        return '🦬';
      case 'cooking':
        return '🍲';
      case 'magical':
        return '🔮';
      case 'light':
        return '🧥';
      case 'medium':
        return '🦺';
      case 'heavy':
        return '🛡️';
      case 'shield':
        return '🛡️';
      case 'melee':
        return '⚔️';
      case 'ranged':
        return '🏹';
      case 'healing':
        return '💊';
      case 'meal':
        return '🍖';
      case 'medical':
        return '💉';
      case 'alchemical':
        return '⚗️';
      default:
        return '🛠️';
    }
  }

  function formatEffectName(camelCaseStr: string): string {
    return camelCaseStr
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (match) => match.toUpperCase())
      .trim();
  }

  function getItemRequirements(item: Item): string[] {
    const requirements = [];

    if (item.toolTierRequired && item.toolTierRequired > 0) {
      requirements.push(`🔧 Tool Level ${item.toolTierRequired}`);
    }

    if (item.buildingRequired) {
      requirements.push(`🏗️ ${item.buildingRequired}`);
    }

    if (item.researchRequired) {
      requirements.push(`📚 ${item.researchRequired}`);
    }

    if (item.populationRequired && item.populationRequired > 0) {
      requirements.push(`👥 ${item.populationRequired} population`);
    }

    return requirements;
  }

  function getItemSpecialProperties(item: Item): string[] {
    const properties = [];

    // Weapon properties
    if (item.weaponProperties) {
      properties.push(`⚔️ ${item.weaponProperties.damage} damage`);
      properties.push(`⚡ ${item.weaponProperties.attackSpeed} speed`);
      properties.push(`📏 ${item.weaponProperties.range} range`);
    }

    // Armor properties
    if (item.armorProperties) {
      properties.push(`🛡️ ${item.armorProperties.defense} defense`);
      properties.push(`👕 ${item.armorProperties.armorType} armor`);
      properties.push(`📍 ${item.armorProperties.slot} slot`);

      if (item.armorProperties.movementPenalty > 0) {
        properties.push(`🐌 ${Math.round(item.armorProperties.movementPenalty * 100)}% slower`);
      }
    }

    // Consumable properties
    if (item.consumableProperties) {
      properties.push(`🔄 ${item.consumableProperties.uses} uses`);
      properties.push(`⏱️ ${item.consumableProperties.consumeTime} time`);
    }

    return properties;
  }
</script>

<div class="crafting-screen">
  <div class="screen-hdr">
    | CRAFTING
    <button class="hdr-btn" on:click={() => uiState.setScreen('main')}>BACK</button>
  </div>

  <!-- Type filters -->
  <div class="filter-bar">
    {#each itemTypes as itemType}
      <button
        class="filter-btn"
        class:active={selectedItemType === itemType}
        on:click={() => (selectedItemType = itemType)}
        >{itemType === 'all' ? 'ALL TYPES' : itemType.toUpperCase()}</button
      >
    {/each}
  </div>

  <!-- Category filters -->
  <div class="filter-bar secondary">
    {#each categories as category}
      <button
        class="filter-btn"
        class:active={selectedCategory === category}
        on:click={() => (selectedCategory = category)}
        >{category === 'all' ? 'ALL CATS' : category.toUpperCase()}</button
      >
    {/each}
  </div>

  <!-- Inventory -->
  <div class="section-hdr sub">| INVENTORY</div>
  {#if Object.keys(inventory).length > 0}
    {#each Object.entries(inventory) as [itemId, quantity]}
      {#if quantity > 0}
        {@const item = ITEMS_DATABASE.find((i) => i.id === itemId)}
        {#if item}
          <div class="inv-row">
            <span class="inv-name">{item.name.toUpperCase()}</span>
            <span class="inv-meta">{item.type} / {item.category}</span>
            <span class="inv-qty">x{quantity}</span>
          </div>
        {/if}
      {/if}
    {/each}
  {:else}
    <div class="row"><span class="muted">inventory empty</span></div>
  {/if}

  <!-- Crafting Queue -->
  <div class="section-hdr sub">| CRAFTING QUEUE</div>
  {#if craftingQueue.length > 0}
    {#each craftingQueue as queueItem, index}
      <div class="queue-item">
        <div class="row">
          <span class="lbl">ITEM</span><span class="val">{queueItem.item.name.toUpperCase()}</span>
        </div>
        <div class="need-row">
          <span class="lbl">PROGRESS</span>
          <div class="bar">
            <div
              class="fill"
              style="width: {Math.round(
                ((queueItem.item.craftingTime - queueItem.turnsRemaining) /
                  queueItem.item.craftingTime) *
                  100
              )}%; background: var(--accent-hi)"
            ></div>
          </div>
          <span class="val"
            >{Math.round(
              ((queueItem.item.craftingTime - queueItem.turnsRemaining) /
                queueItem.item.craftingTime) *
                100
            )}%</span
          >
          <span class="desc">{queueItem.turnsRemaining} turns left</span>
        </div>
        <div class="btn-row">
          <button class="act-btn" on:click={() => cancelCrafting(index)}>CANCEL</button>
        </div>
      </div>
    {/each}
  {:else}
    <div class="row"><span class="muted">no active crafting</span></div>
  {/if}

  <!-- Available recipes -->
  <div class="section-hdr">| AVAILABLE ({availableCraftableItems.length})</div>
  {#each availableCraftableItems as item}
    <div class="recipe-item">
      <div class="recipe-name">
        {item.name.toUpperCase()}
        <span class="rmeta">{item.type} / {item.category}</span>
        <span class="rarity-tag">{item.rarity}</span>
      </div>
      <div class="desc-row">{item.description}</div>
      <div class="row">
        <span class="lbl">CRAFT TIME</span><span class="val">{item.craftingTime || 1} turns</span>
      </div>

      {#each getItemRequirements(item) as req}
        <div class="row"><span class="lbl">REQUIRE</span><span class="val dim">{req}</span></div>
      {/each}

      {#if item.craftingCost && Object.keys(item.craftingCost).length > 0}
        {#each Object.entries(item.craftingCost) as [materialId, amount]}
          {@const matItem = ITEMS_DATABASE.find((i) => i.id === materialId)}
          {@const have = getItemAmount(materialId)}
          <div class="row" class:insufficient={have < (amount as number)}>
            <span class="lbl">COST</span>
            <span class="val" class:neg={have < (amount as number)}>
              {matItem?.name || materialId}: {amount} (have {have})
            </span>
          </div>
        {/each}
      {:else}
        <div class="row"><span class="lbl">COST</span><span class="val dim">none</span></div>
      {/if}

      {#if item.effects && Object.keys(item.effects).length > 0}
        {#each Object.entries(item.effects) as [effect, value]}
          <div class="row">
            <span class="lbl">EFFECT</span><span class="val pos"
              >+{value} {formatEffectName(effect)}</span
            >
          </div>
        {/each}
      {/if}

      {#each getItemSpecialProperties(item) as prop}
        <div class="row"><span class="lbl">SPECIAL</span><span class="val dim">{prop}</span></div>
      {/each}

      <div class="btn-row">
        <button
          class="act-btn"
          class:active={$gameState && itemService.canCraftItem(item.id, $gameState)}
          on:click={() => startCrafting(item)}
          disabled={!$gameState || !itemService.canCraftItem(item.id, $gameState)}
        >
          {#if !$gameState || !itemService.canCraftItem(item.id, $gameState)}CANNOT CRAFT
          {:else}BEGIN CRAFTING
          {/if}
        </button>
      </div>
    </div>
  {/each}

  {#if availableCraftableItems.length === 0}
    <div class="row"><span class="muted">no recipes available</span></div>
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
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .hdr-btn {
    margin-left: auto;
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .hdr-btn:hover {
    color: var(--text);
    border-color: var(--border-hi);
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 1px;
    flex-shrink: 0;
  }
  .section-hdr.sub {
    background: var(--bg);
    color: var(--text-dim);
  }

  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 4px 8px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .filter-bar.secondary {
    background: var(--bg);
  }

  .filter-btn {
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .filter-btn.active {
    background: var(--tab-active);
    color: #fff;
    border-color: var(--tab-active);
  }
  .filter-btn:hover:not(.active) {
    color: var(--text);
    border-color: var(--border-hi);
  }

  .row {
    display: flex;
    padding: 2px 8px;
    align-items: baseline;
    gap: 6px;
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .row.insufficient {
    background: rgba(200, 48, 24, 0.05);
  }

  .need-row {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    gap: 8px;
  }

  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
    width: 70px;
    flex-shrink: 0;
  }

  .val {
    color: var(--text);
    font-size: 11px;
    margin-left: auto;
    text-align: right;
  }
  .val.pos {
    color: var(--pos);
  }
  .val.neg {
    color: var(--neg);
  }
  .val.dim {
    color: var(--text-muted);
  }

  .desc {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    flex: 1;
  }
  .bar {
    flex: 1;
    height: 4px;
    background: var(--bg-active);
  }
  .fill {
    height: 100%;
  }
  .muted {
    color: var(--text-muted);
    font-style: italic;
    font-size: 11px;
    padding: 4px 8px;
  }
  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }

  /* Inventory */
  .inv-row {
    display: flex;
    padding: 2px 8px;
    gap: 8px;
    align-items: baseline;
    border-bottom: 1px solid var(--border);
  }
  .inv-row:hover {
    background: var(--bg-hover);
  }
  .inv-name {
    color: var(--text);
    font-size: 11px;
    width: 150px;
    flex-shrink: 0;
  }
  .inv-meta {
    color: var(--text-muted);
    font-size: 10px;
    flex: 1;
  }
  .inv-qty {
    color: var(--accent-hi);
    font-size: 11px;
    margin-left: auto;
  }

  /* Queue */
  .queue-item {
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
  }

  /* Recipe items */
  .recipe-item {
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
    margin-bottom: 1px;
  }

  .recipe-name {
    padding: 4px 8px;
    color: var(--text);
    font-size: 11px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    display: flex;
    gap: 8px;
    align-items: baseline;
  }

  .rmeta {
    color: var(--text-muted);
    font-size: 10px;
  }
  .rarity-tag {
    color: var(--text-dim);
    font-size: 10px;
    margin-left: auto;
  }

  .desc-row {
    padding: 2px 8px 3px 16px;
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    border-bottom: 1px solid var(--border);
  }

  .btn-row {
    display: flex;
    gap: 4px;
    padding: 4px 8px;
  }

  .act-btn {
    padding: 3px 10px;
    background: var(--bg-hover);
    border: 1px solid var(--border-hi);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .act-btn.active {
    background: var(--tab-active);
    color: #fff;
    border-color: var(--tab-active);
  }
  .act-btn:hover:not(:disabled) {
    color: var(--accent-hi);
    background: var(--bg-active);
  }
  .act-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
