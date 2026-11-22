<script lang="ts">
  import { gameState, currentCulture } from '$lib/stores/gameState';
  import FilterTabs from '$lib/components/UI/widget/FilterTabs.svelte';
  import SearchBar from '$lib/components/UI/widget/SearchBar.svelte';
  import CardRow from '$lib/components/UI/widget/CardRow.svelte';
  import { useWindowBar } from '$lib/components/UI/window/windowContext';
  import { persisted, persist } from '$lib/stores/uiPersist';
  import CraftQueue from './craft/CraftQueue.svelte';
  import RecipeCard from './craft/RecipeCard.svelte';
  import { CRAFT_TAB_ORDER, craftableItems, entriesFor } from './craft/craftData';

  const queue = $derived($gameState?.craftingQueue ?? []);
  const items = $derived(
    craftableItems(
      $gameState,
      $gameState?.completedResearch ?? [],
      $currentCulture?.population ?? 0
    )
  );

  let dishSel = $state<Record<string, Record<string, string>>>({});
  function setDishSlot(itemId: string, slotKey: string, ingredientId: string) {
    const cur = { ...(dishSel[itemId] ?? {}) };
    if (ingredientId) cur[slotKey] = ingredientId;
    else delete cur[slotKey];
    dishSel = { ...dishSel, [itemId]: cur };
  }

  const entries = $derived(
    items.flatMap((i) => entriesFor(i, $gameState?.stockpile ?? {}, dishSel))
  );
  const categories = $derived.by(() => {
    const present = new Set(entries.map((e) => e.category));
    return [
      ...CRAFT_TAB_ORDER.filter((c) => present.has(c)),
      ...[...present].filter((c) => !CRAFT_TAB_ORDER.includes(c)).sort()
    ];
  });

  let selectedCat = $state<string>(persisted('crafting.cat', ''));
  $effect(() => {
    if (categories.length && !categories.includes(selectedCat)) selectedCat = categories[0];
  });
  $effect(() => persist('crafting.cat', selectedCat));

  let query = $state('');
  const term = $derived(query.trim().toLowerCase());
  const shown = $derived(
    term
      ? entries.filter((e) => e.name.toLowerCase().includes(term))
      : entries.filter((e) => e.category === (selectedCat || categories[0]))
  );

  useWindowBar({ tools: search });
</script>

{#snippet search()}
  <SearchBar variant="well" bind:value={query} placeholder="search recipes…" cacheKey="crafting" />
{/snippet}

<div class="crafting-screen">
  {#if categories.length > 0}
    <FilterTabs
      tabs={categories.map((c) => ({ id: c, label: c }))}
      selected={term ? '' : selectedCat}
      onSelect={(id) => {
        selectedCat = id;
        query = '';
      }}
    />
  {/if}

  {#if queue.length > 0}<CraftQueue {queue} />{/if}

  {#if shown.length > 0}
    <CardRow height={214}>
      {#each shown as entry (entry.key)}
        <RecipeCard
          {entry}
          picked={dishSel[entry.item.id] ?? {}}
          onpick={(slot, id) => setDishSlot(entry.item.id, slot, id)}
        />
      {/each}
    </CardRow>
  {:else if term}
    <p class="muted">no recipes match "{query}"</p>
  {:else if items.length === 0}
    <p class="muted">no recipes available</p>
  {/if}
</div>

<style>
  .crafting-screen {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 7px;
    color: var(--text);
    font: 16px/16px var(--font-pixel);
  }
  .muted {
    margin: 4px 2px;
    color: var(--text-muted);
  }
</style>
