<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { getCreatureById } from '$lib/game/core/defs/creatures';
  import { persisted, persist } from '$lib/stores/uiPersist';
  import { chrome } from '$lib/pixelArt/chrome';
  import SearchBar from '../UI/widget/SearchBar.svelte';
  import { useWindowBar } from '../UI/window/windowContext';
  import EntityRow from './entity/EntityRow.svelte';

  let mobs = $derived(($gameState.mobs ?? []).filter((m) => m.state !== 'Corpse'));
  let corpses = $derived(($gameState.mobs ?? []).filter((m) => m.state === 'Corpse'));

  let query = $state('');
  let term = $derived(query.trim().toLowerCase());
  let filteredMobs = $derived(
    term
      ? mobs.filter((m) => {
          const name = (getCreatureById(m.creatureId)?.name ?? m.creatureId).toLowerCase();
          const kind = m.entityClass === 'mob' ? 'hostile' : 'neutral';
          return (
            name.includes(term) ||
            kind.includes(term) ||
            (m.state ?? '').toLowerCase().includes(term)
          );
        })
      : mobs
  );

  let hostileCount = $derived(mobs.filter((m) => m.entityClass === 'mob').length);
  let neutralCount = $derived(mobs.filter((m) => m.entityClass === 'animal').length);

  let expandedId = $state<string | null>(persisted('entities.expanded', null));
  $effect(() => persist('entities.expanded', expandedId));

  useWindowBar({ tools: searchTool });
</script>

{#snippet searchTool()}
  <SearchBar variant="well" bind:value={query} placeholder="search entities…" cacheKey="entities" />
{/snippet}

<div class="entities">
  <p class="sub">
    <span class="neg">{hostileCount} hostile</span> · {neutralCount} neutral · {corpses.length}
    {corpses.length === 1 ? 'corpse' : 'corpses'}
  </p>

  {#if mobs.length === 0}
    <p class="empty">No creatures roaming the map right now.</p>
  {:else if filteredMobs.length === 0}
    <p class="empty">No entities match "{query}".</p>
  {:else}
    <div class="table" {@attach chrome('well')}>
      <div class="th">
        <i></i>
        <div class="cols">
          <i></i><span>Entity</span><span>Type</span><span>Blood</span><span>Worst limb</span><span
            >Pain</span
          ><span>State</span><span>Pos</span>
        </div>
      </div>
      <div class="rows">
        {#each filteredMobs as m (m.id)}
          <EntityRow
            mob={m}
            expanded={expandedId === m.id}
            ontoggle={() => (expandedId = expandedId === m.id ? null : m.id)}
          />
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .entities {
    --entity-cols: 28px 1.6fr 0.8fr 0.6fr 1.5fr 0.5fr 0.9fr 0.8fr;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  .sub {
    margin: -4px 0 5px;
    color: var(--text-dim);
  }
  .neg {
    color: var(--neg);
  }
  .empty {
    margin: 0;
    padding: 12px 4px;
    color: var(--text-muted);
  }
  .table {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 3px 2px;
  }
  .th {
    flex: none;
    display: flex;
    height: 20px;
    color: var(--accent-hi);
    letter-spacing: 1.4px;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .th > i {
    flex: none;
    width: 16px;
  }
  .cols {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: var(--entity-cols);
    gap: 6px;
    align-items: center;
    padding-right: 6px;
  }
  .rows {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
</style>
