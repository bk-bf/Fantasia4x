<script lang="ts">
  import { gameState } from '$lib/stores/gameState.js';
  import type { FoodSettings, Item } from '$lib/game/core/types.js';
  import StoreFilter from './StoreFilter.svelte';
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

<StoreFilter
  heading="Everyone may eat"
  items={FOOD_ITEMS}
  {allowed}
  onChange={(ids) => update({ allowedFoodItemIds: ids })}
  stock={$gameState.stockpile ?? {}}
  ondefaults={() => update({ allowedFoodItemIds: [...getDefaultAllowedFoodIds()] })}
  onall={() => update({ allowedFoodItemIds: getAllFoodIds() })}
  onnone={() => update({ allowedFoodItemIds: [] })}
/>
