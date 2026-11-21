<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import FilterTabs from '$lib/components/UI/widget/FilterTabs.svelte';
  import SearchBar from '$lib/components/UI/widget/SearchBar.svelte';
  import ScrollArea from '$lib/components/UI/widget/ScrollArea.svelte';
  import { useWindowBar } from '$lib/components/UI/window/windowContext';
  import { persisted, persist } from '$lib/stores/uiPersist';
  import ZonePanel from '../UI/hud/ZonePanel.svelte';
  import BuildJobs from './build/BuildJobs.svelte';
  import BuildingCards from './build/BuildingCards.svelte';
  import { ZONES, buildSections, unlockedBuildings } from './build/buildSections';

  const unlocked = $derived(unlockedBuildings($gameState));
  const sections = $derived(buildSections(unlocked));

  let selected = $state<string>(persisted('building.section', ''));
  $effect(() => {
    if (selected !== ZONES && sections.length && !sections.some((s) => s.label === selected))
      selected = sections[0].label;
  });
  $effect(() => persist('building.section', selected));

  let query = $state('');
  const term = $derived(query.trim().toLowerCase());
  const shown = $derived(
    term
      ? unlocked.filter((b) => b.name.toLowerCase().includes(term))
      : ((sections.find((s) => s.label === selected) ?? sections[0])?.defs ?? [])
  );

  useWindowBar({ tools: search });
</script>

{#snippet search()}
  <SearchBar
    variant="well"
    bind:value={query}
    placeholder="search buildings…"
    cacheKey="building"
  />
{/snippet}

<div class="building-menu">
  <FilterTabs
    tabs={[
      { id: ZONES, label: 'Zones' },
      ...sections.map((s) => ({ id: s.label, label: s.label }))
    ]}
    selected={term ? '' : selected}
    onSelect={(id) => {
      selected = id;
      query = '';
    }}
  />

  <BuildJobs />

  <ScrollArea class="build-scroll">
    {#if selected === ZONES && !term}
      <ZonePanel />
    {:else if shown.length > 0}
      <BuildingCards defs={shown} />
    {:else if term}
      <p class="muted">no buildings match "{query}"</p>
    {/if}
  </ScrollArea>
</div>

<style>
  .building-menu {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
    color: var(--text);
    font: 16px/16px var(--font-pixel);
  }
  .building-menu :global(.build-scroll) {
    flex: 1;
    min-height: 0;
  }
  .muted {
    margin: 4px 2px;
    color: var(--text-muted);
  }
</style>
