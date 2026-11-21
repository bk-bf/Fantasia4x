<script lang="ts">
  import { gameState } from '$lib/stores/gameState.js';
  import type { FuelSettings, PlacedBuilding, Pawn, Item } from '$lib/game/core/types.js';
  import ItemFilterChecklist from '$lib/components/UI/canvas/ItemFilterChecklist.svelte';
  import itemsData from '$lib/game/database/items/items.json';
  import { itemService } from '$lib/game/services/ItemService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import CheckBox from '$lib/components/UI/widget/CheckBox.svelte';
  import {
    getRefuelRequirements,
    planRefuel,
    resolveAllowedFuelIds,
    getDefaultAllowedFuelIds
  } from '$lib/game/services/fuelRules';

  export let building: PlacedBuilding;
  export let pawns: Pawn[];

  const FUEL_ITEMS = (itemsData as unknown as Item[]).filter((item) => (item.fuelValue ?? 0) > 0);

  $: selectedFuelSettings = (building.fuelSettings ?? {}) as FuelSettings;
  $: selectedFuelThresholdPct = Math.max(
    0,
    Math.min(100, selectedFuelSettings.refuelThresholdPct ?? 30)
  );
  $: allowedFuelSet = resolveAllowedFuelIds(selectedFuelSettings);
  $: selectedRefuelPawnFilters = selectedFuelSettings.allowedRefuelPawnIds ?? [];

  $: refuelReq = getRefuelRequirements(building.type);
  $: tinderName = itemService.getItemById(refuelReq.tinderItemId)?.name ?? refuelReq.tinderItemId;
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

  function allowAllFuels() {
    updateSelectedBuildingFuelSettings({ allowedFuelItemIds: FUEL_ITEMS.map((item) => item.id) });
  }

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

  function onRefuelThresholdInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    if (!input) return;
    setRefuelThresholdPct(Number(input.value));
  }
</script>

<div class="fuel">
  <h5>Lights with</h5>
  <div class="kv">
    <span
      >{refuelReq.tinderAmount}× {tinderName}
      <span class="pill" title="Tinder is always consumed to light the fire.">tinder · always</span
      ></span
    >
    <em>{tinderStock} in store</em>
  </div>
  {#if cannotRefuel}
    <p class="warn">
      Cannot refuel now{tinderStock < refuelReq.tinderAmount
        ? ` — needs ${refuelReq.tinderAmount}× ${tinderName}, ${tinderStock} in store`
        : ' — no fuel in store'}
    </p>
  {/if}
  <CheckBox
    checked={selectedFuelSettings.paused ?? false}
    onchange={() => setRefuelPaused(!(selectedFuelSettings.paused ?? false))}
    >Let it burn out</CheckBox
  >

  <h5>Refuel below</h5>
  <div class="slider">
    <input
      type="range"
      min="0"
      max="100"
      step="5"
      value={selectedFuelThresholdPct}
      style:--fill="{selectedFuelThresholdPct}%"
      on:input={onRefuelThresholdInput}
    />
    <input
      class="num"
      type="number"
      min="0"
      max="100"
      value={selectedFuelThresholdPct}
      on:change={onRefuelThresholdInput}
    />
    <b>%</b>
  </div>

  <h5>Burns</h5>
  <ItemFilterChecklist
    items={fuelFilterItems}
    allowed={allowedFuelSet}
    onChange={(ids) => updateSelectedBuildingFuelSettings({ allowedFuelItemIds: ids })}
    listMaxHeight="150px"
  />
  <div class="minis">
    <ChromeButton onclick={resetFuelToDefault}>Defaults</ChromeButton>
    <ChromeButton onclick={allowAllFuels}>All</ChromeButton>
    <ChromeButton onclick={clearFuelItemFilters}>None</ChromeButton>
  </div>

  <h5>Tended by</h5>
  <div class="who">
    {#each pawns as pawn (pawn.id)}
      <CheckBox
        checked={selectedRefuelPawnFilters.length === 0 ||
          selectedRefuelPawnFilters.includes(pawn.id)}
        onchange={() => toggleRefuelPawnFilter(pawn.id)}>{pawn.name}</CheckBox
      >
    {/each}
  </div>
  <div class="minis">
    <ChromeButton onclick={clearRefuelPawnFilters}>Everyone</ChromeButton>
  </div>
</div>

<style>
  .fuel {
    font: 16px/18px var(--font-pixel);
    color: var(--text);
  }
  h5 {
    margin: 6px 0 1px;
    font: inherit;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  h5:first-child {
    margin-top: 0;
  }
  .kv {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .kv em {
    font-style: normal;
    color: var(--text-dim);
  }
  .pill {
    padding: 0 5px;
    box-shadow: inset 0 0 0 1px var(--text-muted);
    cursor: help;
  }
  .warn {
    margin: 2px 0;
    color: var(--ember);
  }
  .slider {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 20px;
  }
  input[type='range'] {
    flex: 1;
    height: 8px;
    margin: 0;
    appearance: none;
    background: linear-gradient(to right, var(--accent-hi) var(--fill), var(--bg) var(--fill));
    box-shadow: inset 0 0 0 1px var(--border-hi);
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 9px;
    height: 18px;
    background: var(--bg-active);
    box-shadow: inset 0 0 0 1px var(--border-hi);
  }
  input[type='range']::-moz-range-thumb {
    width: 9px;
    height: 18px;
    border: 0;
    border-radius: 0;
    background: var(--bg-active);
    box-shadow: inset 0 0 0 1px var(--border-hi);
  }
  .num {
    width: 40px;
    padding: 0 2px;
    border: 0;
    background: var(--bg);
    box-shadow: inset 0 0 0 1px var(--border);
    color: var(--text);
    font: inherit;
    appearance: textfield;
  }
  .slider b {
    font-weight: normal;
  }
  .who {
    max-height: 120px;
    overflow-y: auto;
  }
  .minis {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }
  .minis :global(.cbtn) {
    flex: 1;
  }
</style>
