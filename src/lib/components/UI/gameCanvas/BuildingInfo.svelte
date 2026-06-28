<!--
  BuildingInfo — the colour-coded, structured building readout shared by the HOVER panel and the
  CLICKED building panel, so the two can't drift (the clicked card used to be a plain `lines[]` wall of
  text in SelectedEntityCard; now both render this). `detailed` adds the click-only sections the hover
  omits: comfort/beauty, refund, the refuel requirement, and the "won't refuel" warning. The action
  buttons + fuel/storage config fly-outs + the EnvReadout stay in the parent.
-->
<script lang="ts">
  import { buildingService } from '$lib/game/services/BuildingService';
  import { itemService } from '$lib/game/services/ItemService';
  import {
    getRefuelRequirements,
    planRefuel,
    getRefuelThresholdRatio
  } from '$lib/game/services/fuelRules';
  import { aggregateMaterialMods } from '$lib/game/core/materialProperties';
  import { jobProgressBar } from './selectionCard';
  import type { PlacedBuilding, DroppedItem, GameState } from '$lib/game/core/types';

  let {
    building,
    detailed = false,
    binContents = [],
    gameState = null
  }: {
    building: PlacedBuilding;
    /** Clicked card: show comfort/beauty, refund, refuel requirement + "won't refuel" warning. */
    detailed?: boolean;
    /** Stored drops physically in this bin (storage buildings only). */
    binContents?: DroppedItem[];
    /** Needed for the refuel-feasibility check (detailed only). */
    gameState?: GameState | null;
  } = $props();

  const bDef = $derived(buildingService.getBuildingById(building.type));
  const isBlueprint = $derived(building.status !== 'complete');
  const statusStr = $derived(
    isBlueprint
      ? building.paused
        ? 'paused'
        : 'building'
      : `complete${building.deconstructQueued ? ' ⊢ demolish' : ''}`
  );
  const isBin = $derived(((bDef?.effects?.storageStacks ?? 0) as number) > 0 && !isBlueprint);
  // §M amenity: def + chosen-material comfort/beauty (what a couch/silk build is worth nearby).
  const amenity = $derived.by(() => {
    const mm = building.materials
      ? aggregateMaterialMods(Object.values(building.materials), 'building')
      : null;
    return {
      comfort: (bDef?.effects?.comfort ?? 0) + (mm?.comfort ?? 0),
      beauty: (bDef?.effects?.beauty ?? 0) + (mm?.beauty ?? 0)
    };
  });
  // Refuel requirement + "won't refuel" flag (always tinder + N distinct fuel types).
  const refuel = $derived.by(() => {
    if (!detailed || isBlueprint || building.deconstructQueued || bDef?.maxFuel === undefined)
      return null;
    const req = getRefuelRequirements(building.type);
    const tinderName =
      itemService.getItemById(req.tinderItemId)?.name ?? req.tinderItemId.replace(/_/g, ' ');
    const needs = `needs: ${req.tinderAmount}× ${tinderName} + ${req.requiredFuelTypes} fuel types`;
    const wantsFuel = (building.fuel ?? 0) / Math.max(bDef.maxFuel, 1) < getRefuelThresholdRatio(building);
    let warn: string | null = null;
    if (gameState && wantsFuel && planRefuel(gameState, building) === null) {
      const tinderStock = (gameState.stockpile ?? {})[req.tinderItemId] ?? 0;
      warn =
        tinderStock < req.tinderAmount
          ? `⚠ won't refuel — need ${req.tinderAmount}× ${tinderName} (have ${tinderStock})`
          : `⚠ won't refuel — not enough distinct fuel in stock`;
    }
    return { needs, warn };
  });
</script>

