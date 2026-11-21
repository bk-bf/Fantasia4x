<script lang="ts">
  import type { Snippet } from 'svelte';

  let { list, detail }: { list: Snippet; detail: Snippet } = $props();
</script>

<div class="list-detail">
  <nav class="list">{@render list()}</nav>
  <div class="detail">{@render detail()}</div>
</div>

<style>
  .list-detail {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 190px 1fr;
    gap: 8px;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  .list,
  .detail {
    min-height: 0;
    overflow-y: auto;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .detail > :global(*) {
    flex: none;
  }
  .detail :global(.lore) {
    margin: 0;
    color: var(--text-dim);
    line-height: 17px;
  }
  .detail :global(.g2) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
</style>
