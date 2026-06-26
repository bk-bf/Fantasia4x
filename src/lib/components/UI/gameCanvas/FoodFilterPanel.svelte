<!--
  FoodFilterPanel — colony-wide "what may pawns eat" filter, surfaced via the FOOD button on the pawn
  info card (mirrors BuildingFuelPanel's fuel-item checklist). Self-contained: edits gs.foodSettings
  through the setFoodSettings command. The parent (GameCanvas) owns the open/close toggle (`open`) and
  the FOOD button that flips it. Unlike fuel (per-building), the food policy is ONE colony-wide list.
-->
<script lang="ts">
  import { gameState } from '$lib/stores/gameState.js';
  import type { FoodSettings, Item } from '$lib/game/core/types.js';
  import { hudSpriteIconAction } from '$lib/components/UI/gameCanvas/hudSpriteIcon';
  import type { HudSpriteIconRef } from '$lib/components/UI/gameCanvas/spriteSheets';
  import itemsData from '$lib/game/database/items.jsonc';
  import {
    isEdibleFood,
    resolveAllowedFoodIds,
    getDefaultAllowedFoodIds,
    getAllFoodIds
  } from '$lib/game/services/foodRules';

  export let open = false;

  // Every edible item (incl. raw carcasses + rotten food, which sit unchecked by default), sorted by
  // name so the long list reads alphabetically.
  const FOOD_ITEMS = (itemsData as unknown as Item[])
    .filter(isEdibleFood)
    .sort((a, b) => a.name.localeCompare(b.name));
  const FOOD_SETTINGS_ICON_REF: HudSpriteIconRef = { sheet: 'items', id: 127 }; // berries glyph

  $: foodSettings = ($gameState.foodSettings ?? {}) as FoodSettings;
  // Effective eat-list: an untouched policy falls back to the default (no rotten/carcasses); an explicit
  // list — even empty — is honoured. Same resolution selectFoodForMeal uses, so the ticks match reality.
  $: allowedFoodSet = resolveAllowedFoodIds(foodSettings);

  function update(updates: Partial<FoodSettings>) {
    gameState.command({ type: 'setFoodSettings', payload: { updates }, save: true });
  }

  // Every food-filter action writes an EXPLICIT id list (resolved set with one item flipped), so the
  // colony is from then on under manual control — no "unset = default" sentinel to fight.
  function toggleFood(itemId: string) {
    const set = new Set(allowedFoodSet);
    if (set.has(itemId)) set.delete(itemId);
    else set.add(itemId);
    update({ allowedFoodItemIds: Array.from(set) });
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
    <div class="food-checklist">
      {#each FOOD_ITEMS as item}
        <label class="food-settings-row food-settings-row--compact">
          <input
            type="checkbox"
            checked={allowedFoodSet.has(item.id)}
            on:change={() => toggleFood(item.id)}
          />
          <span>{item.name}</span>
        </label>
      {/each}
    </div>
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
    max-width: 300px;
    opacity: 0;
    transform: translateY(6px);
    overflow: hidden;
    max-height: 0;
    pointer-events: none;
    background: rgba(13, 9, 3, 0.98);
    border: 1px solid #7a5e28;
    color: #d4a860;
    font-size: 9px;
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
  .food-settings-row {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 2px;
  }
  .food-settings-row input[type='checkbox'] {
    appearance: none;
    width: 11px;
    height: 11px;
    border: 1px solid #8e6a2a;
    background: #140e04;
    box-shadow: inset 0 0 0 1px rgba(12, 8, 2, 0.7);
    cursor: pointer;
    position: relative;
    margin: 0;
  }
  .food-settings-row input[type='checkbox']:hover {
    border-color: #c88a30;
    background: #1a1206;
  }
  .food-settings-row input[type='checkbox']:checked {
    background: #2a1a08;
    border-color: #e0a848;
  }
  .food-settings-row input[type='checkbox']:checked::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 0px;
    width: 4px;
    height: 7px;
    border: solid #f0c060;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .food-settings-row--compact {
    margin-top: 1px;
  }
  .food-checklist {
    max-height: 168px;
    overflow-y: auto;
    padding-right: 2px;
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
    font-size: 9px;
    padding: 1px 5px;
    cursor: pointer;
  }
  .food-mini-btn:hover {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
</style>
