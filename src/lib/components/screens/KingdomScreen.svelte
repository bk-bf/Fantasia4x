<script lang="ts">
  import { DISPOSITION_TONE } from '$lib/components/util/dispositionTone';
  import {
    discoveredKingdoms,
    kingdomRelations,
    culturePool,
    currentTurn,
    gameState
  } from '$lib/stores/gameState';
  import { COLONY_RELATION_ID } from '$lib/game/core/types';
  import { knowledgeTierLabel } from '$lib/game/core/gen/kingdom';
  import KingdomDetail from './kingdom/KingdomDetail.svelte';
  import ListChip from '../UI/widget/ListChip.svelte';
  import ListDetail from '../UI/widget/ListDetail.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';

  let known = $derived($discoveredKingdoms);
  let chosen = $state<string | null>(persisted('kingdom.selected', null));
  let selected = $derived(known.find((k) => k.id === chosen) ?? known[0] ?? null);
  $effect(() => persist('kingdom.selected', selected?.id ?? null));

  let homelandBy = $derived.by(() => {
    const m: Record<string, string[]> = {};
    for (const p of $gameState.pawns ?? []) {
      if (p.isAlive === false || !p.homeKingdomId) continue;
      (m[p.homeKingdomId] ??= []).push(p.name);
    }
    return m;
  });
  const homeLabel = (names: string[]) =>
    names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;

  const dispositionTo = (id: string) =>
    $kingdomRelations.find(
      (r) =>
        (r.a === COLONY_RELATION_ID && r.b === id) || (r.b === COLONY_RELATION_ID && r.a === id)
    )?.disposition ?? 'neutral';
</script>

{#if known.length === 0}
  <p class="empty">
    no kingdoms known yet — the world will come to you: watch for visitors and caravans
  </p>
{:else}
  <ListDetail>
    {#snippet list()}
      {#each known as kingdom (kingdom.id)}
        {@const home = homelandBy[kingdom.id]}
        {@const disp = dispositionTo(kingdom.id)}
        {@const on = kingdom.id === selected?.id}
        <ListChip {on} onclick={() => (chosen = kingdom.id)}>
          <b>{kingdom.name}</b>
          {#if home}<em title="home of {home.join(', ')}">⌂ {homeLabel(home)}</em>{/if}
          <span
            ><i style:color={on ? null : DISPOSITION_TONE[disp]}>{disp}</i> · {knowledgeTierLabel(
              kingdom.knowledge
            )}</span
          >
        </ListChip>
      {/each}
    {/snippet}
    {#snippet detail()}
      {#if selected}
        <KingdomDetail
          kingdom={selected}
          knownKingdoms={known}
          relations={$kingdomRelations}
          cultures={$culturePool}
          turn={$currentTurn}
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
  i {
    font-style: normal;
  }
</style>
