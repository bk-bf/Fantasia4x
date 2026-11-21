<script lang="ts">
  import { gameState, currentCulture } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { availableAggregateFromDrops } from '$lib/game/core/state/stockpile';
  import { itemService } from '$lib/game/services/ItemService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { getMaterialProperty } from '$lib/game/core/defs/materials';
  import BuildCard from '$lib/components/UI/hud/BuildCard.svelte';
  import ItemPills, { type ItemPillView } from '$lib/components/UI/widget/ItemPills.svelte';
  import MaterialPick from '$lib/components/UI/widget/MaterialPick.svelte';
  import type { Building } from '$lib/game/core/types';

  let { defs }: { defs: Building[] } = $props();

  const CAT = 'category:';
  const gs = $derived($gameState);
  const stock = $derived(availableAggregateFromDrops(gs?.droppedItems));
  const amount = (id: string): number => stock[id] ?? 0;
  const have = (id: string): number =>
    id.startsWith(CAT)
      ? itemService.getItemsByCategory(id.slice(CAT.length)).reduce((s, it) => s + amount(it.id), 0)
      : amount(id);
  const placed = (id: string): number =>
    (gs?.buildings ?? []).filter((b) => b.type === id && b.status === 'complete').length;

  let chosen = $state<Record<string, Record<string, string>>>({});
  function choose(buildingId: string, costKey: string, itemId: string) {
    const next = { ...(chosen[buildingId] ?? {}) };
    if (itemId) next[costKey] = itemId;
    else delete next[costKey];
    chosen = { ...chosen, [buildingId]: next };
  }
  const optionsFor = (costKey: string) =>
    itemService
      .getItemsByCategory(costKey.slice(CAT.length))
      .map((it) => ({ id: it.id, name: it.name, have: amount(it.id) }))
      .sort((a, b) => (b.have > 0 ? 1 : 0) - (a.have > 0 ? 1 : 0));

  const rowsOf = (b: Building): ItemPillView[] =>
    Object.entries(b.buildingCost)
      .filter(([id]) => !id.startsWith(CAT))
      .map(([itemId, n]) => {
        const h = have(itemId);
        return { itemId, qty: `${n}`, sub: `${h}`, dim: h < (n as number) };
      });
</script>

<div class="cards">
  {#each defs as building (building.id)}
    {@const count = placed(building.id)}
    {@const affordable = !!gs && buildingService.resolveBuildingCost(building.id, gs) !== null}
    {@const buildable =
      !!gs && !!$currentCulture && buildingService.canBuildBuilding(building.id, gs)}
    {@const mats = chosen[building.id] ?? {}}
    <BuildCard
      name={building.name}
      charSpans={building.charSpans}
      description={building.description ?? null}
      buildingDef={building}
      statMaterials={mats}
      workAmount={building.workAmount ?? null}
      badge={count > 0 ? `×${count}` : null}
      actionLabel={!affordable ? 'Short of stock' : !buildable ? 'Blocked' : 'Place'}
      actionEnabled={buildable}
      variant={!affordable ? 'missing' : !buildable ? 'blocked' : 'ok'}
      onAction={() => uiState.activateBlueprint(building.id, chosen[building.id] ?? null)}
    >
      {#if Object.keys(building.buildingCost).length === 0}
        <span class="free">free</span>
      {:else}
        <ItemPills rows pills={rowsOf(building)} />
        {#each Object.entries(building.buildingCost).filter( ([id]) => id.startsWith(CAT) ) as [key, n] (key)}
          {@const pick = mats[key] ?? ''}
          {@const mp = pick ? getMaterialProperty(pick) : null}
          <MaterialPick
            any={key.slice(CAT.length)}
            options={optionsFor(key)}
            value={pick}
            qty={n as number}
            have={have(key)}
            short={have(key) < (n as number)}
            note={mp ? `${mp.label}: ${mp.desc}` : null}
            onpick={(v) => choose(building.id, key, v)}
          />
        {/each}
      {/if}
    </BuildCard>
  {/each}
</div>

<style>
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
    grid-auto-rows: minmax(172px, auto);
    gap: 6px;
  }
  .free {
    color: var(--text-muted);
  }
</style>
