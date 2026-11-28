<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';

  let {
    tabs,
    selected,
    onSelect
  }: {
    tabs: { id: string; label: string; count?: number }[];
    selected: string;
    onSelect: (id: string) => void;
  } = $props();
</script>

<nav class="filter-tabs">
  {#each tabs as t (t.id)}
    <button
      class="filter-tab"
      class:active={selected === t.id}
      onclick={() => onSelect(t.id)}
      {@attach chrome(selected === t.id ? 'cellOn' : 'cell')}
    >
      <span>{t.label}</span>{#if t.count != null}<span class="ft-count">{t.count}</span>{/if}
    </button>
  {/each}
</nav>

<style>
  .filter-tabs {
    display: flex;
    flex-wrap: wrap;
    flex-shrink: 0;
    gap: 2px;
  }
  .filter-tab {
    flex-shrink: 0;
    height: 20px;
    padding: 0 9px;
    border: 0;
    background: none;
    color: var(--text-dim);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 1.4px;
    text-transform: uppercase;
    white-space: nowrap;
    cursor: pointer;
  }
  .filter-tab:hover {
    color: var(--text);
  }
  .filter-tab.active {
    color: var(--ember);
  }
  .ft-count {
    margin-left: 4px;
    color: var(--text-muted);
  }
</style>
