<script lang="ts">
  import { gameState } from '$lib/stores/gameState.js';
  import type { RepairSettings, PlacedBuilding, Pawn, Item } from '$lib/game/core/types.js';
  import ItemFilterChecklist from './ItemFilterChecklist.svelte';
  import { itemService } from '$lib/game/services/ItemService';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import CheckBox from '../widget/CheckBox.svelte';
  import KvRow from '../widget/KvRow.svelte';
  import MeterRow from '../widget/MeterRow.svelte';
  import Slider from '../widget/Slider.svelte';
  import Pane from '../widget/Pane.svelte';
  import {
    getDefaultAllowedRepairIds,
    resolveAllowedRepairIds,
    repairUnitsNeeded,
    planRepair
  } from '$lib/game/services/repairRules';

  let { building, pawns }: { building: PlacedBuilding; pawns: Pawn[] } = $props();

  const settings = $derived((building.repairSettings ?? {}) as RepairSettings);
  const threshold = $derived(Math.max(0, Math.min(100, settings.repairThresholdPct ?? 30)));
  const menders = $derived(settings.allowedRepairPawnIds ?? []);
  const materials = $derived(
    getDefaultAllowedRepairIds(building.type)
      .map((id) => itemService.getItemById(id))
      .filter((it): it is Item => !!it)
  );
  const condition = $derived(Math.round(building.condition ?? 100));
  const units = $derived(repairUnitsNeeded(building));
  const stalled = $derived(
    condition < threshold && units > 0 && planRepair($gameState, building) === null
  );

  function update(updates: Partial<RepairSettings>) {
    gameState.command({
      type: 'setBuildingRepairSettings',
      payload: { id: building.id, updates },
      save: true
    });
  }

  function toggleMender(pawnId: string) {
    const set = new Set(menders.length === 0 ? pawns.map((p) => p.id) : menders);
    if (set.has(pawnId)) set.delete(pawnId);
    else set.add(pawnId);
    update({ allowedRepairPawnIds: set.size >= pawns.length ? [] : [...set] });
  }
</script>

<Pane>
  <MeterRow label="Sound" value={condition / 100} ramp="leaf">{condition}%</MeterRow>
  <p class="sub">weather wears it; at nothing it falls</p>
  <KvRow label="Needs">{units > 0 ? `${units} of the stuff below` : 'nothing yet'}</KvRow>
  {#if stalled}<p class="warn">None of the stuff below is in store.</p>{/if}
  <CheckBox checked={settings.paused ?? false} onchange={() => update({ paused: !settings.paused })}
    >Leave it to wear</CheckBox
  >

  <h5>Repair below</h5>
  <div class="row">
    <Slider
      value={threshold}
      step={5}
      label="Repair below"
      oninput={(v) => update({ repairThresholdPct: v })}>{threshold}%</Slider
    >
    <ChromeButton
      title="Set every building to mend at this mark"
      onclick={() =>
        gameState.command({
          type: 'setAllBuildingsRepairThreshold',
          payload: { pct: threshold },
          save: true
        })}>All</ChromeButton
    >
  </div>

  <h5>Mend with</h5>
  <ItemFilterChecklist
    items={materials}
    allowed={resolveAllowedRepairIds(building)}
    onChange={(ids) => update({ allowedMaterialItemIds: ids })}
    stock={$gameState.stockpile ?? {}}
    listMaxHeight="120px"
    icons
  />
  <div class="minis">
    <ChromeButton
      onclick={() => update({ allowedMaterialItemIds: getDefaultAllowedRepairIds(building.type) })}
      >Defaults</ChromeButton
    >
    <ChromeButton onclick={() => update({ allowedMaterialItemIds: [] })}>None</ChromeButton>
  </div>

  <h5>Mended by</h5>
  <div class="who">
    {#each pawns as pawn (pawn.id)}
      <CheckBox
        checked={menders.length === 0 || menders.includes(pawn.id)}
        onchange={() => toggleMender(pawn.id)}>{pawn.name}</CheckBox
      >
    {/each}
  </div>
  <div class="minis">
    <ChromeButton onclick={() => update({ allowedRepairPawnIds: [] })}>Everyone</ChromeButton>
  </div>
</Pane>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row :global(.slider) {
    flex: 1;
  }
  .who {
    max-height: 120px;
    overflow-y: auto;
  }
</style>
