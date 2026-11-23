<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';

  let {
    class: cls = '',
    transform,
    w = $bindable(0),
    h = $bindable(0),
    children
  }: {
    class?: string;
    transform?: string;
    w?: number;
    h?: number;
    children: Snippet;
  } = $props();
</script>

<div
  class="tagbar {cls}"
  role="presentation"
  style:transform
  bind:offsetWidth={w}
  bind:offsetHeight={h}
  onmousedown={(e) => e.stopPropagation()}
  onmouseup={(e) => e.stopPropagation()}
  {@attach chrome('tag')}
>
  {@render children()}
</div>

<style>
  .tagbar {
    position: absolute;
    z-index: 11;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 8px 6px 11px;
    white-space: nowrap;
    color: var(--text-dim);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
    pointer-events: auto;
  }
  .tagbar :global(b) {
    font-weight: normal;
    color: var(--text);
  }
</style>
