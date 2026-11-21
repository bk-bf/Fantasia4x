<script lang="ts">
  import { tick } from 'svelte';
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { persisted, persist } from '$lib/stores/uiPersist';
  import { chrome } from '$lib/pixelArt/chrome';
  import type { Pawn } from '$lib/game/core/types';
  import { useWindowBar } from '../UI/window/windowContext';
  import ChromeButton from '../UI/widget/ChromeButton.svelte';
  import PawnRoster from '../pawn/PawnRoster.svelte';
  import PawnStatBanner from '../pawn/PawnStatBanner.svelte';
  import PawnStatusTab from '../pawn/PawnStatusTab.svelte';
  import PawnAttributesTab from '../pawn/PawnAttributesTab.svelte';
  import PawnRelations from '../pawn/PawnRelations.svelte';
  import PawnGearTab from '../pawn/PawnGearTab.svelte';

  const TABS = [
    { id: 'status', label: 'Status' },
    { id: 'attributes', label: 'Attributes' },
    { id: 'relations', label: 'Relations' },
    { id: 'gear', label: 'Gear' }
  ] as const;
  type PawnTab = (typeof TABS)[number]['id'];

  let activeTab: PawnTab = $state(persisted<PawnTab>('pawn.tab', 'status'));
  $effect(() => persist('pawn.tab', activeTab));

  const pawns = $derived($gameState.pawns ?? []);
  const pawn: Pawn | null = $derived(
    pawns.find((p) => p.id === $uiState.selectedPawnId) ?? pawns[0] ?? null
  );
  const following = $derived(!!pawn && $uiState.cameraFollowPawnId === pawn.id);

  $effect(() => {
    if (pawn && pawn.id !== $uiState.selectedPawnId) uiState.selectPawn(pawn.id);
  });

  $effect(() => {
    const asked = $uiState.pawnScreenTab;
    if (!asked) return;
    activeTab = asked;
    tick().then(() => uiState.setPawnTab(null));
  });

  function selectPawn(p: Pawn) {
    uiState.selectPawn(p.id);
    if (p.position) uiState.focusMapOn(p.position.x, p.position.y, false);
  }

  useWindowBar({ tabs, tools });
</script>

{#snippet tabs()}
  {#each TABS as t (t.id)}
    <button
      class="tab"
      class:on={activeTab === t.id}
      onclick={() => (activeTab = t.id)}
      {@attach chrome(activeTab === t.id ? 'cellOn' : 'cell')}><span>{t.label}</span></button
    >
  {/each}
{/snippet}

{#snippet tools()}
  {#if pawn}
    <ChromeButton
      glyph="eye"
      on={following}
      onclick={() => uiState.setFollowPawn(following ? null : (pawn?.id ?? null))}
      >{following ? 'Unfollow' : 'Follow'}</ChromeButton
    >
  {/if}
{/snippet}

<div class="pawn-screen">
  <div class="sub">
    <PawnRoster {pawns} selected={pawn} onSelect={selectPawn} />
    {#if pawn}<PawnStatBanner {pawn} />{/if}
  </div>

  {#if pawn}
    <div class="body">
      {#if activeTab === 'status'}
        <PawnStatusTab {pawn} />
      {:else if activeTab === 'attributes'}
        <PawnAttributesTab {pawn} />
      {:else if activeTab === 'relations'}
        <PawnRelations {pawn} gameState={$gameState} onSelect={selectPawn} />
      {:else}
        <PawnGearTab {pawn} />
      {/if}
    </div>
  {:else}
    <p class="empty">No one lives here yet.</p>
  {/if}
</div>

<style>
  .pawn-screen {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
  }
  .sub {
    flex: none;
    display: flex;
    gap: 10px;
    align-items: stretch;
    margin-bottom: 7px;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .tab {
    height: 20px;
    padding: 0 9px;
    border: 0;
    background: none;
    color: var(--text-dim);
    font: 16px/18px var(--font-pixel);
    text-transform: uppercase;
    letter-spacing: 1.4px;
    white-space: nowrap;
    cursor: pointer;
  }
  .tab.on {
    color: var(--ember);
  }
  .empty {
    color: var(--text-muted);
  }
</style>
