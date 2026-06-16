<script lang="ts">
  import { currentStockpile, currentRace, gameState } from '$lib/stores/gameState';
  import { collapsedResourceCategories } from '$lib/stores/uiPrefs';
  import { itemService } from '$lib/game/services/ItemService';

  type StockItem = { id: string; name: string; amount: number; color?: string };

  // ── Live state ────────────────────────────────────────────────────────────
  const stockpile = $derived($currentStockpile as StockItem[]);
  const race = $derived($currentRace);
  // POPULATION reflects the live pawn count (race.population is stale).
  const population = $derived($gameState?.pawns?.length ?? 0);
  const carcassIntactness = $derived($gameState?.carcassIntactness ?? {});

  // ── Recent +/- deltas (fade out after 2.5s) ────────────────────────────────
  let itemChanges = $state<Record<string, number>>({});
  const prevAmounts: Record<string, number> = {};
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};

  $effect(() => {
    for (const ni of stockpile) {
      const old = prevAmounts[ni.id];
      if (old !== undefined && old !== ni.amount) {
        const delta = ni.amount - old;
        if (delta !== 0) {
          itemChanges = { ...itemChanges, [ni.id]: delta };
          clearTimeout(timers[ni.id]);
          timers[ni.id] = setTimeout(() => {
            const { [ni.id]: _, ...rest } = itemChanges;
            itemChanges = rest;
          }, 2500);
        }
      }
      prevAmounts[ni.id] = ni.amount;
    }
  });

  // ── Group resources by their raw items.jsonc `category` (data-driven) ───────
  const groups = $derived.by(() => {
    const map = new Map<string, StockItem[]>();
    for (const item of stockpile) {
      const cat = itemService.getItemById(item.id)?.category ?? 'other';
      (map.get(cat) ?? map.set(cat, []).get(cat)!).push(item);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  function catLabel(cat: string): string {
    return cat.replace(/_/g, ' ').toUpperCase();
  }

  // ── Collapse state: persisted set of COLLAPSED categories (default: expanded) ─
  const collapsed = $derived(new Set($collapsedResourceCategories));
  const allExpanded = $derived(groups.length > 0 && groups.every(([cat]) => !collapsed.has(cat)));

  function toggleCat(cat: string) {
    collapsedResourceCategories.toggle(cat);
  }

  function toggleAll() {
    if (allExpanded) collapsedResourceCategories.setAll(groups.map(([cat]) => cat));
    else collapsedResourceCategories.clear();
  }

  // ── Scrollbar: only visible while actively scrolling ────────────────────────
  let scrolling = $state(false);
  let scrollTimer: ReturnType<typeof setTimeout>;
  function onScroll() {
    scrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => (scrolling = false), 700);
  }

  function intactnessColor(pct: number): string {
    if (pct >= 70) return 'var(--pos)';
    if (pct >= 35) return '#e8b830';
    return 'var(--neg)';
  }
</script>

<aside class="sidebar">
  {#if race}
    <!-- Sticky header block: Kingdom + Resources header never scroll away. -->
    <div class="sticky-top">
      <div class="section-hdr">| KINGDOM</div>
      <div class="rows">
        <div class="row">
          <span class="lbl">SETTLEMENT</span>
          <span class="val hi">{race.name}</span>
        </div>
        <div class="row">
          <span class="lbl">POPULATION</span>
          <span class="val">{population}</span>
        </div>
      </div>

      <div class="section-hdr top-sep res-hdr">
        <span>| RESOURCES</span>
        <button
          class="toggle-all"
          title={allExpanded ? 'Collapse all categories' : 'Expand all categories'}
          aria-label={allExpanded ? 'Collapse all categories' : 'Expand all categories'}
          disabled={groups.length === 0}
          onclick={toggleAll}>{allExpanded ? '⊟' : '⊞'}</button
        >
      </div>
    </div>

    <!-- Scrolling category list -->
    <div class="res-area" class:scrolling onscroll={onScroll}>
      {#if groups.length === 0}
        <div class="empty">no resources gathered</div>
      {:else}
        {#each groups as [cat, items] (cat)}
          {@const open = !collapsed.has(cat)}
          <div class="cat-hdr" class:open onclick={() => toggleCat(cat)} role="button" tabindex="0"
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCat(cat)}>
            <span class="caret">{open ? '▾' : '▸'}</span>
            <span class="cat-name">{catLabel(cat)}</span>
            <span class="cat-count">{items.length}</span>
          </div>
          {#if open}
            {#each items as item (item.id)}
              <div class="res-row">
                {#if itemChanges[item.id]}
                  <span
                    class="delta"
                    class:pos={itemChanges[item.id] > 0}
                    class:neg={itemChanges[item.id] < 0}
                  >
                    {itemChanges[item.id] > 0 ? '+' : ''}{Math.floor(itemChanges[item.id])}
                  </span>
                {/if}
                <span class="res-name">{item.name}</span>
                <span class="dots"></span>
                <span class="res-amt" style="color:{item.color || 'var(--text)'}">
                  {Math.floor(item.amount)}
                </span>
              </div>
              {#if itemService.getItemById(item.id)?.isCarcass}
                {@const pct = Math.round(carcassIntactness[item.id] ?? 100)}
                <div class="carcass-row">
                  <span class="intactness-lbl" style="color:{intactnessColor(pct)}">INTACT</span>
                  <span class="intactness-bar">
                    {#each Array(10) as _, i}
                      <span style="color:{intactnessColor(pct)}"
                        >{i < Math.round(pct / 10) ? '█' : '░'}</span
                      >
                    {/each}
                  </span>
                  <span class="intactness-pct" style="color:{intactnessColor(pct)}">{pct}%</span>
                </div>
              {/if}
            {/each}
          {/if}
        {/each}
      {/if}
    </div>
  {:else}
    <div class="empty">loading...</div>
  {/if}
</aside>

<style>
  .sidebar {
    height: 100%;
    width: 100%;
    background: var(--bg-panel);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: var(--text);
    display: flex;
    flex-direction: column;
    overflow: hidden; /* the inner .res-area scrolls, not the whole sidebar */
  }

  /* Kingdom + Resources header stay pinned at the top. */
  .sticky-top {
    flex-shrink: 0;
  }

  .section-hdr {
    padding: 4px 8px 3px;
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  .res-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .toggle-all {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    padding: 0;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font-family: inherit;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }
  .toggle-all:hover:not(:disabled) {
    color: var(--accent-hi);
    border-color: var(--accent-hi);
    background: var(--bg-hover);
  }
  .toggle-all:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .top-sep {
    margin-top: 4px;
    border-top: 1px solid var(--border);
  }

  .rows {
    padding: 2px 0;
  }

  .row {
    display: flex;
    align-items: baseline;
    padding: 2px 8px;
    gap: 4px;
  }
  .row:hover {
    background: var(--bg-hover);
  }

  .lbl {
    color: var(--text-dim);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .val {
    margin-left: auto;
    color: var(--text);
    text-align: right;
    white-space: nowrap;
  }
  .val.hi {
    color: var(--accent-hi);
  }

  /* Scrolling resource area */
  .res-area {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
    /* Reserve the scrollbar gutter at all times so content width never changes when the
       (auto-hiding) scrollbar appears/disappears — otherwise right-aligned amounts jump. */
    scrollbar-gutter: stable;
    /* Firefox: scrollbar hidden until scrolling. */
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    transition: scrollbar-color 0.3s ease;
  }
  .res-area.scrolling {
    scrollbar-color: var(--border) transparent;
  }
  /* WebKit: thumb only paints while scrolling. */
  .res-area::-webkit-scrollbar {
    width: 8px;
  }
  .res-area::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 4px;
  }
  .res-area.scrolling::-webkit-scrollbar-thumb {
    background: var(--border);
  }

  /* Category block header (collapsible — nesting mirrors the chronicle panel). */
  .cat-hdr {
    display: flex;
    align-items: baseline;
    gap: 5px;
    padding: 3px 8px;
    cursor: pointer;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
    user-select: none;
  }
  .cat-hdr:hover {
    background: var(--bg-hover);
  }
  .cat-hdr.open {
    color: var(--accent-hi);
  }
  .caret {
    flex-shrink: 0;
    width: 8px;
    color: var(--text-muted);
  }
  .cat-hdr.open .caret {
    color: var(--accent-hi);
  }
  .cat-name {
    letter-spacing: 0.05em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cat-count {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 9px;
    flex-shrink: 0;
  }

  .res-row {
    position: relative; /* anchors the absolutely-positioned delta gutter */
    display: flex;
    align-items: baseline;
    padding: 1px 8px 1px 24px; /* left gutter holds the delta + nesting indent */
    gap: 3px;
  }
  .res-row:hover {
    background: var(--bg-hover);
  }

  .res-name {
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
    font-size: 11px;
  }

  .dots {
    flex: 1;
    border-bottom: 1px dotted var(--text-muted);
    margin: 0 3px 2px;
    min-width: 4px;
  }

  .res-amt {
    font-weight: bold;
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 10px;
  }

  /* Delta floats in the left gutter so it never reflows the name/amount. */
  .delta {
    position: absolute;
    left: 3px;
    top: 1px;
    font-size: 9px;
    font-weight: bold;
    white-space: nowrap;
    pointer-events: none;
    animation: fadeout 2.5s ease-out forwards;
  }
  .delta.pos {
    color: var(--pos);
  }
  .delta.neg {
    color: var(--neg);
  }

  @keyframes fadeout {
    0% {
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  .empty {
    padding: 8px;
    color: var(--text-muted);
    font-size: 9px;
    font-style: italic;
  }

  .carcass-row {
    display: flex;
    align-items: center;
    padding: 0 8px 2px 24px;
    gap: 4px;
    font-size: 9px;
    font-family: 'Courier New', monospace;
  }

  .intactness-lbl {
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.03em;
  }

  .intactness-bar {
    letter-spacing: -1px;
    flex-shrink: 0;
  }

  .intactness-pct {
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 9px;
  }
</style>
