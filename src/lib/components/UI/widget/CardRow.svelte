<script lang="ts">
  import type { Snippet } from 'svelte';
  import ScrollArea from './ScrollArea.svelte';

  let { height, children }: { height: number; children: Snippet } = $props();
</script>

<ScrollArea horizontal class="card-row">
  <div class="cards" style:grid-template-rows="{height}px">
    {@render children()}
  </div>
</ScrollArea>

<style>
  :global(.scroll-area.card-row) {
    flex: none;
    container-type: inline-size;
  }
  .cards {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: calc((100cqw - 24px) / 5);
    gap: 6px;
  }
</style>
