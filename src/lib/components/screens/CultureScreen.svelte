<!--
  CultureScreen.svelte — the "pokédex" of known cultures.
  Left: list of discovered cultures (populated as the colony hosts / encounters them).
  Right: full detail for the selected culture (lore, physique ranges, stat ranges + boosts,
  traits, inter-culture relations). Detail rendering lives in CultureDetail.svelte (200-LOC rule).
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { discoveredCultures, cultureRelations, gameState } from '$lib/stores/gameState';
  import type { Culture, CultureRelation, Pawn } from '$lib/game/core/types';
  import CultureDetail from './culture/CultureDetail.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';

  let cultures: Culture[] = [];
  let relations: CultureRelation[] = [];
  let pawns: Pawn[] = [];
  // Restored across tab toggles; the guard below falls back to a valid culture if it's gone.
  let selectedId: string | null = persisted('culture.selected', null);
  $: persist('culture.selected', selectedId);

  const unsubCultures = discoveredCultures.subscribe((v) => {
    cultures = v;
    // Keep a valid selection: default to the home culture / first known culture.
    if (!selectedId || !cultures.some((r) => r.id === selectedId)) {
      selectedId = cultures[0]?.id ?? null;
    }
  });
  const unsubRel = cultureRelations.subscribe((v) => (relations = v));
  const unsubState = gameState.subscribe((s) => (pawns = s.pawns ?? []));

  onDestroy(() => {
    unsubCultures();
    unsubRel();
    unsubState();
  });

  $: selected = cultures.find((r) => r.id === selectedId) ?? null;
  $: headcount = (id: string) => pawns.filter((p) => p.cultureId === id && p.isAlive).length;
</script>

<div class="culture-screen">
  <div class="screen-hdr">| KNOWN CULTURES ({cultures.length})</div>

  {#if cultures.length === 0}
    <div class="empty">no cultures known yet</div>
  {:else}
    <div class="body">
      <!-- Left: known-culture list -->
      <nav class="culture-list">
        {#each cultures as culture}
          <button
            class="culture-item"
            class:selected={culture.id === selectedId}
            on:click={() => (selectedId = culture.id)}
          >
            <span class="ri-name">{culture.name}</span>
            <span class="ri-arch">{culture.archetype}</span>
            <span class="ri-pop">{headcount(culture.id)} colonists</span>
          </button>
        {/each}
      </nav>

      <!-- Right: detail -->
      <div class="culture-detail-pane">
        {#if selected}
          <CultureDetail
            culture={selected}
            knownCultures={cultures}
            {relations}
            headcount={headcount(selected.id)}
          />
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .culture-screen {
    height: 100%;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    display: flex;
    flex-direction: column;
  }
  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
  }
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .culture-list {
    width: 180px;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid var(--border-hi);
    background: var(--bg-panel);
  }
  .culture-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    width: 100%;
    padding: 5px 10px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--text-dim);
    cursor: pointer;
    font-family: var(--font-mono);
    text-align: left;
  }
  .culture-item:hover {
    background: var(--bg-hover);
    color: var(--accent-hi);
  }
  .culture-item.selected {
    background: var(--bg-active);
    color: var(--accent-hi);
    border-left: 2px solid var(--accent-hi);
    padding-left: 8px;
  }
  .ri-name {
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  .ri-arch {
    font-size: 10px;
    color: var(--text-muted);
  }
  .ri-pop {
    font-size: 10px;
    color: var(--text-muted);
  }
  .culture-item.selected .ri-arch,
  .culture-item.selected .ri-pop {
    color: var(--accent-hi);
    opacity: 0.7;
  }
  .culture-detail-pane {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
  }
  .empty {
    padding: 20px;
    color: var(--text-muted);
    font-style: italic;
  }
</style>
