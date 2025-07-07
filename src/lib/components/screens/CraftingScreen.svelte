<script lang="ts">
  import { gameState, currentItem, currentRace } from '$lib/stores/gameState';
  import CurrentTask from '$lib/components/UI/CurrentTask.svelte';
  import { uiState } from '$lib/stores/uiState';
  import TaskContainer from '$lib/components/UI/TaskContainer.svelte';
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
  $: availableCraftableItems = getCraftableItems(
    completedResearch,
    availableBuildings,
    currentToolLevel,
    currentPopulation,
    selectedItemType === 'all' ? undefined : selectedItemType,
    selectedCategory === 'all' ? undefined : selectedCategory
  );

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

  function startCrafting(item: Item) {
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
  <div class="crafting-header">
    <button class="back-btn" on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>🔨 Crafting Workshop</h2>
    <p class="crafting-subtitle">Create tools, weapons, armor, and consumables</p>
  </div>

  <div class="crafting-content">
    <!-- Enhanced Filters -->
    <div class="crafting-filters">
      <!-- Item Type Filter -->
      <div class="filter-section">
        <h3>📦 Item Types</h3>
        <div class="filter-buttons">
          {#each itemTypes as itemType}
            <button
              class="filter-btn"
              class:active={selectedItemType === itemType}
              on:click={() => (selectedItemType = itemType)}
              title={itemType.charAt(0).toUpperCase() + itemType.slice(1)}
            >
              {getTypeIcon(itemType)}
              <span class="filter-label">{itemType === 'all' ? 'All' : itemType}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Category Filter -->
      <div class="filter-section">
        <h3>🏷️ Categories</h3>
        <div class="filter-buttons">
          {#each categories as category}
            <button
              class="filter-btn"
              class:active={selectedCategory === category}
              on:click={() => (selectedCategory = category)}
              title={category.charAt(0).toUpperCase() + category.slice(1)}
            >
              {getCategoryIcon(category)}
              <span class="filter-label">{category === 'all' ? 'All' : category}</span>
            </button>
          {/each}
        </div>
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
                  <span class="item-icon">{item.emoji || getItemIcon(itemId)}</span>
                  <div class="item-details">
                    <span class="item-name">{item.name}</span>
                    <span class="item-type">{item.type} • {item.category} • {item.rarity}</span>
                    {#if item.durability && item.maxDurability}
                      <span class="item-durability">
                        Durability: {item.durability}/{item.maxDurability}
                      </span>
                    {/if}
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
    {#if craftingQueue.length > 0}
      <div class="crafting-queue">
        <h3>⚙️ Crafting in Progress</h3>
        <TaskContainer layout="horizontal">
          {#each craftingQueue.slice(0, 3) as queueItem, index}
            <CurrentTask
              title=""
              icon={queueItem.item.emoji || getCategoryIcon(queueItem.item.category)}
              name={queueItem.item.name}
              description={queueItem.item.description || 'Crafting in progress...'}
              progress={(queueItem.item.craftingTime - queueItem.turnsRemaining) /
                queueItem.item.craftingTime}
              timeRemaining="{queueItem.turnsRemaining} hours"
              onCancel={() => cancelCrafting(index)}
              cancelTitle="Cancel crafting and refund materials"
              accentColor="#ff9800"
              compact={true}
              showDescription={false}
            />
          {/each}
        </TaskContainer>

        <!-- Show remaining items if more than 3 -->
        {#if craftingQueue.length > 3}
          <div class="remaining-items">
            <p>+{craftingQueue.length - 3} more items in queue</p>
          </div>
        {/if}
      </div>
    {:else}
      <div class="empty-queue">
        <p>No crafting in progress</p>
      </div>
    {/if}

    <!-- Available Craftable Items -->
    <div class="available-recipes">
      <h3>📋 Available Items to Craft ({availableCraftableItems.length})</h3>
      <div class="recipes-grid">
        {#each availableCraftableItems as item}
          <div class="recipe-card" class:affordable={canCraftItem(item, itemMap)}>
            <div class="recipe-card-header">
              <span class="recipe-icon">{item.emoji || getItemIcon(item.id)}</span>
              <div class="recipe-title">
                <h4>{item.name}</h4>
                <div class="recipe-meta">
                  <span class="item-type">{item.type}</span>
                  <span class="item-category">{item.category}</span>
                </div>
              </div>
              <div
                class="item-rarity"
                style="--rarity-color: {getItemRarityColor(item.rarity || 'common')}"
              >
                {item.rarity}
              </div>
            </div>

            <p class="recipe-description">{item.description}</p>

            <!-- Requirements Section -->
            <div class="recipe-requirements">
              <div class="craft-time">⏰ {item.craftingTime || 1} hours</div>
              {#each getItemRequirements(item) as requirement}
                <div class="requirement-item">{requirement}</div>
              {/each}
            </div>

            <!-- Special Properties -->
            {#if getItemSpecialProperties(item).length > 0}
              <div class="special-properties">
                <h5>Properties:</h5>
                {#each getItemSpecialProperties(item) as property}
                  <div class="property-item">{property}</div>
                {/each}
              </div>
            {/if}

            <!-- Materials Required -->
            <div class="recipe-inputs">
              <h5>Materials:</h5>
              <div class="inputs-list">
                {#if item.craftingCost && Object.keys(item.craftingCost).length > 0}
                  {#each Object.entries(item.craftingCost) as [itemId, amount]}
                    {@const materialItem = ITEMS_DATABASE.find((i) => i.id === itemId)}
                    <div class="input-item" class:insufficient={getItemAmount(itemId) < amount}>
                      <span class="input-icon">{materialItem?.emoji || getItemIcon(itemId)}</span>
                      <span class="input-amount">{amount}</span>
                      <span class="input-name">{materialItem?.name || itemId}</span>
                      <span class="input-available">({getItemAmount(itemId)} available)</span>
                    </div>
                  {/each}
                {:else}
                  <div class="no-materials">No materials required (gathered item)</div>
                {/if}
              </div>
            </div>

            <!-- Item Effects -->
            {#if item.effects && Object.keys(item.effects).length > 0}
              <div class="recipe-outputs">
                <h5>Effects:</h5>
                <div class="item-effects">
                  {#each Object.entries(item.effects) as [effect, value]}
                    <div class="effect-item">
                      +{value}
                      {formatEffectName(effect)}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

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
  .crafting-filters {
    display: flex;
    flex-direction: column;
    gap: 20px;
    background: #000000;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #9c27b0;
  }

  .filter-section h3 {
    color: #9c27b0;
    margin: 0 0 15px 0;
  }

  .filter-btn {
    display: flex;
    align-items: center;
    gap: 8px;
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

  .filter-label {
    text-transform: capitalize;
  }

  .recipe-title {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .recipe-meta {
    display: flex;
    gap: 8px;
    font-size: 0.8em;
    color: #888;
  }

  .item-type,
  .item-category {
    text-transform: capitalize;
  }

  .special-properties {
    margin-bottom: 15px;
  }

  .special-properties h5 {
    color: #e0e0e0;
    margin: 0 0 8px 0;
    font-size: 1em;
  }

  .property-item {
    color: #2196f3;
    font-size: 0.9em;
    margin-bottom: 2px;
  }

  .item-durability {
    color: #ff9800;
    font-size: 0.8em;
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

  .remaining-items {
    text-align: center;
    color: #888;
    font-style: italic;
    margin-top: 10px;
  }
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
    padding: 4px;
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
