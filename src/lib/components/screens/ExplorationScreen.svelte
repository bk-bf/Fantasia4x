<script lang="ts">
  // EXPLORE tab — a ledger of EVERY resource node on each DISCOVERED tile (name, type, amount,
  // location). Modeled on EntityScreen (same table/row/focus-on-click pattern) with the shared
  // SearchBar (the Crafting tab's search filter).
  //
  // Scale: a forested map has tens of thousands of nodes, so this does two things to stay cheap:
  //   1. Virtualised rendering — only the rows inside the scroll viewport become DOM (a windowed
  //      slice over a tall spacer), so the full 20k+ list scrolls smoothly without 20k DOM nodes.
  //   2. Throttled rebuild — the O(map) scan runs at most once every REFRESH_TURNS turns (cached in
  //      `rows`), not every tick. And because the tab only mounts while open, the scan/effect don't
  //      run at all when you're not looking at it — it unloads itself.
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
  import SearchBar from '../UI/SearchBar.svelte';

  interface ResourceRow {
    id: string;
    name: string;
    color: string;
    type: string; // work category (woodcutting / mining / foraging …)
    amount: number;
    x: number;
    y: number;
  }

  function rgb(c: [number, number, number]): string {
    return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  }

  // One row per resource present on each discovered tile, sorted by name then position.
  function buildRows(): ResourceRow[] {
    const out: ResourceRow[] = [];
    for (const line of $gameState.worldMap ?? []) {
      for (const t of line) {
        if (!t.discovered || !t.resources) continue;
        for (const id in t.resources) {
          const amount = t.resources[id];
          if (amount <= 0) continue;
          const def = resourceObjectService.getById(id);
          out.push({
            id,
            name: def?.displayName ?? id.replace(/_/g, ' '),
            color: def?.fg ? rgb(def.fg) : 'var(--text-dim)',
            type: def?.interaction?.workCategory ?? '—',
            amount,
            x: t.x,
            y: t.y
          });
        }
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name) || a.x - b.x || a.y - b.y);
    return out;
  }

  // Cached scan. The effect re-runs on every $gameState change but bails in O(1) unless the turn has
  // advanced into a new REFRESH_TURNS bucket — so the heavy scan happens ~once per 15 turns while the
  // tab is open, and never while it's closed (the component is destroyed).
  const REFRESH_TURNS = 15;
  let rows = $state<ResourceRow[]>([]);
  let lastBucket = -1;
  $effect(() => {
    const bucket = Math.floor(($gameState.turn ?? 0) / REFRESH_TURNS);
    if (bucket === lastBucket) return;
    lastBucket = bucket;
    rows = buildRows();
  });

  let typeCount = $derived(new Set(rows.map((r) => r.id)).size);

  let query = $state('');
  let term = $derived(query.trim().toLowerCase());
  let filtered = $derived(
    term ? rows.filter((r) => r.name.toLowerCase().includes(term) || r.type.includes(term)) : rows
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
      <span class="col-amt">AMOUNT</span>
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
              <span class="col-amt">{r.amount}</span>
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
