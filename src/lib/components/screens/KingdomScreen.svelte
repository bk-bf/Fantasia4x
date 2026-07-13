<!--
  KingdomScreen.svelte — the "pokédex" of known kingdoms (KINGDOMS-TRADE §2).
  Left: list of kingdoms the colony has a relationship with (encountered via visitors/caravans).
  Right: tier-gated detail — the entry visibly GROWS as the colony learns. Forked from
  CultureScreen; detail rendering lives in kingdom/KingdomDetail.svelte (200-LOC rule).
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    discoveredKingdoms,
    kingdomRelations,
    culturePool,
    currentTurn,
    gameState
  } from '$lib/stores/gameState';
  import type { Culture, Kingdom, KingdomRelation } from '$lib/game/core/types';
  import { COLONY_RELATION_ID } from '$lib/game/core/types';
  import { knowledgeTier } from '$lib/game/core/Kingdom';
  import KingdomDetail from './kingdom/KingdomDetail.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';

  // How deeply the colony knows a kingdom, in plain words (tiers 0–4).
  const ACQUAINTANCE = ['strangers', 'acquainted', 'familiar', 'well known', 'deeply known'];

  let known: Kingdom[] = [];
  let relations: KingdomRelation[] = [];
  let cultures: Culture[] = [];
  let turn = 0;
  let selectedId: string | null = persisted('kingdom.selected', null);
  $: persist('kingdom.selected', selectedId);

  const unsubKingdoms = discoveredKingdoms.subscribe((v) => {
    known = v;
    if (!selectedId || !known.some((k) => k.id === selectedId)) {
      selectedId = known[0]?.id ?? null;
    }
  });
  const unsubRel = kingdomRelations.subscribe((v) => (relations = v));
  const unsubCultures = culturePool.subscribe((v) => (cultures = v));
  const unsubTurn = currentTurn.subscribe((v) => (turn = v));
  // Kingdoms any living colonist calls home (BACKGROUNDS) → colonist name(s), marked in the list.
  let homelandBy = new Map<string, string[]>();
  const unsubState = gameState.subscribe((s) => {
    const m = new Map<string, string[]>();
    for (const p of s.pawns ?? []) {
      if (p.isAlive === false || !p.homeKingdomId) continue;
      const names = m.get(p.homeKingdomId) ?? [];
      names.push(p.name);
      m.set(p.homeKingdomId, names);
    }
    homelandBy = m;
  });
  // Compact "whose homeland": one name, or "Name +N" when several colonists share it.
  const homeLabel = (names: string[]) =>
    names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;

  onDestroy(() => {
    unsubKingdoms();
    unsubRel();
    unsubCultures();
    unsubTurn();
    unsubState();
  });

  $: selected = known.find((k) => k.id === selectedId) ?? null;
  $: dispositionTo = (id: string) =>
    relations.find(
      (r) =>
        (r.a === COLONY_RELATION_ID && r.b === id) || (r.b === COLONY_RELATION_ID && r.a === id)
    )?.disposition ?? 'neutral';
</script>

<div class="kingdom-screen">
  <div class="screen-hdr">| KNOWN KINGDOMS ({known.length})</div>

  {#if known.length === 0}
    <div class="empty">
      no kingdoms known yet — the world will come to you: watch for visitors and caravans
    </div>
  {:else}
    <div class="body">
      <nav class="kingdom-list">
        {#each known as kingdom}
          <button
            class="kingdom-item"
            class:selected={kingdom.id === selectedId}
            on:click={() => (selectedId = kingdom.id)}
          >
            <span class="ki-name">{kingdom.name}</span>
            {#if homelandBy.has(kingdom.id)}
              <span class="ki-home" title="home of {homelandBy.get(kingdom.id)!.join(', ')}"
                >⌂ {homeLabel(homelandBy.get(kingdom.id)!)}</span
              >
            {/if}
            <span class="ki-disp">{dispositionTo(kingdom.id)}</span>
            <span class="ki-tier">{ACQUAINTANCE[knowledgeTier(kingdom.knowledge)]}</span>
          </button>
        {/each}
      </nav>

      <div class="kingdom-detail-pane">
        {#if selected}
          <KingdomDetail kingdom={selected} knownKingdoms={known} {relations} {cultures} {turn} />
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .kingdom-screen {
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
  .kingdom-list {
    width: 180px;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid var(--border-hi);
    background: var(--bg-panel);
  }
  .kingdom-item {
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
  .kingdom-item:hover {
    background: var(--bg-hover);
    color: var(--accent-hi);
  }
  .kingdom-item.selected {
    background: var(--bg-active);
    color: var(--accent-hi);
    border-left: 2px solid var(--accent-hi);
    padding-left: 8px;
  }
  .ki-name {
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  .ki-home {
    font-size: 10px;
    color: var(--pos);
    letter-spacing: 0.04em;
  }
  .ki-disp,
  .ki-tier {
    font-size: 10px;
    color: var(--text-muted);
  }
  .kingdom-item.selected .ki-disp,
  .kingdom-item.selected .ki-tier {
    color: var(--accent-hi);
    opacity: 0.7;
  }
  .kingdom-detail-pane {
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
