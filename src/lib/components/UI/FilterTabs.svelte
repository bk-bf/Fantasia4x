<!-- FilterTabs.svelte — the pawn-tab style bar, reused as category/workshop filters.
     A single row that scrolls horizontally when there are more tabs than fit (no wrap). -->
<script lang="ts">
  export let tabs: { id: string; label: string; count?: number }[];
  export let selected: string;
  export let onSelect: (id: string) => void;
</script>

<nav class="filter-tabs">
  {#each tabs as t}
    <button class="filter-tab" class:active={selected === t.id} on:click={() => onSelect(t.id)}>
      {t.label}{#if t.count != null}<span class="ft-count">{t.count}</span>{/if}
    </button>
  {/each}
</nav>

<style>
  .filter-tabs {
    display: flex;
    flex-wrap: nowrap;
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    background: var(--bg);
    border-bottom: 2px solid var(--border-hi);
    scrollbar-width: none; /* Firefox — scroll, no visible bar */
    -ms-overflow-style: none;
  }
  .filter-tabs::-webkit-scrollbar {
    display: none; /* WebKit/Electron */
  }
  .filter-tab {
    flex-shrink: 0;
    white-space: nowrap;
    padding: 5px 10px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    cursor: pointer;
    text-transform: uppercase;
    transition: color 0.12s;
    position: relative;
  }
  .filter-tab:hover {
    color: var(--text);
  }
  .filter-tab.active {
    color: var(--accent-hi);
  }
  .filter-tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent-hi);
  }
  .ft-count {
    margin-left: 4px;
    color: var(--text-dim);
    font-size: 9px;
  }
</style>
