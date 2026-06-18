<script lang="ts">
  // EXPLORE tab — a ledger of every resource node on each DISCOVERED tile (name, type, amount,
  // location). Modeled on EntityScreen (same table/row/focus-on-click pattern) with the shared
  // SearchBar (the Crafting tab's search filter) to narrow a long list by name.
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

  // Render cap — a forested map has thousands of nodes; the SearchBar narrows, and we never render
  // more than this many rows at once (with a footer when truncated) so the tab stays responsive.
  const MAX_ROWS = 300;

  function rgb(c: [number, number, number]): string {
    return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  }

  // One row per resource present on each discovered tile, sorted by name then position.
  let rows = $derived.by<ResourceRow[]>(() => {
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
  });

  let typeCount = $derived(new Set(rows.map((r) => r.id)).size);

  let query = $state('');
  let term = $derived(query.trim().toLowerCase());
  let filtered = $derived(
    term ? rows.filter((r) => r.name.toLowerCase().includes(term) || r.type.includes(term)) : rows
  );
  let shown = $derived(filtered.slice(0, MAX_ROWS));

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
  {:else if filtered.length === 0}
    <div class="empty">No resources match "{query}".</div>
  {:else}
    <div class="table">
      <div class="table-hdr">
        <span class="col-name">RESOURCE</span>
        <span class="col-type">TYPE</span>
        <span class="col-amt">AMOUNT</span>
        <span class="col-pos">POS</span>
      </div>

      {#each shown as r (r.id + '@' + r.x + ',' + r.y)}
        <div class="table-row">
          <button class="row-main" onclick={() => focus(r)} title="jump camera to resource">
            <span class="col-name">
              <span class="glyph" style="color:{r.color}">◆</span>
              <span class="rname">{r.name}</span>
            </span>
            <span class="col-type">{r.type}</span>
            <span class="col-amt">{r.amount}</span>
            <span class="col-pos">({r.x},{r.y})</span>
          </button>
        </div>
      {/each}

      {#if filtered.length > MAX_ROWS}
        <div class="more-row">
          showing {MAX_ROWS} of {filtered.length} — refine the search to see the rest
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .explore-screen {
    height: 100%;
    overflow-y: auto;
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
  .table {
    padding: 4px 8px 12px;
    display: flex;
    flex-direction: column;
  }
  .table-hdr {
    display: grid;
    grid-template-columns: 2.5fr 1.2fr 0.8fr 1fr;
    gap: 6px;
    padding: 3px 6px;
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
  }
  .table-row {
    display: flex;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
  }
  .row-main {
    flex: 1;
    display: grid;
    grid-template-columns: 2.5fr 1.2fr 0.8fr 1fr;
    gap: 6px;
    padding: 3px 6px;
    align-items: baseline;
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    cursor: pointer;
    text-align: left;
  }
  .row-main:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .col-name {
    display: inline-flex;
    align-items: center;
    gap: 4px;
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
  .more-row {
    padding: 6px;
    color: var(--text-muted);
    font-size: 10px;
    font-style: italic;
  }
</style>
