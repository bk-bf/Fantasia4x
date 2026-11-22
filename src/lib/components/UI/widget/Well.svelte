<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import PanelTitle from './PanelTitle.svelte';
  import ScrollArea from './ScrollArea.svelte';

  let {
    title,
    hint,
    tools,
    class: cls = '',
    scroll = false,
    children
  }: {
    title?: string;
    hint?: string;
    tools?: Snippet;
    class?: string;
    scroll?: boolean;
    children: Snippet;
  } = $props();
</script>

<section class="well {cls}" class:scroll {@attach chrome('well')}>
  {#if title || tools}
    <header>
      {#if title}<PanelTitle
          >{title}{#if hint}<em>{hint}</em>{/if}</PanelTitle
        >{/if}
      {@render tools?.()}
    </header>
  {/if}
  {#if scroll}
    <ScrollArea class="well-scroll">{@render children()}</ScrollArea>
  {:else}
    {@render children()}
  {/if}
</section>

<style>
  .well {
    min-width: 0;
    min-height: 0;
    padding: 8px 11px;
    font: 16px/18px var(--font-pixel);
  }
  .scroll {
    display: flex;
    flex-direction: column;
  }
  .scroll > :global(.well-scroll) {
    flex: 1;
    min-height: 0;
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
