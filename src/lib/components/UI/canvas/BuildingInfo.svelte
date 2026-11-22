<script lang="ts">
  import { buildingService } from '$lib/game/services/BuildingService';
  import { itemService } from '$lib/game/services/ItemService';
  import { jobProgressBar } from './selectionCard';
  import type { PlacedBuilding, DroppedItem } from '$lib/game/core/types';

  let {
    building,
    binContents = []
  }: {
    building: PlacedBuilding;
    binContents?: DroppedItem[];
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
</script>

<div class="bld-info">
  <div class="bld-header">
    <span class="bld-name">{bDef?.name ?? building.type}</span>
    <span class="bld-status">[{statusStr}]</span>
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

  {#if !isBlueprint && !building.deconstructQueued && buildingService.deterioratingRate(building.type) > 0}
    {@const cond = Math.round(building.condition ?? 100)}
    <div
      class="bld-condition"
      style="color:{cond >= 70 ? '#68b030' : cond >= 35 ? '#c8a13a' : '#cc5544'}"
      title="structural condition — weather wears it down; repair it or at 0% it fails and is lost"
    >
      CONDITION [{jobProgressBar(cond / 100)}] {cond}%
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
      {@const dryTarget = itemService.dryingTargetSeconds(d.resourceId)}
      <div class="bld-store-item">
        · {itemService.getItemDisplayName(d)} ×{d.quantity}
        {#if dryTarget !== null}
          {@const dry = Math.min(1, (d.drying ?? 0) / dryTarget)}
          <span class="bld-dry">— DRY [{jobProgressBar(dry)}] {Math.round(dry * 100)}%</span>
        {/if}
      </div>
    {:else}
      <div class="bld-store-item" style="opacity:0.6">· empty</div>
    {/each}
  {/if}

  {#if !isBlueprint && !building.deconstructQueued && bDef?.maxFuel !== undefined}
    {@const fuelMax = bDef.maxFuel}
    {@const fuelCurr = building.fuel ?? 0}
    {@const burning = building.fuelItemIds ?? []}
    <div class="bld-fuel">
      FUEL [{jobProgressBar(fuelMax > 0 ? fuelCurr / fuelMax : 0)}] {Math.floor(
        fuelCurr
      )}/{Math.floor(fuelMax)}
      {#if building.lit}<span class="fuel-lit">● lit</span>{:else}<span class="fuel-dark"
          >○ unlit</span
        >{/if}
      {#if building.lit && burning.length > 0}<span class="fuel-burning"
          >· {itemService.getItemById(burning[0])?.name ??
            burning[0].replace(/_/g, ' ')}{#if burning.length > 1}
            +{burning.length - 1}{/if}</span
        >{/if}
    </div>
  {/if}
</div>

<style>
  .bld-info {
    font-family: var(--font-mono);
    font-size: 11px;
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
    font-size: 12px;
  }
  .bld-status {
    color: #7a6030;
    font-size: 10px;
    flex: 1;
  }
  .bld-desc {
    color: #8a7040;
    font-size: 10px;
    margin-top: 1px;
    line-height: 1.4;
  }
  .bld-store {
    color: #c8a050;
    font-size: 10px;
    margin-top: 3px;
  }
  .bld-store-item {
    color: #a89060;
    font-size: 10px;
    line-height: 1.3;
  }
  .bld-dry {
    color: #d4b44a;
    letter-spacing: 0.02em;
  }
  .bld-progress {
    color: #a08840;
    font-size: 10px;
    margin-top: 2px;
  }
  .bld-note {
    color: #cc8833;
    font-size: 10px;
    margin-top: 2px;
  }
  .bld-condition {
    font-size: 10px;
    margin-top: 3px;
    letter-spacing: 0.02em;
  }
  .bld-fuel {
    color: #c87020;
    font-size: 10px;
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
  .fuel-burning {
    color: #b0651e;
    margin-left: 4px;
  }
</style>
