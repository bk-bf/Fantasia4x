<!--
  RaceScreen.svelte — the "pokédex" of known races.
  Left: list of discovered races (populated as the colony hosts / encounters them).
  Right: full detail for the selected race (lore, physique ranges, stat ranges + boosts,
  traits, inter-race relations). Detail rendering lives in RaceDetail.svelte (200-LOC rule).
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { discoveredRaces, raceRelations, gameState } from '$lib/stores/gameState';
  import type { Race, RaceRelation, Pawn } from '$lib/game/core/types';
  import RaceDetail from './race/RaceDetail.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';

  let races: Race[] = [];
  let relations: RaceRelation[] = [];
  let pawns: Pawn[] = [];
  // Restored across tab toggles; the guard below falls back to a valid race if it's gone.
  let selectedId: string | null = persisted('race.selected', null);
  $: persist('race.selected', selectedId);

  const unsubRaces = discoveredRaces.subscribe((v) => {
    races = v;
    // Keep a valid selection: default to the home race / first known race.
    if (!selectedId || !races.some((r) => r.id === selectedId)) {
      selectedId = races[0]?.id ?? null;
    }
  });
  const unsubRel = raceRelations.subscribe((v) => (relations = v));
  const unsubState = gameState.subscribe((s) => (pawns = s.pawns ?? []));

  onDestroy(() => {
    unsubRaces();
    unsubRel();
    unsubState();
  });

  $: selected = races.find((r) => r.id === selectedId) ?? null;
  $: headcount = (id: string) => pawns.filter((p) => p.raceId === id && p.isAlive).length;
</script>

<div class="race-screen">
  <div class="screen-hdr">| KNOWN RACES ({races.length})</div>

  {#if races.length === 0}
    <div class="empty">no races known yet</div>
  {:else}
    <div class="body">
      <!-- Left: known-race list -->
      <nav class="race-list">
        {#each races as race}
          <button
            class="race-item"
            class:selected={race.id === selectedId}
            on:click={() => (selectedId = race.id)}
          >
            <span class="ri-name">{race.name}</span>
            <span class="ri-arch">{race.archetype}</span>
            <span class="ri-pop">{headcount(race.id)} colonists</span>
          </button>
        {/each}
      </nav>

      <!-- Right: detail -->
      <div class="race-detail-pane">
        {#if selected}
          <RaceDetail
            race={selected}
            knownRaces={races}
            {relations}
            headcount={headcount(selected.id)}
          />
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .race-screen {
    height: 100%;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
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
  .race-list {
    width: 180px;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid var(--border-hi);
    background: var(--bg-panel);
  }
  .race-item {
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
    font-family: 'Courier New', monospace;
    text-align: left;
  }
  .race-item:hover {
    background: var(--bg-hover);
    color: var(--accent-hi);
  }
  .race-item.selected {
    background: var(--bg-active);
    color: var(--accent-hi);
    border-left: 2px solid var(--accent-hi);
    padding-left: 8px;
  }
  .ri-name {
    font-size: 11px;
    letter-spacing: 0.04em;
  }
  .ri-arch {
    font-size: 9px;
    color: var(--text-muted);
  }
  .ri-pop {
    font-size: 9px;
    color: var(--text-muted);
  }
  .race-item.selected .ri-arch,
  .race-item.selected .ri-pop {
    color: var(--accent-hi);
    opacity: 0.7;
  }
  .race-detail-pane {
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
