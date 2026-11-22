<script lang="ts">
  import { gameState } from '$lib/stores/gameState.js';
  import type { FoodSettings, Item } from '$lib/game/core/types.js';
  import ItemFilterChecklist from '$lib/components/UI/canvas/ItemFilterChecklist.svelte';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import itemsData from '$lib/game/database/items/items.json';
  import {
    isEdibleFood,
    resolveAllowedFoodIds,
    getDefaultAllowedFoodIds,
    getAllFoodIds
  } from '$lib/game/services/foodRules';

  const FOOD_ITEMS = (itemsData as unknown as Item[]).filter(isEdibleFood);

  const allowed = $derived(resolveAllowedFoodIds(($gameState.foodSettings ?? {}) as FoodSettings));

  function update(updates: Partial<FoodSettings>) {
    gameState.command({ type: 'setFoodSettings', payload: { updates }, save: true });
  }
</script>

<div class="food">
  <h5>Everyone may eat</h5>
  <ItemFilterChecklist
    items={FOOD_ITEMS}
    {allowed}
    onChange={(ids) => update({ allowedFoodItemIds: ids })}
    stock={$gameState.stockpile ?? {}}
    icons
    fill
  />
  <div class="minis">
    <ChromeButton onclick={() => update({ allowedFoodItemIds: [...getDefaultAllowedFoodIds()] })}
      >Defaults</ChromeButton
    >
    <ChromeButton onclick={() => update({ allowedFoodItemIds: getAllFoodIds() })}>All</ChromeButton>
    <ChromeButton onclick={() => update({ allowedFoodItemIds: [] })}>None</ChromeButton>
  </div>
</div>

<style>
  .food {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    font: 16px/18px var(--font-pixel);
    color: var(--text);
  }
  h5 {
    flex: none;
    margin: 0 0 1px;
    font: inherit;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  .minis {
    flex: none;
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }
  .minis :global(.cbtn) {
    flex: 1;
  }
</style>
