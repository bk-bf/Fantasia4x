<!-- Per-building refuel settings pop-up; parent owns the open/close toggle. -->
<script lang="ts">
  import { gameState } from '$lib/stores/gameState.js';
  import type { FuelSettings, PlacedBuilding, Pawn, Item } from '$lib/game/core/types.js';
  import { hudSpriteIconAction } from '$lib/components/UI/gameCanvas/hudSpriteIcon';
  import type { HudSpriteIconRef } from '$lib/components/UI/gameCanvas/spriteSheets';
  import ItemFilterChecklist from '$lib/components/UI/gameCanvas/ItemFilterChecklist.svelte';
  import itemsData from '$lib/game/database/items/items.jsonc';
  import { itemService } from '$lib/game/services/ItemService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import {
    getRefuelRequirements,
    planRefuel,
    resolveAllowedFuelIds,
    getDefaultAllowedFuelIds
  } from '$lib/game/services/fuelRules';

  export let building: PlacedBuilding;
  export let pawns: Pawn[];
  export let open = false;

  const FUEL_ITEMS = (itemsData as unknown as Item[]).filter((item) => (item.fuelValue ?? 0) > 0);
  const FUEL_SETTINGS_ICON_REF: HudSpriteIconRef = { sheet: 'tiles', id: 11 };

  $: selectedFuelSettings = (building.fuelSettings ?? {}) as FuelSettings;
  $: selectedFuelThresholdPct = Math.max(
    0,
    Math.min(100, selectedFuelSettings.refuelThresholdPct ?? 30)
  );
  // Untouched building falls back to the default burn-list; an explicit list — even empty — is honoured.
  $: allowedFuelSet = resolveAllowedFuelIds(selectedFuelSettings);
  $: selectedRefuelPawnFilters = selectedFuelSettings.allowedRefuelPawnIds ?? [];

  $: refuelReq = getRefuelRequirements(building.type);
  $: tinderName = itemService.getItemById(refuelReq.tinderItemId)?.name ?? refuelReq.tinderItemId;
  // Tinder lights the fire, never burns as bulk fuel — so it's hidden from the filter, not toggleable.
  $: fuelFilterItems = FUEL_ITEMS.filter((item) => item.id !== refuelReq.tinderItemId);
  $: tinderStock = ($gameState.stockpile ?? {})[refuelReq.tinderItemId] ?? 0;
  $: maxFuel = buildingService.getBuildingById(building.type)?.maxFuel ?? 60;
  $: wantsFuel = (building.fuel ?? 0) / Math.max(maxFuel, 1) < selectedFuelThresholdPct / 100;
  $: cannotRefuel = wantsFuel && planRefuel($gameState, building) === null;

  function updateSelectedBuildingFuelSettings(updates: Partial<FuelSettings>) {
    gameState.command({
      type: 'setBuildingFuelSettings',
      payload: { id: building.id, updates },
      save: true
    });
  }

  function setRefuelThresholdPct(nextPct: number) {
    updateSelectedBuildingFuelSettings({ refuelThresholdPct: Math.max(0, Math.min(100, nextPct)) });
  }

  // Every fuel-filter action writes an EXPLICIT id list — no "empty = all" sentinel.

  function allowAllFuels() {
    updateSelectedBuildingFuelSettings({ allowedFuelItemIds: FUEL_ITEMS.map((item) => item.id) });
  }

  // Prefer the building's own default burn-list; fall back to the global default set.
  function resetFuelToDefault() {
    const def = buildingService.getBuildingById(building.type);
    const ids = def?.defaultAllowedFuelItemIds?.length
      ? [...def.defaultAllowedFuelItemIds]
      : [...getDefaultAllowedFuelIds()];
    updateSelectedBuildingFuelSettings({ allowedFuelItemIds: ids });
  }

  function clearFuelItemFilters() {
    updateSelectedBuildingFuelSettings({ allowedFuelItemIds: [] });
  }

  function toggleRefuelPawnFilter(pawnId: string) {
    if (selectedRefuelPawnFilters.length === 0) {
      const allExceptClicked = pawns.map((pawn) => pawn.id).filter((id) => id !== pawnId);
      updateSelectedBuildingFuelSettings({ allowedRefuelPawnIds: allExceptClicked });
      return;
    }

    const set = new Set(selectedRefuelPawnFilters);
    if (set.has(pawnId)) set.delete(pawnId);
    else set.add(pawnId);

    if (set.size >= pawns.length) {
      updateSelectedBuildingFuelSettings({ allowedRefuelPawnIds: [] });
      return;
    }

    updateSelectedBuildingFuelSettings({ allowedRefuelPawnIds: Array.from(set) });
  }

  function clearRefuelPawnFilters() {
    updateSelectedBuildingFuelSettings({ allowedRefuelPawnIds: [] });
  }

  function setRefuelPaused(paused: boolean) {
    updateSelectedBuildingFuelSettings({ paused });
  }

  function onRefuelPausedChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    setRefuelPaused(Boolean(input?.checked));
  }

  function onRefuelThresholdInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    if (!input) return;
    setRefuelThresholdPct(Number(input.value));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fuel-settings-panel"
  class:open
  on:mousedown|stopPropagation
  on:mouseup|stopPropagation
  on:wheel|stopPropagation
