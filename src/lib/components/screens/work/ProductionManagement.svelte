<script lang="ts">
  import { locationService } from '$lib/game/services/LocationServices';
  import { workService } from '$lib/game/services/WorkService';
  import type { ProductionTarget, Pawn } from '$lib/game/core/types';

  interface Props {
    productionTargets: ProductionTarget[];
    pawns: Pawn[];
  }
  let { productionTargets, pawns }: Props = $props();

  function locationName(id: string): string {
    const loc = locationService.getDiscoveredLocations().find((l) => l.id === id);
    return loc?.name ?? id;
  }

  function workName(id: string): string {
    return workService.getWorkCategory(id)?.name ?? id;
  }

  function assignedCount(target: ProductionTarget): number {
    return target.assignedPawns.filter((id) => pawns.some((p) => p.id === id)).length;
  }
</script>

{#if productionTargets.length > 0}
  <div class="section-hdr">| PRODUCTION TARGETS</div>
  <div class="prod-list">
    {#each productionTargets as target}
      <div class="prod-row">
        <span class="p-loc">{locationName(target.locationId).toUpperCase()}</span>
        <span class="p-sep">·</span>
        <span class="p-work">{workName(target.workCategoryId).toUpperCase()}</span>
        <span class="p-sep">·</span>
        <span class="p-pawns" class:unassigned={assignedCount(target) === 0}>
          {assignedCount(target) > 0 ? assignedCount(target) + ' workers' : 'unassigned'}
        </span>
        {#if Object.keys(target.resourceTargets).length > 0}
          <span class="p-resources">
            {#each Object.entries(target.resourceTargets) as [resId, pct]}
              <span class="p-res">{resId.toUpperCase()}: {pct}%</span>
            {/each}
          </span>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 1px;
  }
  .prod-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 8px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
  }
  .prod-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
  }
  .p-loc {
    color: var(--text);
    min-width: 80px;
  }
  .p-work {
    color: var(--accent);
    min-width: 80px;
  }
  .p-sep {
    color: var(--text-muted, #555);
  }
  .p-pawns {
    color: var(--text-dim);
    font-size: 10px;
  }
  .p-pawns.unassigned {
    color: var(--text-muted, #555);
    font-style: italic;
  }
  .p-resources {
    display: flex;
    gap: 6px;
  }
  .p-res {
    font-size: 10px;
    color: var(--text-muted, #555);
    border: 1px solid var(--border);
    padding: 0 3px;
  }
</style>
