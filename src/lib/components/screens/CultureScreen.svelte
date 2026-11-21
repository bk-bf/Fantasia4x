<script lang="ts">
  import { discoveredCultures, cultureRelations, gameState } from '$lib/stores/gameState';
  import CultureDetail from './culture/CultureDetail.svelte';
  import ListChip from '../UI/widget/ListChip.svelte';
  import ListDetail from '../UI/widget/ListDetail.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';

  let cultures = $derived($discoveredCultures);
  let chosen = $state<string | null>(persisted('culture.selected', null));
  let selected = $derived(cultures.find((c) => c.id === chosen) ?? cultures[0] ?? null);
  $effect(() => persist('culture.selected', selected?.id ?? null));

  let headcount = $derived.by(() => {
    const m: Record<string, number> = {};
    for (const p of $gameState.pawns ?? [])
      if (p.isAlive && p.cultureId) m[p.cultureId] = (m[p.cultureId] ?? 0) + 1;
    return m;
  });
  const colonists = (n: number) => (n === 0 ? 'none here' : `${n} colonist${n === 1 ? '' : 's'}`);
</script>

{#if cultures.length === 0}
  <p class="empty">no cultures known yet</p>
{:else}
  <ListDetail>
    {#snippet list()}
      {#each cultures as culture (culture.id)}
        <ListChip on={culture.id === selected?.id} onclick={() => (chosen = culture.id)}>
          <b>{culture.name}</b>
          <em>{culture.archetype}</em>
          <span>{colonists(headcount[culture.id] ?? 0)}</span>
        </ListChip>
      {/each}
    {/snippet}
    {#snippet detail()}
      {#if selected}
        <CultureDetail
          culture={selected}
          knownCultures={cultures}
          relations={$cultureRelations}
          headcount={headcount[selected.id] ?? 0}
        />
      {/if}
    {/snippet}
  </ListDetail>
{/if}

<style>
  .empty {
    margin: 0;
    padding: 12px 4px;
    color: var(--text-muted);
    font: 16px/18px var(--font-pixel);
  }
</style>
