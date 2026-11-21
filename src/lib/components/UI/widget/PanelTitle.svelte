<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<h3>{@render children()}</h3>

<style>
  h3 {
    margin: 0;
    font: calc(20px * var(--head-size, 1)) / 20px var(--font-head);
    font-weight: normal;
    letter-spacing: 1px;
    text-transform: var(--head-case, uppercase);
    color: var(--accent-hi);
    white-space: nowrap;
  }
  :global(:root[data-theme='timber']) h3 {
    text-shadow: 1px 1px 0 #0b0806;
  }
  :global(:root[data-theme='vellum']) h3 {
    letter-spacing: 0;
    color: var(--text);
  }
  :global(:root[data-theme='vellum']) h3::first-letter {
    color: var(--accent);
  }
</style>
