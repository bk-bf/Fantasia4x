<!-- Per-building repair settings pop-up; parent owns the open/close toggle. -->
<script lang="ts">
  import { gameState } from '$lib/stores/gameState.js';
  import type { RepairSettings, PlacedBuilding, Pawn, Item } from '$lib/game/core/types.js';
  import { hudSpriteIconAction } from '$lib/components/UI/gameCanvas/hudSpriteIcon';
  import type { HudSpriteIconRef } from '$lib/components/UI/gameCanvas/spriteSheets';
  import ItemFilterChecklist from '$lib/components/UI/gameCanvas/ItemFilterChecklist.svelte';
  import { itemService } from '$lib/game/services/ItemService';
  import {
    getDefaultAllowedRepairIds,
    resolveAllowedRepairIds,
    repairUnitsNeeded,
    planRepair
  } from '$lib/game/services/repairRules';

  export let building: PlacedBuilding;
  export let pawns: Pawn[];
  export let open = false;

  const REPAIR_SETTINGS_ICON_REF: HudSpriteIconRef = { sheet: 'tiles', id: 11 };

  $: repairSettings = (building.repairSettings ?? {}) as RepairSettings;
  $: repairThresholdPct = Math.max(0, Math.min(100, repairSettings.repairThresholdPct ?? 30));
  // Untouched building falls back to its default repair set; an explicit list — even empty — is honoured.
  $: allowedMaterialSet = resolveAllowedRepairIds(building);
  $: selectedRepairPawnFilters = repairSettings.allowedRepairPawnIds ?? [];

  $: materialItems = getDefaultAllowedRepairIds(building.type)
    .map((id) => itemService.getItemById(id))
    .filter((it): it is Item => !!it);
  $: condition = Math.round(building.condition ?? 100);
  $: unitsNeeded = repairUnitsNeeded(building);
  $: cannotRepair =
    condition < repairThresholdPct && unitsNeeded > 0 && planRepair($gameState, building) === null;

  function updateSelectedBuildingRepairSettings(updates: Partial<RepairSettings>) {
    gameState.command({
      type: 'setBuildingRepairSettings',
      payload: { id: building.id, updates },
      save: true
    });
  }

  function setRepairThresholdPct(nextPct: number) {
    updateSelectedBuildingRepairSettings({
      repairThresholdPct: Math.max(0, Math.min(100, nextPct))
    });
  }

  function applyThresholdToAll() {
    gameState.command({
      type: 'setAllBuildingsRepairThreshold',
      payload: { pct: repairThresholdPct },
      save: true
    });
  }

  function resetMaterialsToDefault() {
    updateSelectedBuildingRepairSettings({
      allowedMaterialItemIds: getDefaultAllowedRepairIds(building.type)
    });
  }

  function clearMaterialFilters() {
    updateSelectedBuildingRepairSettings({ allowedMaterialItemIds: [] });
  }

  function toggleRepairPawnFilter(pawnId: string) {
    if (selectedRepairPawnFilters.length === 0) {
      const allExceptClicked = pawns.map((pawn) => pawn.id).filter((id) => id !== pawnId);
      updateSelectedBuildingRepairSettings({ allowedRepairPawnIds: allExceptClicked });
      return;
    }

    const set = new Set(selectedRepairPawnFilters);
    if (set.has(pawnId)) set.delete(pawnId);
    else set.add(pawnId);

    if (set.size >= pawns.length) {
      updateSelectedBuildingRepairSettings({ allowedRepairPawnIds: [] });
      return;
    }

    updateSelectedBuildingRepairSettings({ allowedRepairPawnIds: Array.from(set) });
  }

  function clearRepairPawnFilters() {
    updateSelectedBuildingRepairSettings({ allowedRepairPawnIds: [] });
  }

  function onRepairPausedChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    updateSelectedBuildingRepairSettings({ paused: Boolean(input?.checked) });
  }

  function onRepairThresholdInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    if (!input) return;
    setRepairThresholdPct(Number(input.value));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="repair-settings-panel"
  class:open
  on:mousedown|stopPropagation
  on:mouseup|stopPropagation
  on:wheel|stopPropagation