>
  <div class="fuel-settings-hdr">
    <canvas
      class="hud-sprite-icon hud-sprite-icon--inline"
      use:hudSpriteIconAction={FUEL_SETTINGS_ICON_REF}
      aria-hidden="true"
    ></canvas>
    fuel settings
  </div>

  <div class="fuel-settings-block">
    <div class="fuel-settings-label">refuel needs</div>
    <div class="fuel-req">
      <span>{refuelReq.tinderAmount}× {tinderName}</span>
      <span class="fuel-pill" title="Tinder is always consumed to light the fire — it can't be turned off."
        >tinder · always</span
      >
      <span class="fuel-req-dim">+ any fuel</span>
    </div>
    {#if cannotRefuel}
      <div class="fuel-warn">
        ⚠ can't refuel now{tinderStock < refuelReq.tinderAmount
          ? ` — need ${refuelReq.tinderAmount}× ${tinderName} (have ${tinderStock})`
          : ' — no fuel in stock'}
      </div>
    {/if}
  </div>
  <label class="fuel-settings-row">
    <input
      type="checkbox"
      checked={selectedFuelSettings.paused ?? false}
      on:change={onRefuelPausedChange}
    />
    <span>pause refueling</span>
  </label>

  <div class="fuel-settings-block">
    <div class="fuel-settings-label">refuel threshold</div>
    <div class="fuel-settings-threshold">
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={selectedFuelThresholdPct}
        on:input={onRefuelThresholdInput}
      />
      <input
        class="fuel-threshold-num"
        type="number"
        min="0"
        max="100"
        value={selectedFuelThresholdPct}
        on:change={onRefuelThresholdInput}
      />
      <span>%</span>
    </div>
  </div>

  <div class="fuel-settings-block">
    <div class="fuel-settings-label">fuel filters</div>
    <ItemFilterChecklist
      items={fuelFilterItems}
      allowed={allowedFuelSet}
      onChange={(ids) => updateSelectedBuildingFuelSettings({ allowedFuelItemIds: ids })}
      listMaxHeight="120px"
    />
    <div class="fuel-mini-btn-row">
      <button class="fuel-mini-btn" on:click={resetFuelToDefault}>defaults</button>
      <button class="fuel-mini-btn" on:click={allowAllFuels}>allow all</button>
      <button class="fuel-mini-btn" on:click={clearFuelItemFilters}>uncheck all</button>
    </div>
  </div>

  <div class="fuel-settings-block">
    <div class="fuel-settings-label">allowed colonists</div>
    <div class="fuel-checklist">
      {#each pawns as pawn}
        <label class="fuel-settings-row fuel-settings-row--compact">
          <input
            type="checkbox"
            checked={selectedRefuelPawnFilters.length === 0 ||
              selectedRefuelPawnFilters.includes(pawn.id)}
            on:change={() => toggleRefuelPawnFilter(pawn.id)}
          />
          <span>{pawn.name}</span>
        </label>
      {/each}
    </div>
    <button class="fuel-mini-btn" on:click={clearRefuelPawnFilters}>allow all colonists</button>
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
  .fuel-settings-panel {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    /* width matches the info card's 300px cap */
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
    /* Day/night hue + weather desaturation, matching the other chrome panels. */
    filter: url(#ambient-tint);
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      max-height 200ms ease;
  }
  .fuel-settings-panel.open {
    opacity: 1;
    transform: translateY(0);
    max-height: 500px;
    pointer-events: all;
    padding: 5px 7px;
  }
  .fuel-settings-hdr {
    display: flex;
    align-items: center;
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 4px;
  }
  .fuel-settings-block {
    margin-top: 5px;
    border-top: 1px solid rgba(122, 94, 40, 0.6);
    padding-top: 4px;
  }
  .fuel-settings-label {
    color: #c8a048;
    margin-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .fuel-req {
    color: #d4a860;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  .fuel-req-dim {
    color: #a07c38;
  }
  .fuel-pill {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #f0c878;
    background: #2a1c08;
    border: 1px solid #8e6a2a;
    padding: 0 4px;
    cursor: help;
  }
  .fuel-warn {
    color: #e3833f;
    margin-top: 2px;
  }
  .fuel-settings-row {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 2px;
  }
  .fuel-settings-row input[type='checkbox'] {
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
  .fuel-settings-row input[type='checkbox']:hover {
    border-color: #c88a30;
    background: #1a1206;
  }
  .fuel-settings-row input[type='checkbox']:checked {
    background: #2a1a08;
    border-color: #e0a848;
  }
  .fuel-settings-row input[type='checkbox']:checked::after {
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
  .fuel-settings-row--compact {
    margin-top: 1px;
  }
  .fuel-settings-threshold {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .fuel-settings-threshold input[type='range'] {
    width: 112px;
    accent-color: #c87020;
    height: 12px;
    background: transparent;
  }
  .fuel-settings-threshold input[type='range']::-webkit-slider-runnable-track {
    height: 8px;
    border: 1px solid #7a5a22;
    background: #140e04;
  }
  .fuel-settings-threshold input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px;
    height: 12px;
    margin-top: -3px;
    border: 1px solid #e0a048;
    background: #c87020;
  }
  .fuel-settings-threshold input[type='range']::-moz-range-track {
    height: 8px;
    border: 1px solid #7a5a22;
    background: #140e04;
  }
  .fuel-settings-threshold input[type='range']::-moz-range-thumb {
    width: 10px;
    height: 12px;
    border: 1px solid #e0a048;
    border-radius: 0;
    background: #c87020;
  }
  .fuel-threshold-num {
    width: 40px;
    background: #140e04;
    border: 1px solid #6a4e20;
    color: #e0b868;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 2px;
    appearance: textfield;
  }
  .fuel-threshold-num:focus {
    outline: none;
    border-color: #c88a30;
    background: #1c1407;
    color: #f0c878;
  }
  .fuel-checklist {
    max-height: 70px;
    overflow-y: auto;
    padding-right: 2px;
  }
  .fuel-mini-btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .fuel-mini-btn {
    margin-top: 3px;
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 5px;
    cursor: pointer;
  }
  .fuel-mini-btn:hover {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
</style>
