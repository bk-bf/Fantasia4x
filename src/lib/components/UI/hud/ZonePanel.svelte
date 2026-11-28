<script lang="ts">
  import { uiState } from '$lib/stores/uiState';
  import { gameState } from '$lib/stores/gameState';
  import BuildCard from './BuildCard.svelte';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import Well from '../widget/Well.svelte';
  import ZoneRow from './zone/ZoneRow.svelte';
  import ZoneSide from './zone/ZoneSide.svelte';
  import { ZONE_DEFS, ZONE_DEF_ENTRIES, defOf, type ZonePanelType } from './zone/zoneDefs';

  const zones = $derived($gameState.zoneInstances ?? []);
  const painting = $derived($uiState.designationActive);
  const paintingId = $derived($uiState.activeZoneInstanceId);

  let filterOf = $state<string | null>(null);
  let pawnsOf = $state<string | null>(null);

  const tiles = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const layers of Object.values($gameState.designationZoneId ?? {}))
      for (const id of Object.values(layers ?? {})) counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  });
  const tinted = $derived(zones.filter((z) => defOf(z.type)?.tinted));
  const allHidden = $derived(tinted.length > 0 && tinted.every((z) => z.colorHidden));

  function newZone(type: ZonePanelType) {
    const n = zones.filter((z) => z.type === type).length;
    const label = `${ZONE_DEFS[type].label} ${n + 1}`;
    const id = `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    gameState.command({ type: 'createZoneInstance', payload: { type, label, id }, save: true });
    if (allHidden)
      gameState.command({
        type: 'setZoneColorHidden',
        payload: { instanceId: id, hidden: true },
        save: true
      });
    uiState.activateDesignation(type, id);
  }
  function paint(type: string, id: string) {
    if (painting && paintingId === id) uiState.deactivateDesignation();
    else uiState.activateDesignation(type, id);
  }
  function remove(id: string) {
    gameState.command({ type: 'removeZoneInstance', payload: { instanceId: id }, save: true });
    if (filterOf === id) filterOf = null;
    if (pawnsOf === id) pawnsOf = null;
    if (painting && paintingId === id) uiState.deactivateDesignation();
  }
  const filtered = $derived(zones.find((z) => z.id === filterOf) ?? null);
  const confined = $derived(zones.find((z) => z.id === pawnsOf) ?? null);
  const paintedZone = $derived(zones.find((z) => z.id === paintingId) ?? null);
</script>

<div class="zones">
  <div class="cards">
    {#each ZONE_DEF_ENTRIES as [type, def] (type)}
      {@const count = zones.filter((z) => z.type === type).length}
      <BuildCard
        name={def.label}
        glyph={def.glyph}
        description={def.desc}
        workAmount={null}
        badge={null}
        actionLabel="New"
        actionGlyph="flag"
        onAction={() => newZone(type)}
      >
        <span class="count">{count > 0 ? `${count} active` : 'none yet'}</span>
      </BuildCard>
    {/each}
  </div>

  {#if paintedZone && painting}
    <p class="painting">Painting {paintedZone.label} · drag to fill · X erases</p>
  {/if}

  {#if zones.length > 0}
    <div class="zgrid" class:split={!!filtered || !!confined}>
      <Well title="Active zones">
        {#snippet tools()}
          {#if tinted.length > 0}
            <ChromeButton
              on={allHidden}
              onclick={() =>
                gameState.command({
                  type: 'setAllZoneColorHidden',
                  payload: { hidden: !allHidden },
                  save: true
                })}>{allHidden ? 'Show colours' : 'Hide colours'}</ChromeButton
            >
          {/if}
        {/snippet}
        {#each zones as inst (inst.id)}
          <ZoneRow
            {inst}
            tiles={tiles[inst.id] ?? 0}
            painting={painting && paintingId === inst.id}
            filterOpen={filterOf === inst.id}
            pawnsOpen={pawnsOf === inst.id}
            onpaint={() => paint(inst.type, inst.id)}
            onfilter={() => (filterOf = filterOf === inst.id ? null : inst.id)}
            onpawns={() => (pawnsOf = pawnsOf === inst.id ? null : inst.id)}
            oncolour={() =>
              gameState.command({
                type: 'setZoneColorHidden',
                payload: { instanceId: inst.id, hidden: !inst.colorHidden },
                save: true
              })}
            ondelete={() => remove(inst.id)}
          />
        {/each}
      </Well>
      {#if filtered || confined}<ZoneSide {filtered} {confined} />{/if}
    </div>
  {/if}
</div>

<style>
  .zones {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
    grid-auto-rows: minmax(148px, auto);
    gap: 6px;
  }
  .count {
    color: var(--text-muted);
  }
  .painting {
    margin: 0;
    color: var(--accent-hi);
  }
  .zgrid {
    display: grid;
    gap: 6px;
  }
  .zgrid.split {
    grid-template-columns: 1.5fr 1fr;
  }
</style>
