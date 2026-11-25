<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import PanelTitle from '../widget/PanelTitle.svelte';

  let {
    title,
    well,
    onwell,
    wellLabel,
    lines,
    children,
    verbs
  }: {
    title: string;
    well: Snippet;
    onwell?: () => void;
    wellLabel?: string;
    lines?: Snippet;
    children?: Snippet;
    verbs?: Snippet;
  } = $props();
</script>

<section class="card" {@attach chrome('card')}>
  <div class="c-top">
    {#if onwell}
      <button class="well" aria-label={wellLabel} onclick={onwell} {@attach chrome('well')}>
        {@render well()}
      </button>
    {:else}
      <span class="well" {@attach chrome('well')}>{@render well()}</span>
    {/if}
    <div class="c-id">
      <PanelTitle>{title}</PanelTitle>
      {@render lines?.()}
    </div>
  </div>
  {@render children?.()}
  {#if verbs}<div class="c-verbs">{@render verbs()}</div>{/if}
</section>

<style>
  .card {
    width: 344px;
    box-sizing: border-box;
    padding: 11px 13px;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  .c-top {
    display: flex;
    gap: 10px;
  }
  .well {
    flex: none;
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    padding: 0;
    border: 0;
    background: none;
  }
  button.well {
    cursor: pointer;
  }
  .c-id {
    flex: 1;
    min-width: 0;
  }
  .c-id :global(h3) {
    color: var(--text);
  }
  .card :global(p) {
    margin: 0;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card :global(p.hot) {
    color: var(--accent-hi);
  }
  .card :global(.c-bars) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 12px;
    margin-top: 3px;
  }
  .card :global(.c-bars .meter-row em) {
    width: 48px;
  }
  .card :global(.c-bars .meter-row > span) {
    width: auto;
    max-width: 96px;
  }
  .card :global(.c-conds) {
    margin-top: 6px;
  }
  .c-verbs {
    display: flex;
    gap: 4px;
    margin-top: 7px;
  }
  .c-verbs :global(.cbtn) {
    flex: 1;
    padding: 0 4px;
  }
</style>
