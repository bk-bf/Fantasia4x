<script lang="ts">
  // EXPLORE tab — a ledger of EVERY resource node on each DISCOVERED tile (name, type, amount,
  // location). Modeled on EntityScreen (same table/row/focus-on-click pattern) with the shared
  // SearchBar (the Crafting tab's search filter).
  //
  // Scale: a forested map has tens of thousands of nodes, so this does two things to stay cheap:
  //   1. Virtualised rendering — only the rows inside the scroll viewport become DOM (a windowed
  //      slice over a tall spacer), so the full 20k+ list scrolls smoothly without 20k DOM nodes.
  //   2. Background-cached rows — the O(map) scan lives in the `discoveredResources` store, which
  //      rebuilds lazily in idle time on a turn-bucket dirty flag (warmed from game start in
  //      +page.svelte). Opening the tab just reads the ready cache instead of scanning on mount, so
  //      there's no click-to-open delay. `ensureDiscoveredResources()` is a first-open safety net.
  import { onMount } from 'svelte';
  import { uiState } from '$lib/stores/uiState';
  import {
    discoveredResources,
    ensureDiscoveredResources,
    type ResourceRow
  } from '$lib/stores/discoveredResources';
  import SearchBar from '../UI/SearchBar.svelte';

  onMount(ensureDiscoveredResources);

  let rows = $derived($discoveredResources);

  let typeCount = $derived(new Set(rows.map((r) => r.id)).size);
  // Total node count per resource type — shown (uniformly) on every row of that type, instead of the
  // per-tile node "amount" which varied meaninglessly row to row.
  let countById = $derived.by(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.id, (m.get(r.id) ?? 0) + 1);
    return m;
  });

  let query = $state('');
  let term = $derived(query.trim().toLowerCase());
  // Match the display name, the work-type, AND the internal id — so searching e.g. "grove" finds the
  // ancient-wood groves even though their display name is "Heartwood Tree" (id `heartwood_grove`).
  let filtered = $derived(
    term
      ? rows.filter(
          (r) => r.name.toLowerCase().includes(term) || r.type.includes(term) || r.id.includes(term)
        )
      : rows
  );

  // ── Virtualisation: render only the rows visible in the scroll viewport ──
  const ROW_H = 20; // px; must match .row-main height
  const OVERSCAN = 8; // extra rows above/below the viewport to hide scroll seams
  let scrollEl: HTMLDivElement | undefined = $state();
  let scrollTop = $state(0);
  let viewportH = $state(480);
  let startIdx = $derived(Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN));
  let endIdx = $derived(
    Math.min(filtered.length, startIdx + Math.ceil(viewportH / ROW_H) + OVERSCAN * 2)
  );
  let slice = $derived(filtered.slice(startIdx, endIdx));

  function onScroll() {
    if (scrollEl) scrollTop = scrollEl.scrollTop;
  }

  function focus(r: ResourceRow) {
    uiState.focusMapOn(r.x, r.y);
  }
</script>

<div class="explore-screen">
  <div class="screen-hdr">
    | DISCOVERED RESOURCES &nbsp;<span class="dim">{typeCount} types · {rows.length} nodes</span>
    <div class="hdr-tools">
      <SearchBar bind:value={query} placeholder="search resources…" />
      <button class="hdr-btn" onclick={() => uiState.setScreen('main')}>BACK</button>
    </div>
  </div>

  {#if rows.length === 0}
    <div class="empty">No resources discovered yet — send pawns out to explore the map.</div>
  {:else}
    <div class="table-hdr">
      <span class="col-name">RESOURCE</span>
      <span class="col-type">TYPE</span>
      <span class="col-amt">COUNT</span>
      <span class="col-pos">POS</span>
      <span class="col-count">{filtered.length}{term ? ` / ${rows.length}` : ''}</span>
    </div>

    {#if filtered.length === 0}
      <div class="empty">No resources match "{query}".</div>
    {:else}
      <!-- Virtualised scroll body: a tall spacer sized to the full list, with only the visible
           window of rows absolutely positioned inside it. -->
      <div class="scroll" bind:this={scrollEl} bind:clientHeight={viewportH} onscroll={onScroll}>
        <div class="spacer" style="height:{filtered.length * ROW_H}px">
          {#each slice as r, i (r.id + '@' + r.x + ',' + r.y)}
            <button
              class="row-main"
              style="top:{(startIdx + i) * ROW_H}px; height:{ROW_H}px"
              onclick={() => focus(r)}
              title="jump camera to resource"
            >
              <span class="col-name">
                <span class="glyph" style="color:{r.color}">◆</span>
                <span class="rname">{r.name}</span>
              </span>
              <span class="col-type">{r.type}</span>
              <span class="col-amt">×{countById.get(r.id) ?? 1}</span>
              <span class="col-pos">({r.x},{r.y})</span>
              <span class="col-count"></span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .explore-screen {
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
  .screen-hdr .dim {
    color: var(--text-muted);
    letter-spacing: 0;
  }
  .hdr-tools {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hdr-btn {
    padding: 2px 8px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    cursor: pointer;
  }
  .hdr-btn:hover {
    color: var(--text);
    border-color: var(--border-hi);
  }
  .empty {
    padding: 16px 12px;
    color: var(--text-muted);
  }
  .table-hdr {
    display: grid;
    grid-template-columns: 2.5fr 1.2fr 0.8fr 1fr 0.6fr;
    gap: 6px;
    padding: 3px 14px;
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .col-count {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px 12px;
  }
  .spacer {
    position: relative;
    width: 100%;
  }
  .row-main {
    position: absolute;
    left: 0;
    right: 0;
    display: grid;
    grid-template-columns: 2.5fr 1.2fr 0.8fr 1fr 0.6fr;
    gap: 6px;
    padding: 0 6px;
    align-items: center;
    background: var(--bg-panel);
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    cursor: pointer;
    text-align: left;
    box-sizing: border-box;
  }
  .row-main:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .col-name {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .glyph {
    font-size: 11px;
  }
  .rname {
    color: var(--text);
  }
  .col-type {
    color: var(--text-muted);
  }
  .col-amt,
  .col-pos {
    font-variant-numeric: tabular-nums;
  }
  .col-pos {
    color: var(--text-muted);
  }
</style>
