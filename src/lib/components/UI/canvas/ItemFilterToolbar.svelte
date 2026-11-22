<script lang="ts">
  import { filterClipboard } from '$lib/stores/filterClipboard.js';

  let {
    query = $bindable(''),
    anyExpanded,
    toggleCollapseAll,
    copyFilter,
    pasteFilter
  }: {
    query?: string;
    anyExpanded: boolean;
    toggleCollapseAll: () => void;
    copyFilter: () => void;
    pasteFilter: () => void;
  } = $props();
</script>

<div class="ifc-toolbar">
  <input
    class="ifc-search"
    type="text"
    placeholder="search…"
    bind:value={query}
    onkeydown={(e) => e.stopPropagation()}
  />
  <button
    type="button"
    class="ifc-icon-btn"
    title={anyExpanded ? 'Collapse all' : 'Expand all'}
    onclick={toggleCollapseAll}>{anyExpanded ? '⊟' : '⊞'}</button
  >
  <button type="button" class="ifc-icon-btn" title="Copy filter" onclick={copyFilter}>⧉</button>
  <button
    type="button"
    class="ifc-icon-btn"
    title="Paste filter"
    disabled={$filterClipboard === null}
    onclick={pasteFilter}>⎘</button
  >
</div>

<style>
  .ifc-toolbar {
    display: flex;
    align-items: stretch;
    gap: 3px;
    margin-bottom: 3px;
  }
  .ifc-search {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 4px;
  }
  .ifc-search::placeholder {
    color: var(--text-muted);
  }
  .ifc-search:focus {
    outline: none;
    border-color: var(--border-hi);
    background: var(--bg);
    color: var(--accent-hi);
  }
  .ifc-icon-btn {
    flex: 0 0 auto;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1;
    padding: 0 5px;
    cursor: pointer;
  }
  .ifc-icon-btn:hover:not(:disabled) {
    background: var(--bg-active);
    border-color: var(--border-hi);
    color: var(--accent-hi);
  }
  .ifc-icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
