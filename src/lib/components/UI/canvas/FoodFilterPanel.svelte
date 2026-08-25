<script lang="ts">
  import { gameState } from '$lib/stores/gameState.js';
  import type { FoodSettings, Item } from '$lib/game/core/types.js';
  import { hudSpriteIconAction } from '$lib/components/UI/canvas/hudSpriteIcon';
  import type { HudSpriteIconRef } from '$lib/components/UI/canvas/spriteSheets';
  import ItemFilterChecklist from '$lib/components/UI/canvas/ItemFilterChecklist.svelte';
  import itemsData from '$lib/game/database/items/items.jsonc';
  import {
    isEdibleFood,
    resolveAllowedFoodIds,
    getDefaultAllowedFoodIds,
    getAllFoodIds
  } from '$lib/game/services/foodRules';

  export let open = false;

  const FOOD_ITEMS = (itemsData as unknown as Item[]).filter(isEdibleFood);
  const FOOD_SETTINGS_ICON_REF: HudSpriteIconRef = { sheet: 'items', id: 127 };

  $: foodSettings = ($gameState.foodSettings ?? {}) as FoodSettings;
  $: allowedFoodSet = resolveAllowedFoodIds(foodSettings);

  function update(updates: Partial<FoodSettings>) {
    gameState.command({ type: 'setFoodSettings', payload: { updates }, save: true });
  }

  function resetToDefault() {
    update({ allowedFoodItemIds: [...getDefaultAllowedFoodIds()] });
  }
  function allowAll() {
    update({ allowedFoodItemIds: getAllFoodIds() });
  }
  function clearAll() {
    update({ allowedFoodItemIds: [] });
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="food-settings-panel"
  class:open
  on:mousedown|stopPropagation
  on:mouseup|stopPropagation
  on:wheel|stopPropagation
>
  <div class="food-settings-hdr">
    <canvas
      class="hud-sprite-icon hud-sprite-icon--inline"
      use:hudSpriteIconAction={FOOD_SETTINGS_ICON_REF}
      aria-hidden="true"
    ></canvas>
    food filter
  </div>

  <div class="food-settings-block">
    <div class="food-settings-label">pawns may eat</div>
    <ItemFilterChecklist
      items={FOOD_ITEMS}
      allowed={allowedFoodSet}
      onChange={(ids) => update({ allowedFoodItemIds: ids })}
    />
    <div class="food-mini-btn-row">
      <button class="food-mini-btn" on:click={resetToDefault}>defaults</button>
      <button class="food-mini-btn" on:click={allowAll}>allow all</button>
      <button class="food-mini-btn" on:click={clearAll}>uncheck all</button>
    </div>
  </div>
</div>

<style>
  .hud-sprite-icon {
    width: 12px;
    height: 18px;
    image-rendering: pixelated;
    display: block;
    flex: 0 0 auto;
  }
  .hud-sprite-icon--inline {
    margin-right: 4px;
  }
  .food-settings-panel {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    width: 100%;
    max-width: 340px;
    opacity: 0;
    transform: translateY(6px);
    overflow: hidden;
    max-height: 0;
    pointer-events: none;
    background: rgba(13, 9, 3, 0.98);
    border: 1px solid #7a5e28;
    color: #d4a860;
    font-size: 10px;
    z-index: 20;
    filter: url(#ambient-tint);
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      max-height 200ms ease;
  }
  .food-settings-panel.open {
    opacity: 1;
    transform: translateY(0);
    max-height: 500px;
    pointer-events: all;
    padding: 5px 7px;
  }
  .food-settings-hdr {
    display: flex;
    align-items: center;
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 4px;
  }
  .food-settings-block {
    margin-top: 5px;
    border-top: 1px solid rgba(122, 94, 40, 0.6);
    padding-top: 4px;
  }
  .food-settings-label {
    color: #c8a048;
    margin-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .food-mini-btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .food-mini-btn {
    margin-top: 3px;
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 5px;
    cursor: pointer;
  }
  .food-mini-btn:hover {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
</style>
