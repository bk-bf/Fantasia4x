<script lang="ts">
  import type { Snippet } from 'svelte';

  let { fill = false, children }: { fill?: boolean; children: Snippet } = $props();
</script>

<div class="pane" class:fill>{@render children()}</div>

<style>
  .pane {
    font: 16px/18px var(--font-pixel);
    color: var(--text);
  }
  .fill {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .fill > :global(*) {
    flex: none;
  }
  .fill > :global(.ifc.fill) {
    flex: 1;
  }
  .pane :global(h5) {
    margin: 6px 0 1px;
    font: inherit;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  .pane :global(h5:first-child) {
    margin-top: 0;
  }
  .pane :global(.sub) {
    margin: 0 0 2px;
    color: var(--text-dim);
  }
  .pane :global(.warn) {
    margin: 2px 0;
    color: var(--ember);
  }
  .pane :global(.minis) {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }
  .pane :global(.minis .cbtn) {
    flex: 1;
  }
</style>
