<script lang="ts">
  import { currentStockpile, currentRace, gameState } from '$lib/stores/gameState';
  import {
    collapsedResourceCategories,
    hideEmptyResourceCategories,
    hideSidebars,
    resourcesMinimized
  } from '$lib/stores/uiPrefs';
  import { itemService } from '$lib/game/services/ItemService';
  import { uiState } from '$lib/stores/uiState';
  import ScrollArea from './ScrollArea.svelte';

  type StockItem = { id: string; name: string; amount: number; color?: string };

  // Click a resource → jump the camera to a physical stack of it (like the chronicle jumps to an entity).
  // Cycles through every on-ground stack of that item on repeated clicks, so the player can sweep them all.
  const lastJumpIdx: Record<string, number> = {};
  function jumpToItemStack(itemId: string) {
    const stacks = ($gameState?.droppedItems ?? []).filter((d) => d.resourceId === itemId);
    if (stacks.length === 0) return; // nothing physical on the map (e.g. an abstract/derived total)
    stacks.sort((a, b) => a.y - b.y || a.x - b.x); // stable order so cycling is predictable
    const idx = ((lastJumpIdx[itemId] ?? -1) + 1) % stacks.length;
    lastJumpIdx[itemId] = idx;
    const s = stacks[idx];
    uiState.focusMapOn(s.x, s.y, true); // pan + select the tile → the item stack's card opens
  }

  // ── Live state ────────────────────────────────────────────────────────────
  const stockpile = $derived($currentStockpile as StockItem[]);
  const race = $derived($currentRace);
  // POPULATION reflects the live pawn count (race.population is stale).
  const population = $derived($gameState?.pawns?.length ?? 0);
  // Per-carcass-type average condition (0–100) — the INTACT bar's source. Computed worker-side and
  // shipped on the snapshot (`_carcassCondition`) so the per-unit arrays never cross the boundary.
  const carcassIntactness = $derived($gameState?._carcassCondition ?? {});

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
  // When "hide empty" is off, every known category is seeded (so empty ones still show).
  const groups = $derived.by(() => {
    const map = new Map<string, StockItem[]>();
    if (!$hideEmptyResourceCategories) {
      for (const cat of itemService.getAllCategories()) map.set(cat, []);
    }
    for (const item of stockpile) {
      const def = itemService.getItemById(item.id);
      if (def?.hidden) continue; // internal items (natural weapons…) never show as resources
      const cat = def?.category ?? 'other';
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

  function intactnessColor(pct: number): string {
    if (pct >= 70) return 'var(--pos)';
    if (pct >= 35) return '#e8b830';
    return 'var(--neg)';
  }
</script>

<aside class="sidebar" class:transparent={$hideSidebars} class:collapsed={$resourcesMinimized}>
  {#if $resourcesMinimized}
    <button
      class="restore-btn"
      title="Expand resources"
      aria-label="Expand resources"
      onclick={() => resourcesMinimized.set(false)}>›</button
    >
    <span class="collapsed-label">RESOURCES</span>
  {:else if race}
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
        <span class="hdr-btns">
          <button
            class="hdr-btn"
            class:active={$hideEmptyResourceCategories}
            title={$hideEmptyResourceCategories
              ? 'Showing only non-empty categories — click to show all'
              : 'Showing all categories — click to hide empty ones'}
            aria-label="Toggle empty categories"
            onclick={() => hideEmptyResourceCategories.toggle()}>∅</button
          >
          <button
            class="hdr-btn"
            title={allExpanded ? 'Collapse all categories' : 'Expand all categories'}
            aria-label={allExpanded ? 'Collapse all categories' : 'Expand all categories'}
            disabled={groups.length === 0}
            onclick={toggleAll}>{allExpanded ? '⊟' : '⊞'}</button
          >
          <button
            class="hdr-btn"
            title="Minimise resources panel"
            aria-label="Minimise resources panel"
            onclick={() => resourcesMinimized.set(true)}>‹</button
          >
        </span>
      </div>
    </div>

    <!-- Scrolling category list -->
    <ScrollArea class="res-area">
      {#each groups as [cat, items] (cat)}
        {@const open = !collapsed.has(cat)}
        <div
          class="cat-hdr"
          class:open
          onclick={() => toggleCat(cat)}
          role="button"
          tabindex="0"
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCat(cat)}
        >
          <span class="caret">{open ? '▾' : '▸'}</span>
          <span class="cat-name">{catLabel(cat)}</span>
          <span class="cat-count">{items.length}</span>
        </div>
        {#if open}
          {#if items.length === 0}
            <div class="cat-empty">none</div>
          {/if}
          {#each items as item (item.id)}
            <div
              class="res-row"
              onclick={() => jumpToItemStack(item.id)}
              role="button"
              tabindex="0"
              title="jump to a stack on the map"
              onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && jumpToItemStack(item.id)}
            >
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
    </ScrollArea>
  {:else}
    <div class="empty">loading...</div>
  {/if}
</aside>

<style>
  .sidebar {
    height: 100%;
    width: 100%;
    background: var(--bg-panel);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text);
    display: flex;
    flex-direction: column;
    overflow: hidden; /* the inner .res-area scrolls, not the whole sidebar */
  }

  /* ── Collapsed strip (minimised) — restore arrow + vertical label; the left-panel column is narrowed
     to match by +page.svelte (.left-panel.minimized). ── */
  .sidebar.collapsed {
    align-items: center;
    padding-top: 4px;
    gap: 6px;
  }
  .restore-btn {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--accent-hi);
    font-family: inherit;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }
  .restore-btn:hover {
    border-color: var(--border-hi);
    background: var(--bg-hover);
  }
  .collapsed-label {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    color: var(--accent-hi);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    user-select: none;
  }

  /* "Hide sidebars" mode (top-bar settings): the panel floats fully transparently over the map.
     No backdrop — the whole point is an unobstructed viewport. The text keeps its warm (ambient-
     tinted, brightness-lifted) hue, crispened by a thin 1px black outline and popped against the
     colourful map by a heavy dark drop shadow concentrated underneath the glyphs. Drop the title
     fill + separators. The aside box is click-through (set in +page) so empty gaps pass to the map;
     the content rows below re-enable pointer-events so they stay hoverable. */
  .sidebar.transparent {
    background: transparent;
    text-shadow:
      1px 0 0 #000,
      -1px 0 0 #000,
      0 1px 0 #000,
      0 -1px 0 #000,
      0 0 12px rgba(0, 0, 0, 0.95),
      0 0 20px rgba(0, 0, 0, 0.9),
      0 2px 4px rgba(0, 0, 0, 1),
      0 4px 6px rgba(0, 0, 0, 1),
      0 6px 10px rgba(0, 0, 0, 1),
      0 8px 16px rgba(0, 0, 0, 0.95),
      0 10px 24px rgba(0, 0, 0, 0.9);
  }
  .sidebar.transparent .section-hdr {
    background: transparent;
    border-bottom: none;
  }
  .sidebar.transparent .top-sep {
    border-top: none;
  }
  .sidebar.transparent .cat-hdr {
    border-bottom: none;
  }
  /* Re-enable pointer events on the actual content rows so they stay hoverable/clickable over the
     click-through aside; the empty gaps still pass clicks + hover through to the map. */
  .sidebar.transparent .row,
  .sidebar.transparent .res-row,
  .sidebar.transparent .cat-hdr,
  .sidebar.transparent button {
    pointer-events: auto;
  }
  /* Resting highlight behind every kingdom + resource line — the warm hover tint at ~1/3 strength,
     faded to transparent at the left/right edges so it's a soft band, not a hard box. Hover still
     brightens to full intensity (wins on specificity). Mirrors the chronicle entries. */
  .sidebar.transparent .row,
  .sidebar.transparent .res-row {
    background: linear-gradient(
      to right,
      transparent,
      color-mix(in srgb, var(--bg-hover) 33%, transparent) 10%,
      color-mix(in srgb, var(--bg-hover) 33%, transparent) 90%,
      transparent
    );
  }
  .sidebar.transparent .row:hover,
  .sidebar.transparent .res-row:hover {
    background: var(--bg-hover);
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

  .hdr-btns {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .hdr-btn {
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
  .hdr-btn:hover:not(:disabled) {
    color: var(--accent-hi);
    border-color: var(--accent-hi);
    background: var(--bg-hover);
  }
  .hdr-btn.active {
    color: var(--accent-hi);
    border-color: var(--accent-hi);
  }
  .hdr-btn:disabled {
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

  /* Scrolling resource area — the ScrollArea viewport (overflow + auto-hiding bar live in ScrollArea;
     its reserved gutter keeps right-aligned amounts from jumping when the thumb appears). */
  .sidebar :global(.res-area) {
    flex: 1;
    padding: 2px 0;
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
  .cat-empty {
    padding: 1px 8px 1px 24px;
    color: var(--text-muted);
    font-size: 9px;
    font-style: italic;
  }

  .res-row {
    position: relative; /* anchors the absolutely-positioned delta gutter */
    display: flex;
    align-items: baseline;
    padding: 1px 8px 1px 24px; /* left gutter holds the delta + nesting indent */
    gap: 3px;
    cursor: pointer; /* click → jump to a stack of this item on the map */
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
    font-family: var(--font-mono);
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
