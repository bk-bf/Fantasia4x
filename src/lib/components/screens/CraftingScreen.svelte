<script lang="ts">
  import { gameState, currentItem, currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import {
    getCraftableItems,
    canCraftItem,
    canCraftWithRequirements,
    getItemIcon,
    getItemColor,
    getItemRarityColor,
    ITEMS_DATABASE
  } from '$lib/game/core/Items';
  import { onDestroy } from 'svelte';

  let itemMap: Record<string, number> = {};
  let race: any = null;
  let inventory: Record<string, number> = {};
  let craftingQueue: any[] = [];
  let completedResearch: string[] = [];
  let availableBuildings: string[] = [];
  let currentToolLevel = 0;
  let currentPopulation = 0;

  // Item type filter
  let selectedItemType = 'all';
  let itemTypes = ['all', 'tool', 'weapon', 'armor', 'consumable', 'material'];

  // Reuse item fetching pattern from BuildingMenu
  $: getItemAmount = (itemId: string): number => {
    return itemMap[itemId] || 0;
  };

  $: getInventoryAmount = (itemId: string): number => {
    return inventory[itemId] || 0;
  };

  // Filter craftable items based on current state
  $: availableCraftableItems = getCraftableItems(
    completedResearch,
    availableBuildings,
    currentToolLevel,
    currentPopulation,
    selectedItemType === 'all' ? undefined : selectedItemType
  );

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
    inventory = state.inventory || {};
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

  function startCrafting(item: any) {
    if (!canCraftItem(item, itemMap)) {
      console.log('Cannot craft:', item.name);
      return;
    }

    gameState.update((state) => {
      // Deduct items (reuse pattern from BuildingMenu)
      const newItems = state.item.map((stateItem) => {
        const cost = item.craftingCost?.[stateItem.id] || 0;
        const newAmount = Math.max(0, stateItem.amount - cost);
        return { ...stateItem, amount: newAmount };
      });

      // Add to crafting queue with new interface
      const newCraftingInProgress = {
        item: item,
        quantity: 1,
        turnsRemaining: item.craftingTime || 1,
        startedAt: state.turn
      };

      return {
        ...state,
        item: newItems,
        craftingQueue: [...(state.craftingQueue || []), newCraftingInProgress]
      };
    });
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

  function getCategoryIcon(category: string): string {
    switch (category) {
      case 'harvesting':
        return '🌲';
      case 'construction':
        return '🏗️';
      case 'mining':
        return '⛏️';
      case 'combat':
        return '⚔️';
      case 'crafting':
        return '🔧';
      case 'melee':
        return '⚔️';
      case 'ranged':
        return '🏹';
      case 'light':
        return '🧥';
      case 'heavy':
        return '🛡️';
      case 'healing':
        return '💊';
      case 'metal':
        return '🔩';
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
</script>

<div class="crafting-screen">
  <div class="crafting-header">
    <button class="back-btn" on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>🔨 Crafting Workshop</h2>
    <p class="crafting-subtitle">Create tools, weapons, and equipment</p>
  </div>

  <div class="crafting-content">
    <!-- Item Type Filter (compact) -->
    <div class="item-filters">
      <h3>📦 Item Categories</h3>
      <div class="filter-buttons">
        {#each itemTypes as itemType}
          <button
            class="filter-btn"
            class:active={selectedItemType === itemType}
            on:click={() => (selectedItemType = itemType)}
            title={itemType.charAt(0).toUpperCase() + itemType.slice(1)}
          >
            {itemType === 'all'
              ? '📦'
              : itemType === 'tool'
                ? '🔧'
                : itemType === 'weapon'
                  ? '⚔️'
                  : itemType === 'armor'
                    ? '🛡️'
                    : itemType === 'consumable'
                      ? '🧪'
                      : '📋'}
          </button>
        {/each}
      </div>
    </div>

    <!-- Current Inventory -->
    <div class="current-inventory">
      <h3>🎒 Current Inventory</h3>
      {#if Object.keys(inventory).length > 0}
        <div class="inventory-grid">
          {#each Object.entries(inventory) as [itemId, quantity]}
            {#if quantity > 0}
              {@const item = ITEMS_DATABASE.find((i) => i.id === itemId)}
              {#if item}
                <div
                  class="inventory-item"
                  style="--rarity-color: {getItemRarityColor(item.rarity ?? 'common')}"
                >
                  <span class="item-icon">{getItemIcon(itemId)}</span>
                  <div class="item-details">
                    <span class="item-name">{item.name}</span>
                    <span class="item-type">{item.type} • {item.rarity}</span>
                  </div>
                  <span class="item-quantity">x{quantity}</span>
                </div>
              {/if}
            {/if}
          {/each}
        </div>
      {:else}
        <div class="empty-inventory">
          <p>No items crafted yet. Start creating your first tools!</p>
        </div>
      {/if}
    </div>

    <!-- Crafting Queue -->
    <div class="crafting-queue">
      <h3>⚒️ Crafting Queue</h3>
      {#if craftingQueue.length > 0}
        <div class="queue-list">
          {#each craftingQueue as queueItem, index}
            <div class="queue-item">
              <span class="queue-icon">🔨</span>
              <span class="queue-name">{queueItem.item.name}</span>
              <span class="queue-progress">{queueItem.turnsRemaining} days remaining</span>
              <button
                class="cancel-btn"
                on:click={() => cancelCrafting(index)}
                title="Cancel crafting and refund materials"
              >
                ❌
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-queue">
          <p>No crafting in progress</p>
        </div>
      {/if}
    </div>

    <!-- Available Craftable Items -->
    <div class="available-recipes">
      <h3>📋 Available Items to Craft</h3>
      <div class="recipes-grid">
        {#each availableCraftableItems as item}
          <div class="recipe-card" class:affordable={canCraftItem(item, itemMap)}>
            <div class="recipe-card-header">
              <span class="recipe-icon">{getItemIcon(item.id)}</span>
              <h4>{item.name}</h4>
              <div
                class="item-rarity"
                style="--rarity-color: {getItemRarityColor(item.rarity || 'common')}"
              >
                {item.rarity}
              </div>
            </div>

            <p class="recipe-description">{item.description}</p>

            <div class="recipe-requirements">
              <div class="craft-time">⏰ {item.craftingTime || 1} days</div>
              {#if item.toolLevelRequired && item.toolLevelRequired > 0}
                <div class="tool-level-required">
                  🔧 Requires Tool Level {item.toolLevelRequired}
                </div>
              {/if}
              {#if item.buildingRequired}
                <div class="building-required">🏗️ Requires {item.buildingRequired}</div>
              {/if}
              {#if item.researchRequired}
                <div class="research-required">📚 Requires {item.researchRequired}</div>
              {/if}
              {#if item.populationRequired && item.populationRequired > 0}
                <div class="population-required">
                  👥 Requires {item.populationRequired} population
                </div>
              {/if}
            </div>

            <div class="recipe-inputs">
              <h5>Materials:</h5>
              <div class="inputs-list">
                {#if item.craftingCost && Object.keys(item.craftingCost).length > 0}
                  {#each Object.entries(item.craftingCost) as [itemId, amount]}
                    <div class="input-item" class:insufficient={getItemAmount(itemId) < amount}>
                      <span class="input-icon">{getItemIcon(itemId)}</span>
                      <span class="input-amount">{amount}</span>
                      <span class="input-name">{itemId}</span>
                      <span class="input-available">({getItemAmount(itemId)} available)</span>
                    </div>
                  {/each}
                {:else}
                  <div class="no-materials">No materials required (gathered item)</div>
                {/if}
              </div>
            </div>

            <div class="recipe-outputs">
              <h5>Creates:</h5>
              <div class="outputs-list">
                <div
                  class="output-item"
                  style="--rarity-color: {getItemRarityColor(item.rarity || 'common')}"
                >
                  <span class="output-icon">{getItemIcon(item.id)}</span>
                  <span class="output-amount">1x</span>
                  <span class="output-name">{item.name}</span>
                  <span class="output-rarity">({item.rarity})</span>
                </div>

                <!-- Show item effects -->
                {#if item.effects && Object.keys(item.effects).length > 0}
                  <div class="item-effects">
                    {#each Object.entries(item.effects) as [effect, value]}
                      <div class="effect-item">
                        +{value}
                        {formatEffectName(effect)}
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <button
              class="craft-btn"
              class:disabled={!canCraftItem(item, itemMap) ||
                !canCraftWithRequirements(
                  item,
                  currentToolLevel,
                  availableBuildings,
                  currentPopulation,
                  completedResearch
                )}
              on:click={() => startCrafting(item)}
              disabled={!canCraftItem(item, itemMap) ||
                !canCraftWithRequirements(
                  item,
                  currentToolLevel,
                  availableBuildings,
                  currentPopulation,
                  completedResearch
                )}
            >
              {#if !canCraftWithRequirements(item, currentToolLevel, availableBuildings, currentPopulation, completedResearch)}
                Requirements Not Met
              {:else if !canCraftItem(item, itemMap)}
                Insufficient Materials
              {:else}
                Begin Crafting
              {/if}
            </button>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .crafting-screen {
    padding: 20px;
    background: #000000;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    height: 100%;
    overflow-y: auto;
  }

  .crafting-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #ff9800;
    position: relative;
  }

  .back-btn {
    position: absolute;
    top: 0;
    right: 0;
    padding: 8px 16px;
    background: #000000;
    border: 1px solid #ff9800;
    color: #ff9800;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .back-btn:hover {
    background: #ff9800;
    color: #000;
  }

  .crafting-header h2 {
    color: #ff9800;
    margin: 0 0 10px 0;
    font-size: 2em;
    text-shadow: 0 0 10px rgba(255, 152, 0, 0.3);
  }

  .crafting-subtitle {
    color: #888;
    margin: 0;
    font-style: italic;
  }

  .crafting-content {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .item-filters {
    background: #000000;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #9c27b0;
  }

  .item-filters h3 {
    color: #9c27b0;
    margin: 0 0 15px 0;
  }

  .filter-buttons {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .filter-btn {
    padding: 8px 16px;
    background: #000000;
    border: 1px solid #555;
    color: #e0e0e0;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    transition: all 0.2s ease;
  }

  .filter-btn:hover {
    background: #0c0c0c;
    border-color: #9c27b0;
  }

  .filter-btn.active {
    background: #9c27b0;
    border-color: #9c27b0;
    color: #000;
  }

  .current-inventory {
    background: #000000;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #ff9800;
  }

  .current-inventory h3 {
    color: #ff9800;
    margin: 0 0 15px 0;
  }

  .inventory-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 10px;
  }

  .inventory-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: #0c0c0c;
    border-radius: 4px;
    border-left: 3px solid var(--rarity-color);
  }

  .item-icon {
    font-size: 1.5em;
  }

  .item-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-name {
    color: #e0e0e0;
    font-weight: bold;
  }

  .item-type {
    color: #888;
    font-size: 0.8em;
    text-transform: capitalize;
  }

  .item-quantity {
    color: #ff9800;
    font-weight: bold;
  }

  .empty-inventory,
  .empty-queue {
    padding: 20px;
    text-align: center;
    color: #888;
    font-style: italic;
    background: #000000;
    border-radius: 4px;
    border: 2px dashed #555;
  }

  .crafting-queue {
    background: #000000;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #2196f3;
  }

  .crafting-queue h3 {
    color: #2196f3;
    margin: 0 0 15px 0;
  }

  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .queue-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    background: #0c0c0c;
    border-radius: 4px;
  }

  .cancel-btn {
    margin-left: auto;
    padding: 4px 8px;
    background: #d32f2f;
    border: 1px solid #f44336;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8em;
    transition: all 0.2s ease;
  }

  .cancel-btn:hover {
    background: #f44336;
    transform: scale(1.1);
  }

  .queue-progress {
    color: #2196f3;
    font-weight: bold;
  }

  .available-recipes h3 {
    color: #ff9800;
    margin: 0 0 20px 0;
  }

  .recipes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(375px, 1fr));
    gap: 20px;
  }

  .recipe-card {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #555;
    transition: all 0.3s ease;
    box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.18);
  }

  .recipe-card.affordable {
    border-left-color: #ff9800;
  }

  .recipe-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    position: relative;
  }

  .recipe-icon {
    font-size: 1.5em;
  }

  .recipe-card h4 {
    color: #ff9800;
    margin: 0;
    font-size: 1.2em;
    flex: 1;
  }

  .item-rarity {
    background: var(--rarity-color);
    color: #000;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8em;
    font-weight: bold;
    text-transform: capitalize;
  }

  .recipe-description {
    color: #888;
    font-style: italic;
    margin: 0 0 15px 0;
  }

  .recipe-requirements {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 15px;
    font-size: 0.9em;
    color: #888;
  }

  .recipe-inputs h5,
  .recipe-outputs h5 {
    color: #e0e0e0;
    margin: 0 0 8px 0;
    font-size: 1em;
  }

  .inputs-list,
  .outputs-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 15px;
  }

  .input-item,
  .output-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9em;
  }

  .input-item.insufficient {
    color: #f44336;
  }

  .input-amount,
  .output-amount {
    font-weight: bold;
  }

  .input-available {
    color: #888;
    font-size: 0.8em;
    margin-left: auto;
  }

  .no-materials {
    color: #888;
    font-style: italic;
    font-size: 0.9em;
  }

  .output-item {
    color: #4caf50;
    border-left: 2px solid var(--rarity-color);
    padding-left: 8px;
  }

  .output-rarity {
    color: var(--rarity-color);
    font-size: 0.8em;
    margin-left: auto;
  }

  .item-effects {
    margin-left: 20px;
    margin-top: 5px;
  }

  .effect-item {
    color: #4caf50;
    font-size: 0.8em;
  }

  .craft-btn {
    width: 100%;
    padding: 12px;
    background: #ff9800;
    border: none;
    color: #000;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-weight: bold;
    transition: all 0.3s ease;
  }

  .craft-btn:hover:not(.disabled) {
    background: #ffb74d;
    transform: translateY(-1px);
  }

  .craft-btn.disabled {
    background: #555;
    color: #888;
    cursor: not-allowed;
  }

  /* Scrollbar styling */
  .crafting-screen::-webkit-scrollbar {
    width: 8px;
  }

  .crafting-screen::-webkit-scrollbar-track {
    background: #000000;
  }

  .crafting-screen::-webkit-scrollbar-thumb {
    background: #ff9800;
    border-radius: 4px;
  }
</style>
