<script lang="ts">
  import { onMount } from 'svelte';
  import { uiState } from '$lib/stores/uiState';
  import {
    discoveredResources,
    ensureDiscoveredResources,
    type ResourceRow
  } from '$lib/stores/discoveredResources';
  import { WORK_CATEGORIES } from '$lib/game/core/defs/work';
  import { chrome } from '$lib/pixelArt/chrome';
  import SearchBar from '../UI/widget/SearchBar.svelte';
  import SpriteIcon from '../UI/widget/SpriteIcon.svelte';
  import { useWindowBar } from '../UI/window/windowContext';

  onMount(ensureDiscoveredResources);

  let rows = $derived($discoveredResources);

  let typeCount = $derived(new Set(rows.map((r) => r.id)).size);
  let countById = $derived.by(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.id] = (m[r.id] ?? 0) + 1;
    return m;
  });

  const TYPE_NAME = new Map(WORK_CATEGORIES.map((c) => [c.id, c.name.toLowerCase()]));
  const typeName = (type: string) => TYPE_NAME.get(type) ?? type;
  const TYPE_TONE: Record<string, string> = {
    mining: 'var(--cold)',
    digging: 'var(--text-dim)',
    lair: 'var(--neg)',
    woodcutting: 'var(--pos)'
  };

  let query = $state('');
  let term = $derived(query.trim().toLowerCase());
  let filtered = $derived(
    term
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(term) ||
            typeName(r.type).includes(term) ||
            r.id.includes(term)
        )
      : rows
  );

  const ROW_H = 22;
  const OVERSCAN = 8;
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

  useWindowBar({ tools: searchTool });
</script>

{#snippet searchTool()}
  <SearchBar variant="well" bind:value={query} placeholder="search resources…" cacheKey="explore" />
{/snippet}

<div class="explore">
  <p class="sub">
    {typeCount} types · {rows.length} nodes{#if term}&nbsp;· {filtered.length} found{/if}
  </p>

  {#if rows.length === 0}
    <p class="empty">No resources discovered yet — send pawns out to explore the map.</p>
  {:else if filtered.length === 0}
    <p class="empty">No resources match "{query}".</p>
  {:else}
    <div class="table" {@attach chrome('well')}>
      <div class="tr th">
        <span></span><span>Resource</span><span>Type</span><span>Count</span><span>Pos</span>
      </div>
      <div class="scroll" bind:this={scrollEl} bind:clientHeight={viewportH} onscroll={onScroll}>
        <div class="spacer" style:height="{filtered.length * ROW_H}px">
          {#each slice as r, i (r.id + '@' + r.x + ',' + r.y)}
            <button
              class="tr row"
              style:top="{(startIdx + i) * ROW_H}px"
              onclick={() => focus(r)}
              title="jump camera to resource"
            >
              <span class="thing">
                <SpriteIcon resource={r.id} px={18}>
                  {#snippet fallback()}
                    <i class="dia" style:color={TYPE_TONE[r.type] ?? 'var(--accent-hi)'}>◆</i>
                  {/snippet}
                </SpriteIcon>
              </span>
              <span class="name">{r.name}</span>
              <em>{typeName(r.type)}</em>
              <b>×{countById[r.id] ?? 1}</b>
              <em>({r.x},{r.y})</em>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .explore {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  .sub {
    margin: -4px 0 5px;
    color: var(--text-dim);
  }
  .empty {
    padding: 12px 4px;
    color: var(--text-muted);
  }
  .table {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 3px 2px;
  }
  .tr {
    display: grid;
    grid-template-columns: 28px 2.4fr 1.2fr 0.7fr 1fr;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 6px 0 2px;
    white-space: nowrap;
  }
  .tr > * {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .th {
    flex: none;
    height: 20px;
    color: var(--accent-hi);
    letter-spacing: 1.4px;
    text-transform: uppercase;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .spacer {
    position: relative;
  }
  .row {
    position: absolute;
    left: 0;
    right: 0;
    border: 0;
    background: none;
    color: var(--text-dim);
    font: inherit;
    letter-spacing: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    box-shadow: inset 0 0 0 1px var(--accent-hi);
  }
  .thing {
    display: grid;
    place-items: center;
  }
  .name {
    color: var(--text);
  }
  .dia,
  .row em {
    font-style: normal;
  }
  .row b {
    font-weight: normal;
    font-variant-numeric: tabular-nums;
  }
</style>
