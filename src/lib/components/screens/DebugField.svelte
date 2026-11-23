<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';

  let { children }: { children: Snippet } = $props();
</script>

<span class="field" {@attach chrome('well')}>{@render children()}</span>

<style>
  .field {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 20px;
    min-width: 0;
    padding: 0 7px;
    color: var(--text-muted);
  }
  .field :global(:is(select, input)) {
    flex: 1;
    min-width: 0;
    height: 18px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
    outline: none;
  }
  .field :global(select) {
    cursor: pointer;
  }
  .field :global(option) {
    background: var(--bg-panel);
    color: var(--text);
  }
  .field :global(input[type='number']) {
    flex: none;
    width: 3.2em;
    appearance: textfield;
  }
</style>
