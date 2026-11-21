<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section>
  <h5>{title}</h5>
  {@render children()}
</section>

<style>
  section {
    break-inside: avoid;
    margin-bottom: 6px;
  }
  h5 {
    margin: 0 0 1px;
    font-weight: normal;
    font-size: inherit;
    text-transform: uppercase;
    letter-spacing: 1.6px;
    color: var(--accent-hi);
  }
</style>
