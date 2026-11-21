<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import PanelTitle from './PanelTitle.svelte';

  let {
    title,
    hint,
    tools,
    class: cls = '',
    children
  }: {
    title?: string;
    hint?: string;
    tools?: Snippet;
    class?: string;
    children: Snippet;
  } = $props();
</script>

<section class="well {cls}" {@attach chrome('well')}>
  {#if title || tools}
    <header>
      {#if title}<PanelTitle
          >{title}{#if hint}<em>{hint}</em>{/if}</PanelTitle
        >{/if}
      {@render tools?.()}
    </header>
  {/if}
  {@render children()}
</section>

<style>
  .well {
    min-width: 0;
    min-height: 0;
    padding: 8px 11px;
    font: 16px/18px var(--font-pixel);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }
  .well :global(h5) {
    margin: 6px 0 1px;
    font: inherit;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
</style>
