<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';

  let {
    on = false,
    title,
    onclick,
    children
  }: { on?: boolean; title?: string; onclick: () => void; children: Snippet } = $props();
</script>

<button
  class="list-chip"
  class:on
  aria-pressed={on}
  {title}
  {onclick}
  {@attach chrome(on ? 'cellOn' : 'cell')}
>
  {@render children()}
</button>

<style>
  .list-chip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: 4px 9px 5px;
    border: 0;
    background: none;
    color: var(--text-muted);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
    text-align: left;
    cursor: pointer;
  }
  .list-chip > :global(b) {
    font-weight: normal;
    color: var(--text);
  }
  .list-chip > :global(em) {
    font-style: normal;
    color: var(--text-dim);
  }
  .list-chip.on,
  .list-chip.on > :global(*) {
    color: var(--ember);
  }
</style>