>
  <div class="repair-settings-hdr">
    <canvas
      class="hud-sprite-icon hud-sprite-icon--inline"
      use:hudSpriteIconAction={REPAIR_SETTINGS_ICON_REF}
      aria-hidden="true"
    ></canvas>
    repair settings
  </div>

  <div class="repair-settings-block">
    <div class="repair-settings-label">repair needs</div>
    <div class="repair-req">
      <span>{unitsNeeded}× material</span>
      <span class="repair-req-dim">— proportional to wear, from any allowed material</span>
    </div>
    {#if cannotRepair}
      <div class="repair-warn">⚠ can't repair now — no allowed material in stock</div>
    {/if}
  </div>

  <label class="repair-settings-row">
    <input
      type="checkbox"
      checked={repairSettings.paused ?? false}
      on:change={onRepairPausedChange}
    />
    <span>pause repairs</span>
  </label>

  <div class="repair-settings-block">
    <div class="repair-settings-label">repair below</div>
    <div class="repair-settings-threshold">
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={repairThresholdPct}
        on:input={onRepairThresholdInput}
      />
      <input
        class="repair-threshold-num"
        type="number"
        min="0"
        max="100"
        value={repairThresholdPct}
        on:change={onRepairThresholdInput}
      />
      <span>% condition</span>
      <button
        type="button"
        class="repair-icon-btn"
        title="Apply this threshold to all buildings"
        on:click={applyThresholdToAll}>⇊</button
      >
    </div>
  </div>

  <div class="repair-settings-block">
    <div class="repair-settings-label">allowed materials</div>
    <ItemFilterChecklist
      items={materialItems}
      allowed={allowedMaterialSet}
      onChange={(ids) => updateSelectedBuildingRepairSettings({ allowedMaterialItemIds: ids })}
      listMaxHeight="100px"
    />
    <div class="repair-mini-btn-row">
      <button class="repair-mini-btn" on:click={resetMaterialsToDefault}>defaults</button>
      <button class="repair-mini-btn" on:click={clearMaterialFilters}>uncheck all</button>
    </div>
  </div>

  <div class="repair-settings-block">
    <div class="repair-settings-label">allowed colonists</div>
    <div class="repair-checklist">
      {#each pawns as pawn}
        <label class="repair-settings-row repair-settings-row--compact">
          <input
            type="checkbox"
            checked={selectedRepairPawnFilters.length === 0 ||
              selectedRepairPawnFilters.includes(pawn.id)}
            on:change={() => toggleRepairPawnFilter(pawn.id)}
          />
          <span>{pawn.name}</span>
        </label>
      {/each}
    </div>
    <button class="repair-mini-btn" on:click={clearRepairPawnFilters}>allow all colonists</button>
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
  .repair-settings-panel {
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
  .repair-settings-panel.open {
    opacity: 1;
    transform: translateY(0);
    max-height: 500px;
    pointer-events: all;
    padding: 5px 7px;
  }
  .repair-settings-hdr {
    display: flex;
    align-items: center;
    color: #f0c060;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 4px;
  }
  .repair-settings-block {
    margin-top: 5px;
    border-top: 1px solid rgba(122, 94, 40, 0.6);
    padding-top: 4px;
  }
  .repair-settings-label {
    color: #c8a048;
    margin-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .repair-req {
    color: #d4a860;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  .repair-req-dim {
    color: #a07c38;
  }
  .repair-warn {
    color: #e3833f;
    margin-top: 2px;
  }
  .repair-settings-row {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 2px;
  }
  .repair-settings-row input[type='checkbox'] {
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
  .repair-settings-row input[type='checkbox']:hover {
    border-color: #c88a30;
    background: #1a1206;
  }
  .repair-settings-row input[type='checkbox']:checked {
    background: #2a1a08;
    border-color: #e0a848;
  }
  .repair-settings-row input[type='checkbox']:checked::after {
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
  .repair-settings-row--compact {
    margin-top: 1px;
  }
  .repair-settings-threshold {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .repair-settings-threshold input[type='range'] {
    width: 112px;
    accent-color: #c87020;
    height: 12px;
    background: transparent;
  }
  .repair-settings-threshold input[type='range']::-webkit-slider-runnable-track {
    height: 8px;
    border: 1px solid #7a5a22;
    background: #140e04;
  }
  .repair-settings-threshold input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px;
    height: 12px;
    margin-top: -3px;
    border: 1px solid #e0a048;
    background: #c87020;
  }
  .repair-settings-threshold input[type='range']::-moz-range-track {
    height: 8px;
    border: 1px solid #7a5a22;
    background: #140e04;
  }
  .repair-settings-threshold input[type='range']::-moz-range-thumb {
    width: 10px;
    height: 12px;
    border: 1px solid #e0a048;
    border-radius: 0;
    background: #c87020;
  }
  .repair-threshold-num {
    width: 40px;
    background: #140e04;
    border: 1px solid #6a4e20;
    color: #e0b868;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 2px;
    appearance: textfield;
  }
  .repair-threshold-num:focus {
    outline: none;
    border-color: #c88a30;
    background: #1c1407;
    color: #f0c878;
  }
  .repair-icon-btn {
    flex: 0 0 auto;
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1;
    padding: 1px 5px;
    cursor: pointer;
  }
  .repair-icon-btn:hover {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
  .repair-checklist {
    max-height: 70px;
    overflow-y: auto;
    padding-right: 2px;
  }
  .repair-mini-btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .repair-mini-btn {
    margin-top: 3px;
    background: #160f06;
    border: 1px solid #6b4f22;
    color: #d0a858;
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 5px;
    cursor: pointer;
  }
  .repair-mini-btn:hover {
    background: #24180a;
    border-color: #b07a28;
    color: #f0c878;
  }
</style>
