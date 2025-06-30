<script lang="ts">
  import { gameState, currentResources, currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import {
    getAvailableItems,
    getAvailableRecipes,
    canCraftRecipe,
    getItemIcon,
    getItemColor,
    getItemRarityColor,
    ITEMS_DATABASE,
    CRAFTING_RECIPES
  } from '$lib/game/core/Items';
  import { getResourceIcon, getResourceColor } from '$lib/game/core/Resources';
  import { onDestroy } from 'svelte';

  let resourcesMap: Record<string, number> = {};
  let race: any = null;
  let inventory: Record<string, number> = {};
  let craftingQueue: any[] = [];
  let completedResearch: string[] = [];
  let availableBuildings: string[] = [];
  let currentToolLevel = 0;

  // Item type filter
  let selectedItemType = 'all';
  let itemTypes = ['all', 'tool', 'weapon', 'armor', 'consumable', 'material'];

  // Reuse resource fetching pattern from BuildingMenu
  $: getResourceAmount = (resourceId: string): number => {
    return resourcesMap[resourceId] || 0;
  };

  $: getItemAmount = (itemId: string): number => {
    return inventory[itemId] || 0;
  };

  // Filter available recipes based on current state
  $: availableRecipes = getAvailableRecipes(
    completedResearch,
    availableBuildings,
    currentToolLevel
  );

  // Filter available items based on research and type
  $: availableItems = getAvailableItems(
    completedResearch,
    availableBuildings,
    selectedItemType === 'all' ? undefined : selectedItemType
  );

  // Filter recipes by selected item type
  $: filteredRecipes =
    selectedItemType === 'all'
      ? availableRecipes
      : availableRecipes.filter((recipe: any) => {
          // Check if recipe outputs match selected type
          return Object.keys(recipe.outputs).some((itemId) => {
            const item = ITEMS_DATABASE.find((i) => i.id === itemId);
            return item?.type === selectedItemType;
          });
        });

  const unsubscribeResources = currentResources.subscribe((resources) => {
    resourcesMap = {};
    resources.forEach((resource) => {
      resourcesMap[resource.id] = Math.floor(resource.amount);
    });
  });

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
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
    unsubscribeResources();
    unsubscribeRace();
    unsubscribeGame();
  });

  // TODO: [REFACTOR] Extract shared availability/requirement checking functions to a utils file
  // - Move getAvailableItems, meetsRequirements, canAfford to shared utils
  // - Update Buildings.ts, Research.ts, Items.ts to use shared functions
  // - Eliminates code duplication across all production systems
  // Priority: Medium (improves maintainability, no functional impact)

  function startCrafting(recipe: any) {
    if (!canCraftRecipe(recipe, resourcesMap)) {
      console.log('Cannot craft:', recipe.name);
      return;
    }

    gameState.update((state) => {
      // Deduct resources (reuse pattern from BuildingMenu)
      const newResources = state.resources.map((resource) => {
        const cost = recipe.inputs[resource.id] || 0;
        const newAmount = Math.max(0, resource.amount - cost);
        return { ...resource, amount: newAmount };
      });

      // Add to crafting queue
      const newCraftingInProgress = {
        recipe,
        turnsRemaining: recipe.craftingTime,
        startedAt: state.turn
      };

      return {
        ...state,
        resources: newResources,
        craftingQueue: [...(state.craftingQueue || []), newCraftingInProgress]
      };
    });
  }

  function cancelCrafting(queueIndex: number) {
    if (queueIndex < 0 || queueIndex >= craftingQueue.length) return;

    const canceledItem = craftingQueue[queueIndex];
    const recipe = canceledItem.recipe;

    gameState.update((state) => {
      // Refund resources (reuse pattern from BuildingMenu)
      const refundedResources = state.resources.map((resource) => {
        const refund = recipe.inputs[resource.id] || 0;
        return { ...resource, amount: resource.amount + refund };
      });

      // Remove from queue
      const newQueue = [...(state.craftingQueue || [])];
      newQueue.splice(queueIndex, 1);

      return {
        ...state,
        resources: refundedResources,
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

  function getItemName(itemId: string): string {
    const item = ITEMS_DATABASE.find((i) => i.id === itemId);
    return item ? item.name : itemId;
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
                  style="--rarity-color: {getItemRarityColor(item.rarity)}"
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

    <!-- Crafting Queue (reuse pattern from BuildingMenu) -->
    <div class="crafting-queue">
      <h3>⚒️ Crafting Queue</h3>
      {#if craftingQueue.length > 0}
        <div class="queue-list">
          {#each craftingQueue as item, index}
            <div class="queue-item">
              <span class="queue-icon">🔨</span>
              <span class="queue-name">{item.recipe.name}</span>
              <span class="queue-progress">{item.turnsRemaining} days remaining</span>
              <button
                class="cancel-btn"
                on:click={() => cancelCrafting(index)}
                title="Cancel crafting and refund resources"
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

    <!-- Available Recipes (reuse pattern from BuildingMenu) -->
    <div class="available-recipes">
      <h3>📋 Available Recipes</h3>
      <div class="recipes-grid">
        {#each filteredRecipes as recipe}
          <div class="recipe-card" class:affordable={canCraftRecipe(recipe, resourcesMap)}>
            <div class="recipe-card-header">
              <span class="recipe-icon">🔨</span>
              <h4>{recipe.name}</h4>
            </div>

            <p class="recipe-description">{recipe.description}</p>

            <div class="recipe-requirements">
              <div class="craft-time">⏰ {recipe.craftingTime} days</div>
              {#if recipe.toolLevelRequired > 0}
                <div class="tool-level-required">
                  🔧 Requires Tool Level {recipe.toolLevelRequired}
                </div>
              {/if}
              {#if recipe.buildingRequired}
                <div class="building-required">🏗️ Requires {recipe.buildingRequired}</div>
              {/if}
              {#if recipe.researchRequired}
                <div class="research-required">📚 Requires {recipe.researchRequired}</div>
              {/if}
            </div>

            <div class="recipe-inputs">
              <h5>Materials:</h5>
              <div class="inputs-list">
                {#each Object.entries(recipe.inputs) as [resourceId, amount]}
                  <div
                    class="input-item"
                    class:insufficient={getResourceAmount(resourceId) < (amount as number)}
                  >
                    <span class="input-icon">{getResourceIcon(resourceId)}</span>
                    <span class="input-amount">{amount}</span>
                    <span class="input-resource">{resourceId}</span>
                    <span class="input-available">({getResourceAmount(resourceId)} available)</span>
                  </div>
                {/each}
              </div>
            </div>

            <div class="recipe-outputs">
              <h5>Creates:</h5>
              <div class="outputs-list">
                {#each Object.entries(recipe.outputs) as [itemId, amount]}
                  {@const item = ITEMS_DATABASE.find((i) => i.id === itemId)}
                  {#if item}
                    <div
                      class="output-item"
                      style="--rarity-color: {getItemRarityColor(item.rarity)}"
                    >
                      <span class="output-icon">{getItemIcon(itemId)}</span>
                      <span class="output-amount">{amount}x</span>
                      <span class="output-name">{item.name}</span>
                      <span class="output-rarity">({item.rarity})</span>
                    </div>

                    <!-- Show item effects -->
                    {#if Object.keys(item.effects).length > 0}
                      <div class="item-effects">
                        {#each Object.entries(item.effects) as [effect, value]}
                          <div class="effect-item">
                            +{value}
                            {formatEffectName(effect)}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                {/each}
              </div>
            </div>

            <button
              class="craft-btn"
              class:disabled={!canCraftRecipe(recipe, resourcesMap)}
              on:click={() => startCrafting(recipe)}
              disabled={!canCraftRecipe(recipe, resourcesMap)}
            >
              {#if !canCraftRecipe(recipe, resourcesMap)}
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
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;
  }

  .recipe-card {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #555;
    transition: all 0.3s ease;
  }

  .recipe-card.affordable {
    border-left-color: #ff9800;
  }

  .recipe-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .recipe-icon {
    font-size: 1.5em;
  }

  .recipe-card h4 {
    color: #ff9800;
    margin: 0;
    font-size: 1.2em;
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
