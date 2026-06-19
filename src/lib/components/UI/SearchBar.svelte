<script lang="ts" module>
  // Per-key persistence cache, module-scoped so it outlives any single SearchBar instance. Tabs are
  // unmounted when toggled closed, which would otherwise discard the typed filter; each usage passes a
  // stable `cacheKey` so its text is remembered (and kept distinct from other tabs') until cleared.
  const searchCache = new Map<string, string>();
</script>

<script lang="ts">
  // Shared live-search box — the "search recipes…" filter from the Crafting tab, extracted so the
  // Explore and Entity tabs (and anywhere else) reuse one styled input + clear button instead of
  // hand-rolling their own. Bind `value` and read it for filtering. Pass `cacheKey` to have the box
  // remember its text across the tab being toggled closed/open (persists until the user clears it).
  // `variant`: 'box' = standalone bordered field (Explore/Entity tabs). 'inline' = borderless field
  // with a left divider, made to sit flush inside a filter bar next to FilterTabs (Crafting/Building
  // tabs) — matches the look those tabs hand-rolled before adopting this shared component.
  let {
    value = $bindable(''),
    placeholder = 'search…',
    cacheKey = '',
    variant = 'box'
  }: {
    value?: string;
    placeholder?: string;
    cacheKey?: string;
    variant?: 'box' | 'inline';
  } = $props();

  // Restore the cached text once on mount, then persist every change. The one-shot restore guard
  // returns before persisting so the initial empty value can't overwrite a remembered filter.
  let restored = false;
  $effect(() => {
    if (!restored) {
      restored = true;
      const cached = cacheKey ? searchCache.get(cacheKey) : undefined;
      if (cacheKey && !value && cached) {
        value = cached;
        return;
      }
    }
    if (cacheKey) searchCache.set(cacheKey, value);
  });
</script>

<div class="search-bar" class:inline={variant === 'inline'}>
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

  /* Inline variant — flush in a filter bar (Crafting/Building): no field border, a left divider
     separating it from the FilterTabs, and a focus state that only shifts the background. */
  .search-bar.inline {
    border-left: 1px solid var(--border);
  }
  .search-bar.inline input {
    border: none;
    padding: 4px 18px 4px 8px;
    width: 150px;
  }
  .search-bar.inline input:focus {
    border-color: transparent;
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
