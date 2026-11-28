<script lang="ts" module>
  const searchCache = new Map<string, string>();
</script>

<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';
  import PixelGlyph from './PixelGlyph.svelte';

  let {
    value = $bindable(''),
    placeholder = 'search…',
    cacheKey = '',
    variant = 'box'
  }: {
    value?: string;
    placeholder?: string;
    cacheKey?: string;
    variant?: 'box' | 'inline' | 'well';
  } = $props();

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

{#snippet field()}
  <input type="text" {placeholder} bind:value spellcheck="false" autocomplete="off" />
  {#if value}
    <button class="search-clear" title="clear search" onclick={() => (value = '')}>×</button>
  {/if}
{/snippet}

{#if variant === 'well'}
  <label class="search-bar well" {@attach chrome('well')}>
    <PixelGlyph name="eye" />
    {@render field()}
  </label>
{:else}
  <div class="search-bar" class:inline={variant === 'inline'}>
    {@render field()}
  </div>
{/if}

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
    font-family: var(--font-mono);
    font-size: 11px;
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
  .search-bar.well {
    gap: 6px;
    width: 190px;
    height: 20px;
    padding: 0 7px;
    color: var(--text-muted);
  }
  .search-bar.well input {
    flex: 1;
    min-width: 0;
    width: auto;
    padding: 0 14px 0 0;
    border: none;
    background: none;
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  .search-bar.well input:focus {
    background: none;
  }
  .search-clear {
    position: absolute;
    right: 4px;
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
  }
  .search-clear:hover {
    color: var(--accent-hi);
  }
</style>
