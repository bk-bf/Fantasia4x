<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { buildingService } from '$lib/game/services/BuildingService';
  import QueueChip from '$lib/components/UI/widget/QueueChip.svelte';
  import Well from '$lib/components/UI/widget/Well.svelte';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';

  const FUEL_MAX = 60;

  const buildings = $derived($gameState?.buildings ?? []);
  const jobs = $derived(buildings.filter((b) => b.status !== 'complete'));
  const fires = $derived(buildings.filter((b) => b.type === 'campfire' && b.status === 'complete'));

  let dragId = $state<string | null>(null);
  function dropOn(targetId: string) {
    const order = jobs.map((b) => b.id);
    const from = order.indexOf(dragId ?? '');
    dragId = null;
    if (from < 0 || !order.includes(targetId) || order[from] === targetId) return;
    const moved = order.splice(from, 1)[0];
    order.splice(order.indexOf(targetId), 0, moved);
    gameState.command({ type: 'reorderBuilds', payload: { orderedIds: order }, save: true });
  }
</script>

{#if jobs.length > 0 || fires.length > 0}
  <Well class="build-jobs">
    {#if jobs.length > 0}
      <h5>Under construction ({jobs.length})</h5>
      <div class="grid" role="list">
        {#each jobs as bp (bp.id)}
          {@const name = buildingService.getBuildingById(bp.type)?.name ?? bp.type}
          {@const prog = Math.round(((bp.workDone ?? 0) / (bp.workRequired ?? 50)) * 100)}
          <QueueChip
            {name}
            building={bp.type}
            progress={prog}
            state={bp.paused ? 'pause' : 'run'}
            title={name}
            target={dragId !== null && dragId !== bp.id}
            onpause={() =>
              gameState.command({
                type: 'togglePausedBuilding',
                payload: { id: bp.id },
                save: true
              })}
            oncancel={() =>
              gameState.command({
                type: 'cancelBuildingRefund',
                payload: { buildingId: bp.id },
                save: true
              })}
            ondragstart={() => (dragId = bp.id)}
            ondragend={() => (dragId = null)}
            ondrop={() => dropOn(bp.id)}
          />
        {/each}
      </div>
    {/if}
    {#if fires.length > 0}
      <h5>Fires ({fires.length})</h5>
      <div class="grid">
        {#each fires as cf (cf.id)}
          {@const fuel = Math.floor(cf.fuel ?? 0)}
          <div class="fire" class:out={!cf.lit}>
            <SpriteIcon building="campfire" px={16} />
            <span>{buildingService.getBuildingById('campfire')?.name ?? 'Campfire'}</span>
            <SkinBar value={fuel / FUEL_MAX} ramp="ember" />
            <em>{fuel}/{FUEL_MAX}</em>
          </div>
        {/each}
      </div>
    {/if}
  </Well>
{/if}

<style>
  :global(.well.build-jobs) {
    flex: none;
    padding: 2px 10px 6px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    column-gap: 10px;
    margin-bottom: 2px;
  }
  .fire {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 22px;
  }
  .fire.out {
    opacity: 0.55;
  }
  .fire span {
    width: 84px;
    white-space: nowrap;
    overflow: hidden;
  }
  em {
    font-style: normal;
    color: var(--text-muted);
  }
</style>
