<script lang="ts">
  // Shared live-search box — the "search recipes…" filter from the Crafting tab, extracted so the
  // Explore and Entity tabs (and anywhere else) reuse one styled input + clear button instead of
  // hand-rolling their own. Bind `value` and read it for filtering.
  let {
    value = $bindable(''),
    placeholder = 'search…'
  }: {
    value?: string;
    placeholder?: string;
  } = $props();
</script>

<div class="search-bar">
  <input type="text" {placeholder} bind:value spellcheck="false" autocomplete="off" />
  {#if value}
    <button class="search-clear" title="clear search" onclick={() => (value = '')}>×</button>
  {/if}
</div>

<style>
  .search-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    position: relative;
  }
  .search-bar input {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    letter-spacing: 0.04em;
    padding: 3px 18px 3px 8px;
    width: 160px;
    outline: none;
  }
  .search-bar input::placeholder {
    color: var(--text-muted);
  }
  .search-bar input:focus {
    border-color: var(--border-hi);
    background: var(--bg-active, var(--bg-panel));
  }
  .search-clear {
    position: absolute;
    right: 4px;
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 13px;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
  }
  .search-clear:hover {
    color: var(--accent-hi);
  }
</style>