<div class="bld-info">
  <div class="bld-header">
    <span class="bld-name">{bDef?.name ?? building.type}</span>
    <span class="bld-status">[{statusStr}]</span>
    {#if detailed}<span class="bld-dismiss" title="Press Esc to deselect">◈</span>{/if}
  </div>

  {#if isBlueprint}
    {@const workDone = building.workDone ?? 0}
    {@const workReq = building.workRequired ?? bDef?.workAmount ?? 1}
    <div class="bld-progress">
      [{jobProgressBar(workReq > 0 ? workDone / workReq : 0)}] {Math.round(workDone)}/{workReq} work
    </div>
  {:else if building.deconstructQueued}
    {@const dDone = building.deconstructWorkDone ?? 0}
    {@const dReq = building.deconstructWorkRequired ?? 1}
    <div class="bld-progress">
      [{jobProgressBar(dReq > 0 ? dDone / dReq : 0)}] {Math.round(dDone)}/{dReq} work
    </div>
    <div class="bld-note">⊢ demolishing…</div>
  {/if}

  {#if bDef?.description}<div class="bld-desc">{bDef.description}</div>{/if}

  {#if detailed && (amenity.comfort > 0 || amenity.beauty > 0)}
    <div class="bld-stat">
      {#if amenity.comfort > 0}<span>comfort +{amenity.comfort.toFixed(2)}</span>{/if}
      {#if amenity.beauty > 0}<span>beauty +{amenity.beauty.toFixed(2)}</span>{/if}
    </div>
  {/if}

  {#if isBin}
    {@const cap = bDef?.effects?.storageStacks ?? 1}
    <div class="bld-store">stored {binContents.length}/{cap} stacks</div>
    {#if bDef?.storageFilter?.length}
      <div class="bld-store-item" style="color:#7e9fbf">
        holds {bDef.storageFilter.map((c) => c.replace(/_/g, ' ')).join(', ')}
      </div>
    {/if}
    {#each binContents as d (d.id)}
      <div class="bld-store-item">· {itemService.getItemDisplayName(d)} ×{d.quantity}</div>
    {:else}
      <div class="bld-store-item" style="opacity:0.6">· empty</div>
    {/each}
  {/if}

  {#if !isBlueprint && !building.deconstructQueued && bDef?.maxFuel !== undefined}
    {@const fuelMax = bDef.maxFuel}
    {@const fuelCurr = building.fuel ?? 0}
    <div class="bld-fuel">
      FUEL [{jobProgressBar(fuelMax > 0 ? fuelCurr / fuelMax : 0)}] {Math.floor(fuelCurr)}/{Math.floor(
        fuelMax
      )}
      {#if building.lit}<span class="fuel-lit">● lit</span>{:else}<span class="fuel-dark">○ unlit</span
        >{/if}
    </div>
  {/if}

  {#if detailed && !isBlueprint && !building.deconstructQueued}
    {@const cost = bDef?.buildingCost ?? {}}
    {#if Object.keys(cost).length > 0}
      <div class="bld-refund">
        refund ½: {Object.entries(cost)
          .map(([id, n]) => `${Math.floor(Number(n) * 0.5)}×${id.replace(/_/g, ' ')}`)
          .join(' ')}
      </div>
    {/if}
  {/if}

  {#if refuel}
    <div class="bld-needs">{refuel.needs}</div>
    {#if refuel.warn}<div class="bld-warn">{refuel.warn}</div>{/if}
  {/if}
</div>

<style>
  .bld-info {
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.5;
  }
  .bld-header {
    display: flex;
    gap: 5px;
    align-items: baseline;
    margin-bottom: 2px;
  }
  .bld-name {
    color: #c8a060;
    font-weight: bold;
    font-size: 11px;
  }
  .bld-status {
    color: #7a6030;
    font-size: 9px;
    flex: 1;
  }
  .bld-dismiss {
    color: #7a6030;
    font-size: 9px;
  }
  .bld-desc {
    color: #8a7040;
    font-size: 9px;
    margin-top: 1px;
    line-height: 1.4;
  }
  .bld-stat {
    color: #9aa66a;
    font-size: 9px;
    margin-top: 2px;
    display: flex;
    gap: 8px;
  }
  .bld-store {
    color: #c8a050;
    font-size: 9px;
    margin-top: 3px;
  }
  .bld-store-item {
    color: #a89060;
    font-size: 9px;
    line-height: 1.3;
  }
  .bld-progress {
    color: #a08840;
    font-size: 9px;
    margin-top: 2px;
  }
  .bld-note {
    color: #cc8833;
    font-size: 9px;
    margin-top: 2px;
  }
  .bld-fuel {
    color: #c87020;
    font-size: 9px;
    margin-top: 3px;
    letter-spacing: 0.02em;
  }
  .fuel-lit {
    color: #ff8800;
    margin-left: 4px;
  }
  .fuel-dark {
    color: #604020;
    margin-left: 4px;
  }
  .bld-refund {
    color: #8a8a5a;
    font-size: 9px;
    margin-top: 3px;
  }
  .bld-needs {
    color: #8a7a5a;
    font-size: 9px;
    margin-top: 2px;
  }
  .bld-warn {
    color: #cc8833;
    font-size: 9px;
    margin-top: 1px;
  }
</style>
