<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import QueueChip from '$lib/components/UI/widget/QueueChip.svelte';
  import Well from '$lib/components/UI/widget/Well.svelte';
  import type { CraftingInProgress } from '$lib/game/core/types';
  import { craftLanes, recipeOf } from './craftData';

  let { queue }: { queue: CraftingInProgress[] } = $props();

  const lanes = $derived(craftLanes(queue, $gameState?.buildings ?? []));
  let dragId = $state<string | null>(null);

  function moveOnChip(targetId: string, stationId: string | null) {
    const id = dragId;
    dragId = null;
    if (!id || id === targetId) return;
    gameState.command({
      type: 'moveCraftOrder',
      payload: { queueId: id, stationBuildingId: stationId ?? undefined, beforeId: targetId },
      save: true
    });
  }
  function moveOnLane(stationId: string | null) {
    const id = dragId;
    dragId = null;
    if (!id || stationId === null) return;
    gameState.command({
      type: 'moveCraftOrder',
      payload: { queueId: id, stationBuildingId: stationId },
      save: true
    });
  }
  function progressOf(qi: CraftingInProgress): number {
    const req = qi.workRequired ?? (recipeOf(qi.item.id)?.workAmount ?? 1) * 5;
    return Math.round(Math.min(100, ((qi.workDone ?? 0) / req) * 100));
  }
</script>

<Well class="craft-queue" title="Queue ({queue.length})">
  <div class="lanes">
    {#each lanes as lane (lane.id ?? 'hand')}
      <div
        class="lane"
        class:open={dragId !== null && lane.id !== null}
        role="list"
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => {
          e.preventDefault();
          moveOnLane(lane.id);
        }}
      >
        <h5>{lane.label}{lane.items.length === 0 ? ' · empty' : ''}</h5>
        {#each lane.items as qi (qi.id)}
          {@const prog = progressOf(qi)}
          {@const state = qi.paused ? 'pause' : qi.pending ? 'wait' : 'run'}
          <QueueChip
            name={qi.item.name}
            qty={qi.quantity ?? 1}
            item={qi.item.id}
            progress={prog}
            {state}
            title="{qi.item.name} ×{qi.quantity ?? 1}"
            target={dragId !== null && dragId !== qi.id}
            onpause={() =>
              gameState.command({
                type: 'toggleCraftPaused',
                payload: { queueId: qi.id },
                save: true
              })}
            oncancel={() =>
              gameState.command({ type: 'cancelCrafting', payload: { queueId: qi.id } })}
            ondragstart={() => (dragId = qi.id)}
            ondragend={() => (dragId = null)}
            ondrop={() => moveOnChip(qi.id, lane.id)}
          />
        {/each}
        {#if lane.items.length === 0}<p class="hint">drop a task here</p>{/if}
      </div>
    {/each}
  </div>
</Well>

<style>
  :global(.well.craft-queue) {
    flex: none;
    padding: 7px 10px 8px;
  }
  .lanes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 4px 10px;
  }
  .lane {
    min-width: 0;
  }
  .lane.open {
    outline: 1px dashed var(--border-hi);
    outline-offset: 2px;
  }
  h5 {
    margin: 0 0 3px;
    color: var(--text-muted);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 1.2px;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint {
    margin: 0;
    height: 22px;
    padding-left: 4px;
    line-height: 22px;
    color: var(--text-muted);
    opacity: 0.7;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text-muted) 40%, transparent);
  }
</style>
