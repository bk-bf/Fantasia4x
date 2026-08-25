<!--
  ScrollArea — the single scrollable viewport used across the app. Replaces the hand-rolled
  overflow+`::-webkit-scrollbar` blocks that had drifted apart per panel (ChroniclePanel,
  DebugLogScreen, ResourceSidebar, HealthPanel, SettingsModal — each a slightly different colour
  and its own `.scrolling` toggle).

  The bar is invisible at rest and reveals while the element is actively scrolling (and on hover),
  fading back out after a short idle — via the shared `autohideScroll` action. The gutter is
  reserved so revealing the thumb never reflows content (right-aligned amounts don't jump).

    <ScrollArea class="body">…</ScrollArea>           vertical (default)
    <ScrollArea horizontal>…tabs…</ScrollArea>         horizontal
    <ScrollArea bind:viewport={el}>…</ScrollArea>      for scroll-to-bottom / autoscroll

  `class` is forwarded to the viewport so the parent can size it (flex / max-height / padding) with
  a `:global(.your-class)` rule, since the element lives in this component's scope.
-->
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
    /* Any other DOM attribute / event handler (onwheel, onmousedown…) is forwarded to the viewport,
       so a caller can stop wheel/mouse events from leaking to the map behind a floating panel. */
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
    /* Reserve the gutter so the auto-hiding thumb never reflows content. */
    scrollbar-gutter: stable;
    /* Firefox (dev canary): thin, thumb hidden until scrolling. */
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    transition: scrollbar-color 0.25s ease;
  }
  .scroll-area.horizontal {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-gutter: auto;
  }
  /* `is-scrolling` is toggled at runtime by the autohideScroll action — :global so Svelte doesn't
     prune it as an "unused" selector (it never appears statically in the markup). */
  .scroll-area:global(.is-scrolling),
  .scroll-area:hover {
    scrollbar-color: var(--border-hi) transparent;
  }

  /* WebKit / Chromium (the Electron ship target). Track stays transparent; the thumb fades in only
     while scrolling or on hover, so the panel reads clean when static. */
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
