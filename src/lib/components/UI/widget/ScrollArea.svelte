<script lang="ts">
  import type { Snippet } from 'svelte';
  import { autohideScroll } from '$lib/actions/autohideScroll';

  let {
    class: className = '',
    horizontal = false,
    idleMs = 700,
    viewport = $bindable<HTMLElement | null>(null),
    children,
    ...rest
  }: {
    class?: string;
    horizontal?: boolean;
    idleMs?: number;
    viewport?: HTMLElement | null;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<div
  bind:this={viewport}
  {...rest}
  class="scroll-area {className}"
  class:horizontal
  use:autohideScroll={idleMs}
>
  {@render children?.()}
</div>

<style>
  .scroll-area {
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    transition: scrollbar-color 0.25s ease;
  }
  .scroll-area.horizontal {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-gutter: auto;
  }
  .scroll-area:global(.is-scrolling),
  .scroll-area:hover {
    scrollbar-color: var(--border-hi) transparent;
  }

  .scroll-area::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  .scroll-area::-webkit-scrollbar-track {
    background: transparent;
  }
  .scroll-area::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 4px;
    transition: background 0.25s ease;
  }
  .scroll-area:global(.is-scrolling)::-webkit-scrollbar-thumb,
  .scroll-area:hover::-webkit-scrollbar-thumb {
    background: var(--border-hi);
  }
  .scroll-area::-webkit-scrollbar-thumb:hover {
    background: var(--accent-hi);
  }
</style>
