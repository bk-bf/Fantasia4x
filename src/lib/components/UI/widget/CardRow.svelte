<script lang="ts">
  import type { Snippet } from 'svelte';
  import ScrollArea from './ScrollArea.svelte';
  import ChromeButton from './ChromeButton.svelte';

  let { height, children }: { height: number; children: Snippet } = $props();

  const GAP = 6;

  let viewport = $state<HTMLElement | null>(null);
  let before = $state(false);
  let after = $state(false);
  let aim: number | null = null;

  function measure() {
    if (!viewport) return;
    const room = viewport.scrollWidth - viewport.clientWidth;
    before = viewport.scrollLeft > 1;
    after = viewport.scrollLeft < room - 1;
  }

  function step(dir: -1 | 1) {
    const card = viewport?.querySelector('.cards')?.firstElementChild;
    if (!viewport || !card) return;
    const unit = card.getBoundingClientRect().width + GAP;
    const last = Math.ceil((viewport.scrollWidth - viewport.clientWidth) / unit);
    aim = Math.max(0, Math.min(last, (aim ?? Math.round(viewport.scrollLeft / unit)) + dir));
    viewport.scrollTo({ left: aim * unit, behavior: 'smooth' });
  }

  $effect(() => {
    if (!viewport) return;
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    const cards = viewport.querySelector('.cards');
    if (cards) ro.observe(cards);
    measure();
    return () => ro.disconnect();
  });
</script>

<div class="row">
  <ScrollArea
    horizontal
    class="card-row"
    bind:viewport
    onscroll={measure}
    onscrollend={() => (aim = null)}
  >
    <div class="cards" style:grid-template-rows="{height}px">
      {@render children()}
    </div>
  </ScrollArea>
  {#if before}
    <span class="edge l"
      ><ChromeButton mini glyph="left" label="Earlier" onclick={() => step(-1)} /></span
    >
  {/if}
  {#if after}
    <span class="edge r"
      ><ChromeButton mini glyph="right" label="Later" onclick={() => step(1)} /></span
    >
  {/if}
</div>

<style>
  .row {
    position: relative;
    flex: none;
  }
  .row :global(.scroll-area.card-row) {
    container-type: inline-size;
    scrollbar-width: none;
  }
  .row :global(.scroll-area.card-row::-webkit-scrollbar) {
    display: none;
  }
  .cards {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: calc((100cqw - 24px) / 5);
    gap: 6px;
  }
  .edge {
    position: absolute;
    top: 50%;
    z-index: 3;
    transform: translateY(-50%);
    opacity: 0.7;
    transition: opacity 0.15s ease;
  }
  .edge:hover {
    opacity: 1;
  }
  .edge.l {
    left: 1px;
  }
  .edge.r {
    right: 1px;
  }
  .edge :global(.mini) {
    width: 18px;
    height: 26px;
    padding: 0;
  }
</style>
